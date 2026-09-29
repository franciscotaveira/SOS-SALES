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
import { detectMediaType } from "../security/ssrf-guard";

export class WahaNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WahaNormalizationError";
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
      const date = new Date(num * 1000);
      if (!isNaN(date.getTime())) {
        return { iso: date.toISOString(), epochSec: num };
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

  throw new WahaNormalizationError(
    "WAHA_NORMALIZATION_ERROR: Missing or invalid timestamp in payload and no explicit receivedAt provided"
  );
}

/**
 * Pure, deterministic normalizer for WAHA (WhatsApp HTTP API) webhooks.
 *
 * Truth in Data guarantees:
 * - Uses rawPayloadHash provided directly from rawBody ingress context.
 * - Rejects empty IDs, invalid phone numbers, or missing event payloads.
 * - Completely deterministic: no Date.now() fallback, no network, database or secrets involved.
 */
export class WahaWebhookNormalizer {
  static normalize(
    rawPayload: Record<string, unknown>,
    context: ChannelInboundContext
  ): NormalizedInboundEvent[] {
    if (
      !context.rawPayloadHash ||
      !/^[0-9a-f]{64}$/.test(context.rawPayloadHash)
    ) {
      throw new WahaNormalizationError(
        "WAHA_NORMALIZATION_ERROR: ChannelInboundContext.rawPayloadHash must be a 64-character lowercase hex string"
      );
    }

    const rawPayloadHash = context.rawPayloadHash;
    const eventType = String(rawPayload.event || "").trim();
    const payload = rawPayload.payload as Record<string, unknown> | undefined;

    if (!payload || typeof payload !== "object") {
      throw new WahaNormalizationError(
        "WAHA_NORMALIZATION_ERROR: Missing payload object in event"
      );
    }

    // 1. Process ACK (Delivery Status) Event
    if (eventType === "message.ack") {
      const externalMessageId = String(payload.id || "").trim();
      if (!externalMessageId) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty payload.id in message.ack"
        );
      }

      const rawTo = String(payload.to || "").trim();
      if (!rawTo) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty payload.to in message.ack"
        );
      }

      const recipientPhoneE164 = jidToE164(rawTo);
      if (!recipientPhoneE164 || recipientPhoneE164 === "+") {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Invalid recipient phone number in message.ack"
        );
      }

      const ackValue = Number(payload.ack);
      if (isNaN(ackValue)) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Invalid or non-numeric ack value in message.ack"
        );
      }

      let status: MessageDeliveryStatus = "sent";
      if (ackValue === 2) {
        status = "delivered";
      } else if (ackValue >= 3) {
        status = "read";
      } else if (ackValue < 0) {
        status = "failed";
      }

      const { iso: timestamp, epochSec } = resolveTimestamp(
        payload.timestamp,
        context
      );

      // Rule: Versioned external_event_id derivation for deduplication
      const externalEventId = `v1:waha:${externalMessageId}:${ackValue}:${epochSec}`;

      const event = DeliveryStatusEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
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

    // 2. Process Message Event
    if (eventType === "message") {
      const externalMessageId = String(payload.id || "").trim();
      if (!externalMessageId) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty payload.id in message"
        );
      }

      const rawFrom = String(payload.from || "").trim();
      const rawTo = String(payload.to || "").trim();
      if (!rawFrom || !rawTo) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty sender/recipient in message"
        );
      }

      const senderPhoneE164 = jidToE164(rawFrom);
      const recipientPhoneE164 = jidToE164(rawTo);
      if (
        !senderPhoneE164 ||
        senderPhoneE164 === "+" ||
        !recipientPhoneE164 ||
        recipientPhoneE164 === "+"
      ) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Invalid sender or recipient phone number in message"
        );
      }

      const { iso: timestamp } = resolveTimestamp(payload.timestamp, context);

      let contentType: MessageContentType = "text";
      const body: string | undefined = payload.body
        ? String(payload.body)
        : undefined;
      const mediaUrl: string | undefined = payload.mediaUrl
        ? String(payload.mediaUrl)
        : undefined;

      if (payload.hasMedia) {
        contentType = mediaUrl ? detectMediaType(mediaUrl) : "image";
      }

      const event = InboundMessageEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
        externalMessageId,
        senderPhoneE164,
        recipientPhoneE164,
        contentType,
        body,
        mediaUrl,
        timestamp,
        rawPayloadHash,
        metadata: {
          wahaSession: payload.session,
        },
      });

      return [
        {
          kind: "message",
          event,
        },
      ];
    }

    // 3. Process Session Lifecycle Events
    if (eventType === "session.status") {
      const rawStatus = String(payload.status || "").toUpperCase();
      let eventTypeEnum: ChannelLifecycleEventType | undefined;
      if (rawStatus === "WORKING" || rawStatus === "CONNECTED" || rawStatus === "ONLINE") {
        eventTypeEnum = "connected";
      } else if (
        rawStatus === "STOPPED" ||
        rawStatus === "DISCONNECTED" ||
        rawStatus === "FAILED" ||
        rawStatus === "OFFLINE"
      ) {
        eventTypeEnum = "disconnected";
      } else if (rawStatus === "SCAN_QR_CODE") {
        eventTypeEnum = "qr_received";
      }

      if (eventTypeEnum) {
        const { iso: timestamp } = resolveTimestamp(payload.timestamp, context);
        const event = ChannelLifecycleEventSchema.parse({
          channelInstanceId: context.channelInstanceId,
          workspaceId: context.workspaceId,
          provider: "waha",
          eventType: eventTypeEnum,
          details: {
            session: payload.name || payload.session,
            rawStatus,
          },
          timestamp,
        });

        return [
          {
            kind: "lifecycle",
            event,
          },
        ];
      }
    }

    if (eventType === "session.qr") {
      const qr = typeof payload.qr === "string" ? payload.qr : undefined;
      if (!qr) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty qr code in session.qr event"
        );
      }

      const { iso: timestamp } = resolveTimestamp(payload.timestamp, context);
      const event = ChannelLifecycleEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
        eventType: "qr_received",
        details: {
          session: payload.name || payload.session,
          qr,
        },
        timestamp,
      });

      return [
        {
          kind: "lifecycle",
          event,
        },
      ];
    }

    if (eventType === "session.auth_failure" || eventType === "session.unpaired") {
      const { iso: timestamp } = resolveTimestamp(payload.timestamp, context);
      const event = ChannelLifecycleEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
        eventType: "auth_failure",
        details: {
          session: payload.name || payload.session,
          reason: payload.reason || "session_unpaired",
        },
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

  static normalizeBatch = WahaWebhookNormalizer.normalize;
}
