/**
 * Resolves opaque secret references held outside the transactional database.
 * Implementations may use Supabase Vault, a cloud KMS, or a local test double.
 * The reference is never itself secret material.
 */
export interface WebhookSecretResolver {
  resolveWebhookSecret(referenceId: string): Promise<string | null>;
}

/**
 * Returns only the opaque Vault reference associated with a channel connection.
 * It must never return raw secret material.
 */
export interface WebhookSecretReferenceProvider {
  getWebhookSecretReference(channelConnectionId: string): Promise<string | null>;
}
