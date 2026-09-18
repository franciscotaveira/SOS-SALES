import { z } from "zod";

export const RoleEnum = z.enum([
  "owner",
  "admin",
  "manager",
  "operator",
  "analyst",
  "integration_service",
  "support_auditor",
]);
export type Role = z.infer<typeof RoleEnum>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100),
  timezone: z.string().default("America/Sao_Paulo"),
  currency: z.string().default("BRL"),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const WorkspaceMembershipSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: RoleEnum,
  createdAt: z.string().datetime(),
});
export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>;
