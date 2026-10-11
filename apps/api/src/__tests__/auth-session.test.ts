import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../index";

const testOptions = {
  providerType: "local-jwt" as const,
  jwtSecret: "super_secret_local_jwt_development_key_v3_minimum_32_chars",
  issuer: "sos-sales-v3",
  audience: "sos-sales-api",
};

describe("POST /v1/auth/session - Sovereign Authentication Endpoint", () => {
  beforeAll(() => {
    process.env.ENABLE_LAB_AUTH = "true";
    process.env.MASTER_ACCESS_KEY = "mothership_master_2026";
  });

  it("rejects invalid request body with 400 Bad Request", async () => {
    const app = await buildApp(testOptions);
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      payload: { email: "not-an-email" },
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.body);
    expect(json.type).toBe("https://sos-sales.mct.br/errors/bad-request");
    await app.close();
  });

  it("rejects invalid master access key with 401 Unauthorized", async () => {
    const app = await buildApp(testOptions);
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      payload: { email: "francisco@mct.br", accessKey: "wrong_key_123" },
    });

    expect(response.statusCode).toBe(401);
    const json = JSON.parse(response.body);
    expect(json.type).toBe("https://sos-sales.mct.br/errors/unauthorized");
    expect(json.detail).toBe("Credenciais de acesso inválidas");
    await app.close();
  });
});
