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
  | "integration:candidates:read"
  | "integration:suggestions:create"
  | "integration:suggestions:manage"
  | "capi:dispatch"
  | "audit:view";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  workspaceId: string;
}

export type TokenVerificationResult =
  | { status: "valid"; user: AuthUser }
  | { status: "invalid"; reason: string }
  | { status: "provider_unavailable"; reason: string };

export interface IIdentityProvider {
  verifyToken(token: string): Promise<AuthUser | null>;
  verifyTokenDetailed?(token: string): Promise<TokenVerificationResult>;
  generateToken?(user: AuthUser, expiresInSeconds?: number): Promise<string>;
}

export interface IAuthorizationPolicy {
  hasPermission(user: AuthUser, permission: Permission): boolean;
  canAccessWorkspace(user: AuthUser, targetWorkspaceId: string): boolean;
}

export interface JwtProviderConfig {
  type: "jwt" | "local-jwt";
  secret: string;
  issuer: string;
  audience: string;
}

export interface SupabaseJwksConfig {
  type: "supabase_jwks" | "supabase-jwks";
  jwksUri: string;
  issuer: string;
  audience: string;
}

export type IdentityProviderConfig = JwtProviderConfig | SupabaseJwksConfig;
