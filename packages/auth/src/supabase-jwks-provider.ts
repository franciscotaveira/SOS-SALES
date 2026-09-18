import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { AuthUser, IIdentityProvider, SupabaseJwksConfig } from "./types";
import { logger } from "@sos-sales/observability";
import type { Role } from "@sos-sales/contracts";

export class SupabaseJwksIdentityProvider implements IIdentityProvider {
  private readonly getKey: JWTVerifyGetKey;
  private readonly issuer?: string;
  private readonly audience: string;

  constructor(config: SupabaseJwksConfig, customGetKey?: JWTVerifyGetKey) {
    if (!config.jwksUri || typeof config.jwksUri !== "string") {
      throw new Error("SupabaseJwksIdentityProvider: jwksUri is required");
    }

    this.issuer = config.issuer;
    this.audience = config.audience || "authenticated";

    this.getKey =
      customGetKey ||
      createRemoteJWKSet(new URL(config.jwksUri), {
        cooldownDuration: 30000,
        cacheMaxAge: 600000, // 10 minutes cache as specified in ADR-002
      });
  }

  public async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      if (!token || typeof token !== "string" || token.trim().length === 0) {
        return null;
      }

      const { payload } = await jwtVerify(token, this.getKey, {
        algorithms: ["RS256", "ES256"], // Strict: asymmetric algorithms from Supabase Auth JWKS
        issuer: this.issuer,
        audience: this.audience,
        requiredClaims: ["exp", "sub"],
        clockTolerance: 0,
      });

      if (!payload.sub || typeof payload.sub !== "string") {
        return null;
      }

      const appMetadata = (payload.app_metadata as Record<string, unknown>) || {};
      const userMetadata = (payload.user_metadata as Record<string, unknown>) || {};
      const role = (appMetadata.role as Role) || (userMetadata.role as Role) || "analyst";
      const workspaceId =
        (appMetadata.workspace_id as string) || (userMetadata.workspace_id as string) || "";

      return {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
        role,
        workspaceId,
      };
    } catch (err) {
      logger.warn({ err }, "Supabase JWKS token verification failed");
      return null;
    }
  }
}
