import crypto from "node:crypto";
import type {
  ChannelDeliveryReceipt,
  ChannelProvider,
  NormalizedInboundEvent,
} from "@sos-sales/contracts";
import type {
  ChannelInboundContext,
  CredentialLease,
  IChannelGateway,
  OutboundMessageRequest,
} from "../../ports/channel-gateway.port";
import { WabaWebhookNormalizer } from "../normalizers/waba-normalizer";
import { WahaWebhookNormalizer } from "../normalizers/waha-normalizer";

export class MockChannelGateway implements IChannelGateway {
  public sentMessages: Array<{
    request: OutboundMessageRequest;
    lease: CredentialLease;
  }> = [];

  public shouldFailNext = false;
  public failureError = "Simulated network timeout";

  constructor(public readonly provider: ChannelProvider = "meta_waba") {}

  normalizeInbound(
    rawPayload: Record<string, unknown>,
    context: ChannelInboundContext
  ): NormalizedInboundEvent[] {
    if (this.provider === "meta_waba") {
      return WabaWebhookNormalizer.normalize(rawPayload, context);
    }
    if (this.provider === "waha") {
      return WahaWebhookNormalizer.normalize(rawPayload, context);
    }
    throw new Error(
      `MockChannelGateway does not have normalizer for provider '${this.provider}'`
    );
  }

  async sendOutbound(
    request: OutboundMessageRequest,
    lease: CredentialLease
  ): Promise<ChannelDeliveryReceipt> {
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      return {
        externalMessageId: `failed_${crypto.randomUUID()}`,
        status: "failed",
        timestamp: new Date().toISOString(),
        error: this.failureError,
      };
    }

    this.sentMessages.push({ request, lease });

    return {
      externalMessageId: `mock_msg_${crypto.randomUUID()}`,
      status: "sent",
      timestamp: new Date().toISOString(),
    };
  }
}
