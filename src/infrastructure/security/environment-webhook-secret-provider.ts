/**
 * TX COMMERCIAL CORE — ENVIRONMENT WEBHOOK SECRET PROVIDER
 *
 * ⚠️  DEVELOPMENT / TEST ONLY.
 * Resolves webhook secrets from in-memory injection or environment variables.
 *
 * MUST NOT be instantiated in production. Restricted explicitly.
 * MUST NOT query any database column — the schema stores only a Vault reference ID
 * (webhook_vault_secret_id), never the raw secret material. Querying a
 * non-existent webhook_secret column would cause a runtime error.
 * Secret resolution from Vault is deferred to P0.3C.
 */

import { WebhookSecretProvider } from '../../application/ports/webhook-secret-provider.js';

export class EnvironmentWebhookSecretProvider implements WebhookSecretProvider {
  private readonly staticSecrets: Map<string, string>;

  constructor(staticSecrets?: Record<string, string> | Map<string, string>) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'EnvironmentWebhookSecretProvider is disabled in production. ' +
        'Configure a production Vault-backed WebhookSecretProvider (P0.3C).'
      );
    }

    if (staticSecrets instanceof Map) {
      this.staticSecrets = new Map(staticSecrets);
    } else if (staticSecrets) {
      this.staticSecrets = new Map(Object.entries(staticSecrets));
    } else {
      this.staticSecrets = new Map();
    }
  }

  /**
   * Registers an in-memory secret for testing or local development overrides.
   */
  public registerSecret(channelConnectionId: string, secret: string): void {
    this.staticSecrets.set(channelConnectionId, secret);
  }

  public async getWebhookSecret(channelConnectionId: string): Promise<string | null> {
    // 1. In-memory / injected secrets (highest priority — used in integration tests)
    if (this.staticSecrets.has(channelConnectionId)) {
      return this.staticSecrets.get(channelConnectionId)!;
    }

    // 2. Channel-specific environment variable (e.g. WAHA_WEBHOOK_SECRET_a2000000...)
    const envKey = `WAHA_WEBHOOK_SECRET_${channelConnectionId.replace(/-/g, '_')}`;
    if (process.env[envKey]) {
      return process.env[envKey]!;
    }

    // 3. Global fallback environment variable
    if (process.env.WAHA_WEBHOOK_SECRET) {
      return process.env.WAHA_WEBHOOK_SECRET;
    }

    // NOTE: No database fallback. The schema stores only webhook_vault_secret_id
    // (a Vault reference). Querying a non-existent webhook_secret column would fail.
    // Secret material resolution from Vault is implemented in P0.3C.
    return null;
  }
}
