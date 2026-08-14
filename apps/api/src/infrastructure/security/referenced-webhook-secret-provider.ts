import { WebhookSecretProvider } from '../../application/ports/webhook-secret-provider.js';
import {
  WebhookSecretReferenceProvider,
  WebhookSecretResolver,
} from '../../application/ports/webhook-secret-resolver.js';

/**
 * Production-safe secret provider composition.
 *
 * The database-facing dependency can see only a reference ID. The resolver is
 * the sole dependency allowed to turn that reference into secret material.
 */
export class ReferencedWebhookSecretProvider implements WebhookSecretProvider {
  constructor(
    private readonly referenceProvider: WebhookSecretReferenceProvider,
    private readonly resolver: WebhookSecretResolver
  ) {}

  async getWebhookSecret(channelConnectionId: string): Promise<string | null> {
    const referenceId = await this.referenceProvider.getWebhookSecretReference(channelConnectionId);
    if (!referenceId) {
      return null;
    }

    return this.resolver.resolveWebhookSecret(referenceId);
  }
}
