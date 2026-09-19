import { describe, it, expect, vi } from "vitest";
import { JwtIdentityProvider } from "../jwt-provider";
import { sanitizeAuthError, sanitizeUrl } from "../sanitization";
import { SignJWT } from "jose";
import { logger } from "@sos-sales/observability";

describe("TAREFA B: Observabilidade Segura e Sanitização de Logs (R03)", () => {
  const testSecret = "secure_logging_test_secret_32_characters_minimum!";
  const testIssuer = "sos-sales-v3";
  const testAudience = "sos-sales-api";

  const provider = new JwtIdentityProvider({
    type: "local-jwt",
    secret: testSecret,
    issuer: testIssuer,
    audience: testAudience,
  });

  it("should never log JWT payload, claims or PII on token verification failure", async () => {
    const sentinelEmail = "sentinel_leak_check@mct.br";
    const sentinelSub = "sentinel_user_id_123456";
    const sentinelRole = "sentinel_role_confidential";

    const secretBytes = new TextEncoder().encode(testSecret);

    // Create an expired token containing sentinel claims
    const expiredToken = await new SignJWT({
      sub: sentinelSub,
      email: sentinelEmail,
      role: sentinelRole,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secretBytes);

    // Spy on logger.warn
    const loggedCalls: any[] = [];
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation((obj, msg) => {
      loggedCalls.push({ obj, msg, serialized: JSON.stringify(obj) });
    });

    try {
      const result = await provider.verifyTokenDetailed(expiredToken);
      expect(result.status).toBe("invalid");

      expect(loggedCalls.length).toBeGreaterThanOrEqual(1);

      for (const call of loggedCalls) {
        const fullString = `${call.serialized} ${call.msg}`;

        // Assert ZERO PII or payload leak
        expect(fullString).not.toContain(sentinelEmail);
        expect(fullString).not.toContain(sentinelSub);
        expect(fullString).not.toContain(sentinelRole);
        expect(fullString).not.toContain("payload");

        // Assert only permitted diagnostic fields exist
        expect(call.obj.authError).toBeDefined();
        expect(call.obj.authError.provider).toBe("local-jwt");
        expect(call.obj.authError.name).toBe("JWTExpired");
        expect(call.obj.authError.code).toBe("ERR_JWT_EXPIRED");
        expect(call.obj.authError.messageCategory).toBe("token_expired");
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("should sanitize malformed connection strings and strip sentinel passwords", () => {
    const sentinelPassword = "sentinel_super_secret_db_password_XYZ123!";
    const testUrl = `postgresql://sos_app_user:${sentinelPassword}@localhost:55440/sos_sales_v3_test?sslmode=disable`;

    const sanitized = sanitizeUrl(testUrl);

    // Password must be redacted
    expect(sanitized).not.toContain(sentinelPassword);
    expect(sanitized).toContain("***");
    expect(sanitized).toContain("localhost:55440/sos_sales_v3_test");

    // Malformed URL with embedded credentials must also be redacted
    const malformedUrl = `postgres://sos_app_user:${sentinelPassword}@localhost:invalid_port/db`;
    const sanitizedMalformed = sanitizeUrl(malformedUrl);
    expect(sanitizedMalformed).not.toContain(sentinelPassword);
    expect(sanitizedMalformed).toContain("***");
  });

  it("sanitizeAuthError returns categorized diagnostic data without payload", () => {
    const fakeError = new Error("signature verification failed");
    (fakeError as any).code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
    (fakeError as any).payload = { email: "leaked@mct.br", sub: "should-not-exist" };

    const sanitized = sanitizeAuthError(fakeError, "local-jwt");

    expect(sanitized.provider).toBe("local-jwt");
    expect(sanitized.code).toBe("ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
    expect(sanitized.messageCategory).toBe("signature_verification_failed");
    expect((sanitized as any).payload).toBeUndefined();
    expect(JSON.stringify(sanitized)).not.toContain("leaked@mct.br");
  });
});
