import type { Role } from "@sos-sales/contracts";

export type Permission =
  | "workspace:view"
  | "workspace:manage"
  | "workspace:invite"
  | "cockpit:access"
  | "cockpit:send_message"
  | "cockpit:handoff"
  | "journey:view"
  | "journey:transition_stage"
  | "outcome:register"
  | "integration:view"
  | "integration:manage"
  | "capi:dispatch"
  | "audit:view";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  workspaceId: string;
}

export interface IIdentityProvider {
  verifyToken(token: string): Promise<AuthUser | null>;
  generateToken(user: AuthUser, expiresInSeconds?: number): Promise<string>;
}

export interface IAuthorizationPolicy {
  hasPermission(user: AuthUser, permission: Permission): boolean;
  canAccessWorkspace(user: AuthUser, targetWorkspaceId: string): boolean;
}
