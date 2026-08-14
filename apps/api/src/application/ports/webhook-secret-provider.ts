/**
 * TX COMMERCIAL CORE — WEBHOOK SECRET PROVIDER PORT
 * Pure domain/application interface for resolving channel connection webhook secrets.
 * Must NOT import Fastify, PostgreSQL, Supabase or framework code.
 */

export interface WebhookSecretProvider {
  /**
   * Retrieves the raw webhook secret configured for a specific channel connection.
   * Returns null if channel connection does not exist or has no secret configured.
   */
  getWebhookSecret(channelConnectionId: string): Promise<string | null>;
}
