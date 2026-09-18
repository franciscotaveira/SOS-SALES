import { z } from "zod";

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actorId: z.string().uuid(),
  actorType: z.enum(["user", "system", "support_impersonator", "integration_service"]),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
