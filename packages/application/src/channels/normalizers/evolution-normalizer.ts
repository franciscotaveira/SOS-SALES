import {
  type NormalizedInboundEvent,
  type MessageContentType,
  type MessageDeliveryStatus,
  type ChannelLifecycleEventType,
  InboundMessageEventSchema,
  DeliveryStatusEventSchema,
  ChannelLifecycleEventSchema,
} from "@sos-sales/contracts";
import type { ChannelInboundContext } from "../../ports/channel-gateway.port";

export class EvolutionNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvolutionNormalizationError";
  }
}

function jidToE164(jid: string): string {
  const clean = jid.split("@")[0] || jid;
  const digits = clean.replace(/\D/g, "");
  return `+${digits}`;
}

function resolveTimestamp(
  rawTimestamp: unknown,
  context: ChannelInboundContext
): { iso: string; epochSec: number } {
  if (rawTimestamp !== undefined && rawTimestamp !== null && rawTimestamp !== "") {
    const num = Number(rawTimestamp);
    if (!isNaN(num) && num > 0) {
      // Evolution timestamps can be in seconds or milliseconds
      const date = new Date(num > 10_000_000_000 ? num : num * 1000);
      if (!isNaN(date.getTime())) {
        return { iso: date.toISOString(), epochSec: Math.floor(date.getTime() / 1000) };
      }
    }
    const date = new Date(String(rawTimestamp));
    if (!isNaN(date.getTime())) {
      return {
        iso: date.toISOString(),
        epochSec: Math.floor(date.getTime() / 1000),
      };
    }
  }

  if (context.receivedAt) {
    const date = new Date(context.receivedAt);
    if (!isNaN(date.getTime())) {
      return {
        iso: date.toISOString(),
        epochSec: Math.floor(date.getTime() / 1000),
      };
    }
  }

  throw new EvolutionNormalizationError(
    "EVOLUTION_NORMALIZATION_ERROR: Missing or invalid timestamp in payload and no explicit receivedAt provided"
  );
}

/**
 * Pure, deterministic normalizer for Evolution API v2 webhooks.
 *
 * Truth in Data guarantees:
 * - Uses rawPayloadHash provided directly from rawBody ingress context.
 * - Parses messages.upsert, messages.update (ACKs), and connection.update events.
 * - Completely deterministic: no network, database or secrets involved.
 */
export class EvolutionWebhookNormalizer {
  static normalize(
    rawPayload: Record<string, unknown>,
    context: ChannelInboundContext
  ): NormalizedInboundEvent[] {
    if (
      !context.rawPayloadHash ||
      !/^[0-9a-f]{64}$/.test(context.rawPayloadHash)
    ) {
      throw new EvolutionNormalizationError(
        "EVOLUTION_NORMALIZATION_ERROR: ChannelInboundContext.rawPayloadHash must be a 64-character lowercase hex string"
      );
    }

    const rawPayloadHash = context.rawPayloadHash;
    const eventType = String(rawPayload.event || "").trim();
    const data = (rawPayload.data ?? rawPayload) as Record<string, unknown>;

    // 1. Process Message Upsert (Inbound & Outbound messages)
    if (eventType === "messages.upsert") {
      const key = data.key as Record<string, unknown> | undefined;
      if (!key || typeof key !== "object") {
        throw new EvolutionNormalizationError(
          "EVOLUTION_NORMALIZATION_ERROR: Missing key object in messages.upsert"
        );
      }

      const externalMessageId = String(key.id || "").trim();
      if (!externalMessageId) {
        throw new EvolutionNormalizationError(
          "EVOLUTION_NORMALIZATION_ERROR: Missing or empty key.id in messages.upsert"
        );
      }

      const fromMe = Boolean(key.fromMe);
      const remoteJid = String(key.remoteJid || "").trim();
      if (!remoteJid) {
        throw new EvolutionNormalizationError(
          "EVOLUTION_NORMALIZATION_ERROR: Missing remoteJid in messages.upsert"
        );
      }

      // Ignore broadcast status / group messages for MVP direct chat
      if (remoteJid.includes("@broadcast") || remoteJid.includes("@g.us")) {
        return [];
      }

      const contactPhoneE164 = jidToE164(remoteJid);
      if (!contactPhoneE164 || contactPhoneE164 === "+") {
        throw new EvolutionNormalizationError(
          "EVOLUTION_NORMALIZATION_ERROR: Invalid phone number derived from remoteJid"
        );
      }

      const channelPhoneCandidate = String(data.sender || data.participant || rawPayload.sender || "").trim();
      const channelPhonePart = channelPhoneCandidate ? channelPhoneCandidate.split("@")[0] : undefined;
      const channelPhoneClean = channelPhonePart ? channelPhonePart.replace(/\D/g, "") : "";
      const channelPhoneE164 = channelPhoneClean.length >= 8 ? `+${channelPhoneClean}` : "+5511999990000";

      const senderPhoneE164 = fromMe
        ? channelPhoneE164
        : contactPhoneE164;
      const recipientPhoneE164 = fromMe
        ? contactPhoneE164
        : channelPhoneE164;

      const { iso: timestamp } = resolveTimestamp(
        data.messageTimestamp,
        context
      );

      // Extract body & content type from message structure
      const msgObj = (data.message || {}) as Record<string, any>;
      let contentType: MessageContentType = "text";
      let body: string | undefined = undefined;
      let mediaUrl: string | undefined = undefined;

      if (msgObj.conversation) {
        contentType = "text";
        body = String(msgObj.conversation);
      } else if (msgObj.extendedTextMessage?.text) {
        contentType = "text";
        body = String(msgObj.extendedTextMessage.text);
      } else if (msgObj.imageMessage) {
        contentType = "image";
        body = msgObj.imageMessage.caption ? String(msgObj.imageMessage.caption) : undefined;
        mediaUrl = msgObj.imageMessage.url ? String(msgObj.imageMessage.url) : undefined;
      } else if (msgObj.audioMessage) {
        contentType = "audio";
        mediaUrl = msgObj.audioMessage.url ? String(msgObj.audioMessage.url) : undefined;
      } else if (msgObj.videoMessage) {
        contentType = "video";
        body = msgObj.videoMessage.caption ? String(msgObj.videoMessage.caption) : undefined;
        mediaUrl = msgObj.videoMessage.url ? String(msgObj.videoMessage.url) : undefined;
      } else if (msgObj.documentMessage) {
        contentType = "document";
        body = msgObj.documentMessage.fileName || msgObj.documentMessage.title;
        mediaUrl = msgObj.documentMessage.url ? String(msgObj.documentMessage.url) : undefined;
      } else {
        // Fallback for unknown message structures
        contentType = "text";
        body = data.pushName ? `Mensagem de ${data.pushName}` : "Mensagem recebida";
      }

      const senderName = typeof data.pushName === "string" ? data.pushName.trim() : undefined;

      const event = InboundMessageEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "evolution",
        externalMessageId,
        senderPhoneE164,
        recipientPhoneE164,
        contentType,
        body: body || undefined,
        mediaUrl: mediaUrl || undefined,
        timestamp,
        rawPayloadHash,
        metadata: {
          direction: fromMe ? "outbound" : "inbound",
          fromMe,
          instance: rawPayload.instance,
          ...(senderName ? { senderName } : {}),
        },
      });

      return [
        {
          kind: "message",
          event,
        },
      ];
    }

    // 2. Process Message Status (ACK Update)
    if (eventType === "messages.update") {
      const key = data.key as Record<string, unknown> | undefined;
      const externalMessageId = String(key?.id || data.id || "").trim();
      if (!externalMessageId) {
        return [];
      }

      const remoteJid = String(key?.remoteJid || data.remoteJid || "").trim();
      const recipientPhoneE164 = remoteJid ? jidToE164(remoteJid) : "+5500000000000";

      const rawStatus = String(data.status || "").toUpperCase();
      let status: MessageDeliveryStatus = "sent";

      if (rawStatus === "READ" || rawStatus === "PLAYED") {
        status = "read";
      } else if (rawStatus === "DELIVERY_ACK" || rawStatus === "DELIVERED") {
        status = "delivered";
      } else if (rawStatus === "ERROR" || rawStatus === "FAILED") {
        status = "failed";
      } else if (rawStatus === "SERVER_ACK" || rawStatus === "PENDING") {
        status = "sent";
      }

      const { iso: timestamp, epochSec } = resolveTimestamp(
        data.messageTimestamp,
        context
      );

      const externalEventId = `v1:evolution:${externalMessageId}:${status}:${epochSec}`;

      const event = DeliveryStatusEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "evolution",
        externalMessageId,
        externalEventId,
        recipientPhoneE164,
        status,
        timestamp,
        rawPayloadHash,
      });

      return [
        {
          kind: "delivery_status",
          event,
        },
      ];
    }

    // 3. Process Connection Lifecycle
    if (eventType === "connection.update") {
      const state = String(data.state || "").toLowerCase();
      let lifecycleType: ChannelLifecycleEventType = "connected";

      if (state === "close" || state === "disconnected") {
        lifecycleType = "disconnected";
      } else if (state === "open" || state === "connected") {
        lifecycleType = "connected";
      } else if (state === "refused" || state === "unauthorized") {
        lifecycleType = "auth_failure";
      } else {
        return [];
      }

      const { iso: timestamp } = resolveTimestamp(undefined, context);

      const event = ChannelLifecycleEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "evolution",
        eventType: lifecycleType,
        details: { state, instance: rawPayload.instance },
        timestamp,
      });

      return [
        {
          kind: "lifecycle",
          event,
        },
      ];
    }

    return [];
  }
}
