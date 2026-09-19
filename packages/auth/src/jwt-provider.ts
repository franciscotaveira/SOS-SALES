import { SignJWT, jwtVerify } from "jose";
import type {
  AuthUser,
  IIdentityProvider,
  JwtProviderConfig,
  TokenVerificationResult,
} from "./types";
import { logger } from "@sos-sales/observability";
import type { Role } from "@sos-sales/contracts";
import { sanitizeAuthError } from "./sanitization";

export class JwtIdentityProvider implements IIdentityProvider {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly secretBytes: Uint8Array;

  constructor(config: JwtProviderConfig | string) {
    const configObj: Partial<JwtProviderConfig> =
      typeof config === "string" ? { secret: config } : config;

    if (!configObj || typeof configObj !== "object") {
      throw new Error("JwtIdentityProvider: Configuration object is required.");
    }

    if (!configObj.secret || typeof configObj.secret !== "string" || configObj.secret.trim().length < 32) {
      throw new Error(
        "JwtIdentityProvider: A cryptographically secure secret of at least 32 characters (256 bits) is required. Hardcoded defaults are strictly prohibited."
      );
    }

    if (!configObj.issuer || typeof configObj.issuer !== "string" || configObj.issuer.trim().length === 0) {
      throw new Error("JwtIdentityProvider: A valid non-empty 'issuer' is required.");
    }

    if (
      !configObj.audience ||
      typeof configObj.audience !== "string" ||
      configObj.audience.trim().length === 0
    ) {
      throw new Error("JwtIdentityProvider: A valid non-empty 'audience' is required.");
    }

    this.secret = configObj.secret.trim();
    this.issuer = configObj.issuer.trim();
    this.audience = configObj.audience.trim();
    this.secretBytes = new TextEncoder().encode(this.secret);
  }

  public async generateToken(user: AuthUser, expiresInSeconds = 86400): Promise<string> {
    return await new SignJWT({
      email: user.email,
      role: user.role,
      workspace_id: user.workspaceId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
      .sign(this.secretBytes);
  }

  public async verifyTokenDetailed(token: string): Promise<TokenVerificationResult> {
    try {
      if (!token || typeof token !== "string" || token.trim().length === 0) {
        return { status: "invalid", reason: "Token is empty or missing" };
      }

      const { payload } = await jwtVerify(token, this.secretBytes, {
        algorithms: ["HS256"], // Strict: ONLY allow HS256 to prevent algorithm confusion
        issuer: this.issuer, // Strict: Validate declared issuer
        audience: this.audience, // Strict: Validate declared audience
        requiredClaims: ["exp", "sub", "iss", "aud"], // Strict: token MUST contain all required claims
        clockTolerance: 0,
      });

      if (!payload.sub || typeof payload.sub !== "string") {
        return { status: "invalid", reason: "Missing subject claim" };
      }

      const user: AuthUser = {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
        role: (payload.role as Role) || "analyst",
        workspaceId: typeof payload.workspace_id === "string" ? payload.workspace_id : "",
      };

      return { status: "valid", user };
    } catch (err) {
      const authError = sanitizeAuthError(err, "local-jwt");
      logger.warn({ authError }, "JWT token verification failed");
      const message = err instanceof Error ? err.message : "Invalid token";
      return { status: "invalid", reason: message };
    }
  }

  public async verifyToken(token: string): Promise<AuthUser | null> {
    const result = await this.verifyTokenDetailed(token);
    return result.status === "valid" ? result.user : null;
  }
}
