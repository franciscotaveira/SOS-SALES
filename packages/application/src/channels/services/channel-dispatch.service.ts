import crypto from "node:crypto";
import type { WabaTemplateMessage } from "@sos-sales/contracts";
import type { ChannelInstanceRecord } from "@sos-sales/database";
import type { ChannelAdapterRegistry } from "../registry/channel-adapter.registry";
import type { ChannelSendResult, OutboundSendParams } from "../adapters/channel-adapter.interface";
import type { ISigningSecretResolver } from "./signature-verification.service";
import {
  ChannelInstanceNotFoundError,
  ChannelInstanceInactiveError,
  ChannelAdapterNotFoundError,
  ChannelCapabilityUnsupportedError,
  ChannelDispatchFailedError,
  ChannelProviderUnavailableError,
} from "../errors/channel-dispatch.errors";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface IChannelInstanceRepository {
  getById(workspaceId: string, channelInstanceId: string): Promise<ChannelInstanceRecord>;
}

export interface IChannelDispatchLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface OutboundMessagePayload {
  readonly recipientE164: string;
  readonly body: string;
  readonly mediaUrl?: string | null;
  readonly template?: WabaTemplateMessage | null;
  readonly idempotencyKey: string;
  readonly commandId?: string;
  readonly messageId?: string;
  readonly lastInboundMessageAt?: Date | null;
  readonly signal?: AbortSignal;
}

export interface ChannelDispatchServiceOptions {
  readonly channelInstanceRepo: IChannelInstanceRepository;
  readonly adapterRegistry: ChannelAdapterRegistry;
  readonly secretResolver: ISigningSecretResolver;
  readonly logger?: IChannelDispatchLogger;
}

/**
 * Masks E.164 phone number for secure logging without PII leakage.
 * Example: +5511999998888 -> +5511*****8888
 */
export function maskRecipientPhone(phone: string): string {
  if (!phone || typeof phone !== "string") return "***";
  const trimmed = phone.trim();
  if (trimmed.length <= 6) return "***";
  const prefix = trimmed.slice(0, 5);
  const suffix = trimmed.slice(-4);
  return `${prefix}*****${suffix}`;
}

export class ChannelDispatchService {
  private readonly repo: IChannelInstanceRepository;
  private readonly registry: ChannelAdapterRegistry;
  private readonly secretResolver: ISigningSecretResolver;
  private readonly logger?: IChannelDispatchLogger;

  constructor(options: ChannelDispatchServiceOptions) {
    this.repo = options.channelInstanceRepo;
    this.registry = options.adapterRegistry;
    this.secretResolver = options.secretResolver;
    this.logger = options.logger;
  }

  /**
   * Dispatches an outbound message explicitly through the specified channel instance.
   *
   * Invariants:
   * 1. Explicit Routing: strictly resolves the target line by (workspaceId, channelInstanceId).
   *    Never selects the "first active instance" or any arbitrary instance.
   * 2. Fail-Closed Policy: never automatically falls back between WAHA and Meta WABA.
   * 3. Tenant-First Isolation: enforces workspace ownership via ChannelInstanceRepository.
   * 4. Observability Hygiene: logs are sanitized; no raw tokens, secrets, or unmasked PII.
   */
  async dispatchOutbound(
    workspaceId: string,
    channelInstanceId: string,
    payload: OutboundMessagePayload
  ): Promise<ChannelSendResult> {
    // 1. Validate workspace and channelInstanceId
    if (!UUID_REGEX.test(workspaceId) || !UUID_REGEX.test(channelInstanceId)) {
      throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
    }

    // 2. Load instance explicitly with getById
    let instance: ChannelInstanceRecord;
    try {
      instance = await this.repo.getById(workspaceId, channelInstanceId);
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "CHANNEL_INSTANCE_NOT_FOUND") {
        throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
      }
      throw err;
    }

    // 3. Reject inactive instance
    if (!instance.is_active) {
      this.logger?.warn("Outbound dispatch rejected: channel instance is inactive", {
        workspaceId,
        channelInstanceId,
        provider: instance.provider,
      });
      throw new ChannelInstanceInactiveError(channelInstanceId, workspaceId);
    }

    // 4. Resolve adapter by instance provider
    if (!this.registry.has(instance.provider)) {
      this.logger?.error("Outbound dispatch rejected: adapter not found for provider", {
        workspaceId,
        channelInstanceId,
        provider: instance.provider,
      });
      throw new ChannelAdapterNotFoundError(instance.provider);
    }
    const adapter = this.registry.get(instance.provider);

    // 5. Validate capabilities
    if (payload.template && instance.provider !== "meta_waba") {
      throw new ChannelCapabilityUnsupportedError(
        "template",
        instance.provider,
        "Template messages are only supported by meta_waba provider"
      );
    }

    if (!payload.body?.trim() && !payload.mediaUrl && !payload.template) {
      throw new ChannelCapabilityUnsupportedError(
        "empty_content",
        instance.provider,
        "Outbound message must contain either text body, mediaUrl, or template"
      );
    }

    // 6. Sanitized observability log (zero PII, zero tokens/hashes)
    const maskedPhone = maskRecipientPhone(payload.recipientE164);
    this.logger?.info("Initiating outbound channel dispatch", {
      workspaceId,
      channelInstanceId: instance.id,
      provider: instance.provider,
      recipientMasked: maskedPhone,
      hasMedia: Boolean(payload.mediaUrl),
      hasTemplate: Boolean(payload.template),
      idempotencyKey: payload.idempotencyKey,
    });

    const sendParams: OutboundSendParams = {
      workspaceId,
      channelInstanceId: instance.id,
      commandId: payload.commandId || crypto.randomUUID(),
      messageId: payload.messageId || crypto.randomUUID(),
      recipientE164: payload.recipientE164,
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      template: payload.template,
      idempotencyKey: payload.idempotencyKey,
      lastInboundMessageAt: payload.lastInboundMessageAt,
      signal: payload.signal,
    };

    // 7. Send using exclusively the requested instance (fail-closed)
    let sendResult: ChannelSendResult;
    try {
      sendResult = await adapter.sendMessage(sendParams, this.secretResolver);
    } catch (err) {
      // Safe error wrapping: preserve cause internally, expose safe message
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger?.error("Channel adapter threw an exception during dispatch", {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        error: errorMsg,
      });

      if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("Network error")) {
        throw new ChannelProviderUnavailableError(instance.provider, "Network connectivity error connecting to channel engine", err);
      }

      throw new ChannelDispatchFailedError(`Dispatch failed on provider '${instance.provider}': ${errorMsg}`, err);
    }

    // 8. Result inspection and logging
    if (sendResult.success) {
      this.logger?.info("Outbound channel dispatch succeeded", {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        externalMessageId: sendResult.externalMessageId,
      });
    } else {
      this.logger?.warn("Outbound channel dispatch rejected by provider", {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        category: sendResult.category,
        errorCode: sendResult.errorCode,
        // errorMessage is safe provider message, not raw secrets
        errorMessage: sendResult.errorMessage,
      });
    }

    return sendResult;
  }
}
