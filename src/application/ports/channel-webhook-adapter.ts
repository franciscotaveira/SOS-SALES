/**
 * TX COMMERCIAL CORE — CHANNEL WEBHOOK ADAPTER PORT
 * Pure domain/application interface for channel webhook normalization and signature verification.
 * Must NOT import Fastify, PostgreSQL, Supabase or framework code.
 */

export interface VerifiedWebhookEvent<T = Record<string, unknown>> {
  provider: string;
  providerEventId: string;
  eventType: string;
  timestamp: Date;
  rawPayload: T;
}

export interface NormalizedInboundMessage {
  providerMessageId: string;
  contactPhone: string; // Formato E.164 (+5549999999999)
  whatsappId?: string; // e.g. 5549999112233@c.us
  contactName?: string;
  textContent?: string;
  mediaPayload?: Record<string, unknown>;
  sentAt: Date;
  isFromMe: boolean;
}

export type InboundMessageParseResult =
  | { kind: 'PARSED'; message: NormalizedInboundMessage }
  | { kind: 'IGNORED'; reason: string }
  | { kind: 'UNRESOLVED_IDENTITY'; lid: string }
  | { kind: 'INVALID'; error: string };

export interface VerifySignatureParams {
  rawBody: Buffer | string;
  signatureHeader?: string;
  algorithmHeader?: string;
  timestampHeader?: string;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

export interface ChannelWebhookAdapter {
  readonly providerName: string;

  /**
   * Verifies the authenticity and freshness (anti-replay) of the incoming webhook payload.
   */
  verifySignature(params: VerifySignatureParams): VerificationResult;

  /**
   * Extracts a stable provider event ID, event type and timestamp from the raw webhook payload.
   * For message events, providerEventId is formatted as `message:${messageId}`.
   */
  extractEvent(rawBody: Buffer | string | Record<string, unknown>): VerifiedWebhookEvent;

  /**
   * Normalizes an inbound message payload into a structured result.
   * Differentiates PARSED messages, IGNORED events (outbound, groups, status broadcasts)
   * and INVALID malformed messages (missing ID, non-E.164). A @lid is returned
   * for provider-backed resolution and is never converted into a guessed phone.
   */
  parseInboundMessage(rawPayload: Record<string, unknown>): InboundMessageParseResult;
}
