import type { NormalizedMessage } from "@sos-sales/contracts";

export interface OutboundMessageRequest {
  workspaceId: string;
  journeyId: string;
  recipientPhone: string;
  body: string;
  mediaUrl?: string;
  idempotencyKey: string;
}

export interface OutboundDeliveryReceipt {
  providerMessageId: string;
  status: "sent" | "delivered" | "failed";
  timestamp: string;
}

export interface IChannelGateway {
  verifySignature(rawBody: string | Uint8Array, signature: string, secret: string): boolean;
  normalizeInbound(rawPayload: Record<string, unknown>, workspaceId: string): NormalizedMessage;
  sendOutbound(request: OutboundMessageRequest): Promise<OutboundDeliveryReceipt>;
}
