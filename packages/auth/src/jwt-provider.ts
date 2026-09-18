import { SignJWT, jwtVerify } from "jose";
import type { AuthUser, IIdentityProvider, JwtProviderConfig } from "./types";
import { logger } from "@sos-sales/observability";
import type { Role } from "@sos-sales/contracts";

export class JwtIdentityProvider implements IIdentityProvider {
  private readonly secret: string;
  private readonly issuer?: string;
  private readonly audience?: string;
  private readonly secretBytes: Uint8Array;

  constructor(configOrSecret: string | JwtProviderConfig) {
    const config: JwtProviderConfig =
      typeof configOrSecret === "string"
        ? { type: "jwt", secret: configOrSecret }
        : configOrSecret;

    if (!config.secret || typeof config.secret !== "string" || config.secret.trim().length < 32) {
      throw new Error(
        "JwtIdentityProvider: A cryptographically secure secret of at least 32 characters (256 bits) is required. Hardcoded defaults are strictly prohibited."
      );
    }

    this.secret = config.secret;
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.secretBytes = new TextEncoder().encode(this.secret);
  }

  public async generateToken(user: AuthUser, expiresInSeconds = 86400): Promise<string> {
    const signer = new SignJWT({
      email: user.email,
      role: user.role,
      workspace_id: user.workspaceId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds);

    if (this.issuer) {
      signer.setIssuer(this.issuer);
    }
    if (this.audience) {
      signer.setAudience(this.audience);
    }

    return await signer.sign(this.secretBytes);
  }

  public async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      if (!token || typeof token !== "string" || token.trim().length === 0) {
        return null;
      }

      const { payload } = await jwtVerify(token, this.secretBytes, {
        algorithms: ["HS256"], // Strict: ONLY allow HS256 to prevent algorithm confusion
        issuer: this.issuer,
        audience: this.audience,
        requiredClaims: ["exp", "sub"], // Strict: token MUST contain expiration and subject
        clockTolerance: 0,
      });

      if (!payload.sub || typeof payload.sub !== "string") {
        return null;
      }

      return {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
        role: (payload.role as Role) || "analyst",
        workspaceId: typeof payload.workspace_id === "string" ? payload.workspace_id : "",
      };
    } catch (err) {
      logger.warn({ err }, "JWT token verification failed");
      return null;
    }
  }
}
