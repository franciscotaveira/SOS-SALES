import { z } from "zod";

export const JourneyStatusEnum = z.enum([
  "open",
  "waiting_user",
  "waiting_operator",
  "ai_handling",
  "scheduled",
  "won",
  "lost",
  "archived",
]);
export type JourneyStatus = z.infer<typeof JourneyStatusEnum>;

export const AttributionSourceEnum = z.enum([
  "ctwa_meta",
  "lead_ads_meta",
  "tracked_link_meta",
  "organic_whatsapp",
  "manual_input",
]);
export type AttributionSource = z.infer<typeof AttributionSourceEnum>;

export const ContactSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "E.164 phone format required"),
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const CommercialJourneySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  contactId: z.string().uuid(),
  assignedUserId: z.string().uuid().nullable(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  status: JourneyStatusEnum,
  attributionSource: AttributionSourceEnum,
  campaignId: z.string().optional(),
  adId: z.string().optional(),
  ctwaClid: z.string().optional(),
  estimatedValueCents: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CommercialJourney = z.infer<typeof CommercialJourneySchema>;

export const CommercialOutcomeSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  journeyId: z.string().uuid(),
  status: z.enum(["won", "lost"]),
  valueCents: z.number().int().nonnegative(),
  currency: z.string().default("BRL"),
  reason: z.string().optional(),
  registeredByUserId: z.string().uuid(),
  timestamp: z.string().datetime(),
});
export type CommercialOutcome = z.infer<typeof CommercialOutcomeSchema>;
