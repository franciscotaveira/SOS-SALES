import { describe, expect, it, vi } from 'vitest';
import { ReferencedWebhookSecretProvider } from '../../src/infrastructure/security/referenced-webhook-secret-provider.js';
import {
  WebhookSecretReferenceProvider,
  WebhookSecretResolver,
} from '../../src/application/ports/webhook-secret-resolver.js';

describe('ReferencedWebhookSecretProvider', () => {
  it('resolves secret material only after receiving an opaque reference', async () => {
    const references: WebhookSecretReferenceProvider = {
      getWebhookSecretReference: vi.fn().mockResolvedValue('opaque-vault-reference'),
    };
    const resolver: WebhookSecretResolver = {
      resolveWebhookSecret: vi.fn().mockResolvedValue('webhook-secret-material'),
    };
    const provider = new ReferencedWebhookSecretProvider(references, resolver);

    await expect(provider.getWebhookSecret('channel-1')).resolves.toBe('webhook-secret-material');
    expect(resolver.resolveWebhookSecret).toHaveBeenCalledWith('opaque-vault-reference');
  });

  it('does not invoke the resolver when the channel has no secret reference', async () => {
    const references: WebhookSecretReferenceProvider = {
      getWebhookSecretReference: vi.fn().mockResolvedValue(null),
    };
    const resolver: WebhookSecretResolver = {
      resolveWebhookSecret: vi.fn(),
    };
    const provider = new ReferencedWebhookSecretProvider(references, resolver);

    await expect(provider.getWebhookSecret('channel-without-secret')).resolves.toBeNull();
    expect(resolver.resolveWebhookSecret).not.toHaveBeenCalled();
  });
});
