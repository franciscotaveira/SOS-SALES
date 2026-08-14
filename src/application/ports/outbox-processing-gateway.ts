/**
 * TX COMMERCIAL CORE — OUTBOX PROCESSING GATEWAY PORT
 * Pure domain/application interface for claiming and completing outbox events.
 * Must NOT import Fastify, PostgreSQL, Supabase or framework code.
 * Implementors must NOT use SET ROLE, JWT injection or administrative pool connections.
 */

export interface OutboxEvent {
  id: string;
  workspaceId: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  claimToken: string;
  attempts: number;
}

export interface InboundChannelEventRow {
  id: string;
  workspaceId: string;
  channelConnectionId: string;
  provider: string;
  rawPayload: Record<string, unknown>;
}

export interface OutboxProcessingGateway {
  /**
   * Atomically claims up to `batchSize` pending outbox events for the given worker ID.
   * Returns an empty array when there is nothing to process.
   */
  claimBatch(params: {
    workerId: string;
    eventNames: string[];
    batchSize: number;
    leaseSeconds: number;
  }): Promise<OutboxEvent[]>;

  /**
   * Marks an outbox event as successfully processed using the fencing token.
   */
  completeEvent(params: {
    eventId: string;
    claimToken: string;
    workerId: string;
  }): Promise<void>;

  /**
   * Records a processing failure and increments the retry counter.
   * The event is re-queued or moved to the DLQ based on the retry policy.
   */
  failEvent(params: {
    eventId: string;
    claimToken: string;
    workerId: string;
    errorMessage: string;
    maxAttempts: number;
  }): Promise<void>;

  /**
   * Fetches a single inbound channel event row strictly by ID and workspace.
   * Returns null when the row does not exist (integrity guard).
   */
  fetchInboundChannelEvent(params: {
    inboundEventId: string;
    workspaceId: string;
    provider: string;
  }): Promise<InboundChannelEventRow | null>;

  /**
   * Executes the normalize_waha_inbound_message SQL procedure within the
   * same transactional boundary as the outbox event processing.
   */
  normalizeWahaInboundMessage(params: {
    inboundEventId: string;
    contactPhone: string;
    whatsappId: string | null;
    contactName: string | null;
    providerMessageId: string;
    textContent: string | null;
    mediaPayload: string | null;
    sentAt: Date;
  }): Promise<void>;
}
