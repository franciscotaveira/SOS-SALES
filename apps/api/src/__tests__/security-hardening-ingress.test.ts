import { describe, it, expect } from "vitest";
import { buildApp } from "../index";

const testOptions = {
  providerType: "local-jwt" as const,
  jwtSecret: "super_secret_local_jwt_development_key_v3_minimum_32_chars",
  issuer: "sos-sales-v3",
  audience: "sos-sales-api",
  globalRateLimitPerMinute: 3, // Low for testing rate limiting
  jailDurationSeconds: 60,
};

describe("Security Ingress Hardening & Hacker Defense (MCT OS v2.0)", () => {
  it("should inject OWASP security headers on all responses", async () => {
    const app = await buildApp(testOptions);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-xss-protection"]).toBe("1; mode=block");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["strict-transport-security"]).toContain("max-age=31536000");

    await app.close();
  });

  it("should detect scanner tool and reject with 403 Forbidden", async () => {
    const app = await buildApp(testOptions);

    const response = await app.inject({
      method: "GET",
      url: "/v1/contacts",
      headers: {
        "user-agent": "sqlmap/1.5.2#stable",
      },
    });

    expect(response.statusCode).toBe(403);
    const json = JSON.parse(response.body);
    expect(json.status).toBe(403);
    expect(json.detail).toContain("Requisição maliciosa ou sonda de vulnerabilidade");

    await app.close();
  });

  it("should detect WordPress or sensitive file probes and jail the offending IP", async () => {
    const app = await buildApp(testOptions);
    const attackingIp = "198.51.100.99";

    // 1. Initial malicious probe
    const probeResponse = await app.inject({
      method: "GET",
      url: "/wp-login.php",
      remoteAddress: attackingIp,
    });

    expect(probeResponse.statusCode).toBe(403);

    // 2. Subsequent request from same IP must be rejected because IP is jailed
    const followUpResponse = await app.inject({
      method: "GET",
      url: "/v1/auth/login",
      remoteAddress: attackingIp,
    });

    expect(followUpResponse.statusCode).toBe(403);
    expect(followUpResponse.headers["retry-after"]).toBeDefined();
    const json = JSON.parse(followUpResponse.body);
    expect(json.detail).toContain("Endereço IP temporariamente bloqueado");

    await app.close();
  });

  it("should enforce global rate limit and return 429 with RFC 6585 headers", async () => {
    const app = await buildApp(testOptions);
    const clientIp = "192.0.2.77";

    // 3 allowed requests
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "GET",
        url: "/v1/workspaces",
        remoteAddress: clientIp,
      });
      // Route might be 401 Unauthorized because no token, but it must pass the rate limit check
      expect(res.headers["x-ratelimit-limit"]).toBe("3");
    }

    // 4th request must be blocked with 429
    const blockedRes = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      remoteAddress: clientIp,
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers["retry-after"]).toBeDefined();
    const json = JSON.parse(blockedRes.body);
    expect(json.status).toBe(429);
    expect(json.detail).toContain("Limite global de requisições excedido");

    await app.close();
  });
});
