import { z } from "zod";

export const ChannelProviderEnum = z.enum([
  "meta_waba",
  "waha",
  "evolution",
  "meta_messenger",
  "meta_instagram",
]);
export type ChannelProvider = z.infer<typeof ChannelProviderEnum>;

export const MessageDirectionEnum = z.enum(["inbound", "outbound"]);
export type MessageDirection = z.infer<typeof MessageDirectionEnum>;

export const MessageContentTypeEnum = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "location",
  "template",
  "interactive",
]);
export type MessageContentType = z.infer<typeof MessageContentTypeEnum>;

export const InboundEnvelopeSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  provider: ChannelProviderEnum,
  providerMessageId: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  rawPayload: z.record(z.unknown()),
  signatureVerified: z.boolean(),
  idempotencyKey: z.string(),
  receivedAt: z.string().datetime(),
});
export type InboundEnvelope = z.infer<typeof InboundEnvelopeSchema>;

export const NormalizedMessageSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  journeyId: z.string().uuid(),
  threadId: z.string().uuid(),
  direction: MessageDirectionEnum,
  contentType: MessageContentTypeEnum,
  body: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  providerMessageId: z.string(),
  senderId: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;
