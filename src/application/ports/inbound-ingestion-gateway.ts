/**
 * TX COMMERCIAL CORE — INBOUND INGESTION GATEWAY PORT
 * Pure domain/application interface for storing raw channel webhook envelopes.
 * Must NOT import Fastify, PostgreSQL, Supabase or framework code.
 */

export interface IngestChannelEventInput {
  channelConnectionId: string;
  providerEventId: string;
  eventType: string;
  rawPayload: Record<string, unknown>;
}

export interface IngestChannelEventResult {
  inboundEventId: string;
  workspaceId: string;
  isDuplicate: boolean;
}

export interface InboundIngestionGateway {
  ingestChannelEvent(input: IngestChannelEventInput): Promise<IngestChannelEventResult>;
}
