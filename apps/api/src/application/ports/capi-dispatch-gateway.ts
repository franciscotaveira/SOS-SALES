/**
 * TX COMMERCIAL CORE — CAPI (CONVERSIONS API) DISPATCH GATEWAY PORT
 *
 * Application interface for sending server-side Meta CAPI Purchase events
 * with cryptographic hashing (SHA-256) of PII and idempotent event_id fencing.
 */

export interface CapiPurchaseEventPayload {
  outcomeId: string;
  workspaceId: string;
  journeyId: string;
  revenueMinor: number;
  currency: string;
  pixelId: string;
  phone?: string;
  email?: string;
  occurredAt?: Date | string;
  testEventCode?: string;
}

export type CapiDispatchResult =
  | { success: true; capiEventId: string; fbtraceId?: string; rawResponse?: unknown }
  | { success: false; kind: 'FATAL'; errorCode: string; errorMessage: string }
  | { success: false; kind: 'RETRYABLE'; errorCode: string; errorMessage: string };

export interface CapiDispatchGateway {
  sendPurchaseEvent(
    event: CapiPurchaseEventPayload,
    accessToken?: string,
  ): Promise<CapiDispatchResult>;
}
