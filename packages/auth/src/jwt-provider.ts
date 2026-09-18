import crypto from "node:crypto";
import type { AuthUser, IIdentityProvider } from "./types";
import { logger } from "@sos-sales/observability";

export class JwtIdentityProvider implements IIdentityProvider {
  private readonly secret: string;

  constructor(secret?: string) {
    this.secret = secret || process.env.JWT_SECRET || "sos_v3_default_dev_secret_key_min32chars!";
  }

  public async generateToken(user: AuthUser, expiresInSeconds = 86400): Promise<string> {
    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      workspace_id: user.workspaceId,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  public async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;

      const [encodedHeader, encodedPayload, signature] = parts;
      if (!encodedHeader || !encodedPayload || !signature) return null;

      const expectedSignature = crypto
        .createHmac("sha256", this.secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest("base64url");

      if (signature !== expectedSignature) {
        logger.warn("JWT signature verification failed");
        return null;
      }

      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < now) {
        logger.warn("JWT token expired");
        return null;
      }

      return {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        workspaceId: payload.workspace_id,
      };
    } catch (err) {
      logger.error({ err }, "Failed to parse or verify JWT token");
      return null;
    }
  }
}
