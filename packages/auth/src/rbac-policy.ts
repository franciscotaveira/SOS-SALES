import type { AuthUser, IAuthorizationPolicy, Permission } from "./types";
import type { Role } from "@sos-sales/contracts";

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  owner: new Set([
    "workspace:view",
    "workspace:manage",
    "workspace:invite",
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:view",
    "integration:manage",
    "integration:suggestions:manage",
    "capi:dispatch",
    "audit:view",
  ]),
  admin: new Set([
    "workspace:view",
    "workspace:manage",
    "workspace:invite",
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:view",
    "integration:manage",
    "integration:suggestions:manage",
    "capi:dispatch",
    "audit:view",
  ]),
  manager: new Set([
    "workspace:view",
    "workspace:invite",
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:view",
    "integration:suggestions:manage",
    "audit:view",
  ]),
  operator: new Set([
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:suggestions:manage",
  ]),
  analyst: new Set([
    "workspace:view",
    "journey:view",
    "integration:view",
    "audit:view",
  ]),
  integration_service: new Set([
    "journey:view",
    "integration:candidates:read",
    "integration:suggestions:create",
  ]),
  support_auditor: new Set([
    "workspace:view",
    "audit:view",
  ]),
};

export class RbacAuthorizationPolicy implements IAuthorizationPolicy {
  public hasPermission(user: AuthUser, permission: Permission): boolean {
    const rolePermissions = ROLE_PERMISSIONS[user.role];
    if (!rolePermissions) return false;
    return rolePermissions.has(permission);
  }

  public canAccessWorkspace(user: AuthUser, targetWorkspaceId: string): boolean {
    if (!user.workspaceId || !targetWorkspaceId) return false;
    return user.workspaceId === targetWorkspaceId;
  }
}
