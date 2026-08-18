import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EnvironmentWebhookSecretProvider } from '../../src/infrastructure/security/environment-webhook-secret-provider.js';

describe('EnvironmentWebhookSecretProvider', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGlobalSecret = process.env.WAHA_WEBHOOK_SECRET;
  const channelId = 'a2000000-0000-0000-0000-000000000001';
  const channelEnvKey = `WAHA_WEBHOOK_SECRET_${channelId.replace(/-/g, '_')}`;

  beforeEach(() => {
    delete process.env.WAHA_WEBHOOK_SECRET;
    delete process.env[channelEnvKey];
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalGlobalSecret === undefined) {
      delete process.env.WAHA_WEBHOOK_SECRET;
    } else {
      process.env.WAHA_WEBHOOK_SECRET = originalGlobalSecret;
    }
    delete process.env[channelEnvKey];
  });

  it('refuses to construct when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => new EnvironmentWebhookSecretProvider()).toThrow(/disabled in production/);
  });

  it('resolves a secret registered via the constructor Record', async () => {
    const provider = new EnvironmentWebhookSecretProvider({ [channelId]: 'record-secret' });

    await expect(provider.getWebhookSecret(channelId)).resolves.toBe('record-secret');
  });

  it('resolves a secret registered via the constructor Map', async () => {
    const provider = new EnvironmentWebhookSecretProvider(new Map([[channelId, 'map-secret']]));

    await expect(provider.getWebhookSecret(channelId)).resolves.toBe('map-secret');
  });

  it('resolves a secret registered dynamically via registerSecret', async () => {
    const provider = new EnvironmentWebhookSecretProvider();
    provider.registerSecret(channelId, 'registered-secret');

    await expect(provider.getWebhookSecret(channelId)).resolves.toBe('registered-secret');
  });

  it('falls back to a channel-specific environment variable when no static secret is registered', async () => {
    process.env[channelEnvKey] = 'channel-env-secret';
    const provider = new EnvironmentWebhookSecretProvider();

    await expect(provider.getWebhookSecret(channelId)).resolves.toBe('channel-env-secret');
  });

  it('falls back to the global WAHA_WEBHOOK_SECRET when no channel-specific value exists', async () => {
    process.env.WAHA_WEBHOOK_SECRET = 'global-env-secret';
    const provider = new EnvironmentWebhookSecretProvider();

    await expect(provider.getWebhookSecret(channelId)).resolves.toBe('global-env-secret');
  });

  it('returns null when no secret is configured through any source', async () => {
    const provider = new EnvironmentWebhookSecretProvider();

    await expect(provider.getWebhookSecret(channelId)).resolves.toBeNull();
  });

  it('prioritizes in-memory secrets over the channel-specific environment variable', async () => {
    process.env[channelEnvKey] = 'channel-env-secret';
    const provider = new EnvironmentWebhookSecretProvider({ [channelId]: 'in-memory-secret' });

    await expect(provider.getWebhookSecret(channelId)).resolves.toBe('in-memory-secret');
  });

  it('prioritizes the channel-specific environment variable over the global fallback', async () => {
    process.env[channelEnvKey] = 'channel-env-secret';
    process.env.WAHA_WEBHOOK_SECRET = 'global-env-secret';
    const provider = new EnvironmentWebhookSecretProvider();

    await expect(provider.getWebhookSecret(channelId)).resolves.toBe('channel-env-secret');
  });
});
