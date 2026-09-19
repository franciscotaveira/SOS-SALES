import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  errors as joseErrors,
} from "jose";
import type {
  AuthUser,
  IIdentityProvider,
  SupabaseJwksConfig,
  TokenVerificationResult,
} from "./types";
import { logger } from "@sos-sales/observability";
import type { Role } from "@sos-sales/contracts";
import { sanitizeAuthError } from "./sanitization";

export class SupabaseJwksIdentityProvider implements IIdentityProvider {
  private readonly getKey: JWTVerifyGetKey;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: SupabaseJwksConfig, customGetKey?: JWTVerifyGetKey) {
    if (!config || typeof config !== "object") {
      throw new Error("SupabaseJwksIdentityProvider: Configuration object is required.");
    }

    if (!config.jwksUri || typeof config.jwksUri !== "string" || config.jwksUri.trim().length === 0) {
      throw new Error("SupabaseJwksIdentityProvider: A valid non-empty 'jwksUri' is required.");
    }

    if (!config.issuer || typeof config.issuer !== "string" || config.issuer.trim().length === 0) {
      throw new Error("SupabaseJwksIdentityProvider: A valid non-empty 'issuer' is required.");
    }

    if (
      !config.audience ||
      typeof config.audience !== "string" ||
      config.audience.trim().length === 0
    ) {
      throw new Error("SupabaseJwksIdentityProvider: A valid non-empty 'audience' is required.");
    }

    this.issuer = config.issuer.trim();
    this.audience = config.audience.trim();

    this.getKey =
      customGetKey ||
      createRemoteJWKSet(new URL(config.jwksUri), {
        cooldownDuration: 30000,
        cacheMaxAge: 600000, // 10 minutes cache as specified in ADR-002
      });
  }

  public async verifyTokenDetailed(token: string): Promise<TokenVerificationResult> {
    try {
      if (!token || typeof token !== "string" || token.trim().length === 0) {
        return { status: "invalid", reason: "Token is empty or missing" };
      }

      const { payload } = await jwtVerify(token, this.getKey, {
        algorithms: ["RS256", "ES256"], // Strict: asymmetric algorithms from Supabase Auth JWKS
        issuer: this.issuer,
        audience: this.audience,
        requiredClaims: ["exp", "sub", "iss", "aud"],
        clockTolerance: 0,
      });

      if (!payload.sub || typeof payload.sub !== "string") {
        return { status: "invalid", reason: "Missing subject claim" };
      }

      const appMetadata = (payload.app_metadata as Record<string, unknown>) || {};
      const userMetadata = (payload.user_metadata as Record<string, unknown>) || {};
      const role = (appMetadata.role as Role) || (userMetadata.role as Role) || "analyst";
      const workspaceId =
        (appMetadata.workspace_id as string) || (userMetadata.workspace_id as string) || "";

      const user: AuthUser = {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
        role,
        workspaceId,
      };

      return { status: "valid", user };
    } catch (err) {
      const errStr =
        err instanceof Error
          ? `${err.name} ${err.message} ${String((err as any).cause || "")}`
          : String(err);

      if (
        err instanceof joseErrors.JWKSTimeout ||
        errStr.includes("JWKSTimeout") ||
        errStr.includes("fetch failed") ||
        errStr.includes("network") ||
        errStr.includes("ECONNREFUSED") ||
        errStr.includes("ETIMEDOUT") ||
        errStr.includes("ENOTFOUND")
      ) {
        const authError = sanitizeAuthError(err, "supabase-jwks");
        logger.error({ authError }, "Supabase JWKS keystore temporarily unreachable");
        return {
          status: "provider_unavailable",
          reason: "Remote JWKS keystore is temporarily unreachable",
        };
      }

      const authError = sanitizeAuthError(err, "supabase-jwks");
      logger.warn({ authError }, "Supabase JWKS token verification failed");
      const message = err instanceof Error ? err.message : "Invalid token";
      return { status: "invalid", reason: message };
    }
  }

  public async verifyToken(token: string): Promise<AuthUser | null> {
    const result = await this.verifyTokenDetailed(token);
    return result.status === "valid" ? result.user : null;
  }
}
