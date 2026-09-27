import type { ISigningSecretResolver } from "../services/signature-verification.service";
import type { WabaTemplateMessage } from "@sos-sales/contracts";

export interface OutboundSendParams {
  readonly workspaceId: string;
  readonly channelInstanceId: string;
  readonly commandId: string;
  readonly messageId: string;
  readonly recipientE164: string;
  readonly body: string;
  readonly mediaUrl?: string | null;
  readonly template?: WabaTemplateMessage | null;
  readonly idempotencyKey: string;
  readonly lastInboundMessageAt?: Date | null;
  readonly signal?: AbortSignal;
}

export type ChannelSendResult =
  | {
      readonly success: true;
      readonly externalMessageId: string;
      readonly sentAt: Date;
    }
  | {
      readonly success: false;
      readonly category: "transient";
      readonly errorCode: string;
      readonly errorMessage: string;
      readonly retryAfterSeconds?: number;
    }
  | {
      readonly success: false;
      readonly category: "permanent";
      readonly errorCode: string;
      readonly errorMessage: string;
      readonly retryAfterSeconds?: number;
    }
  | {
      readonly success: false;
      readonly category: "ambiguous";
      readonly errorCode: string;
      readonly errorMessage: string;
      readonly retryAfterSeconds?: number;
    };

export interface IChannelAdapter {
  readonly provider: "meta_waba" | "waha" | "evolution";
  sendMessage(
    params: OutboundSendParams,
    secretResolver: ISigningSecretResolver
  ): Promise<ChannelSendResult>;
}
