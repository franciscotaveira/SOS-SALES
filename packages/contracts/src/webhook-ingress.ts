import { z } from "zod";

export const WebhookChallengeQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.challenge": z.string().min(1).max(256),
  "hub.verify_token": z.string().min(1).max(256),
});
export type WebhookChallengeQuery = z.infer<typeof WebhookChallengeQuerySchema>;

export const WebhookEndpointParamsSchema = z.object({
  endpointToken: z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});
export type WebhookEndpointParams = z.infer<typeof WebhookEndpointParamsSchema>;

export const WebhookIngressResponseSchema = z.object({
  received: z.literal(true),
  status: z.enum(["accepted", "duplicate"]).optional(),
});
export type WebhookIngressResponse = z.infer<typeof WebhookIngressResponseSchema>;
