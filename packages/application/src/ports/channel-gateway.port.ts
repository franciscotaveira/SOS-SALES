import type {
  ChannelDeliveryReceipt,
  ChannelProvider,
  NormalizedInboundEvent,
} from "@sos-sales/contracts";

export interface CredentialLease {
  readonly credentialId: string;
  readonly provider: ChannelProvider;
  readonly expiresAt?: string;
}

export interface ChannelInboundContext {
  readonly channelInstanceId: string;
  readonly workspaceId: string;
  readonly rawPayloadHash: string;
  readonly receivedAt?: string;
}

export interface OutboundMessageRequest {
  readonly workspaceId: string;
  readonly channelInstanceId: string;
  readonly recipientPhoneE164: string;
  readonly body: string;
  readonly mediaUrl?: string;
  readonly idempotencyKey: string;
}

export interface IChannelGateway {
  readonly provider: ChannelProvider;
  normalizeInbound(
    rawPayload: Record<string, unknown>,
    context: ChannelInboundContext
  ): NormalizedInboundEvent[];
  sendOutbound(
    request: OutboundMessageRequest,
    lease: CredentialLease
  ): Promise<ChannelDeliveryReceipt>;
}
