import { z } from "zod";

export const CanonicalConversionEventEnum = z.enum([
  "LeadCaptured",
  "LeadQualified",
  "AppointmentScheduled",
  "ProposalAccepted",
  "PurchaseCompleted",
  "PurchaseRefunded",
]);
export type CanonicalConversionEvent = z.infer<typeof CanonicalConversionEventEnum>;

export const CapiDispatchStatusEnum = z.enum([
  "QUEUED",
  "ACCEPTED",
  "FAILED",
  "NOT_APPLICABLE",
]);
export type CapiDispatchStatus = z.infer<typeof CapiDispatchStatusEnum>;

export const ConversionEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  journeyId: z.string().uuid(),
  eventName: CanonicalConversionEventEnum,
  eventTime: z.string().datetime(),
  valueCents: z.number().int().nonnegative().optional(),
  currency: z.string().default("BRL"),
  userData: z.object({
    hashedEmail: z.string().optional(),
    hashedPhone: z.string().optional(),
    clientIpAddress: z.string().optional(),
    clientUserAgent: z.string().optional(),
    ctwaClid: z.string().optional(),
    fbc: z.string().optional(),
    fbp: z.string().optional(),
  }),
  status: CapiDispatchStatusEnum,
  providerReceipt: z.object({
    eventsReceived: z.number().optional(),
    fbtraceId: z.string().optional(),
    messages: z.array(z.string()).optional(),
  }).optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type ConversionEvent = z.infer<typeof ConversionEventSchema>;
