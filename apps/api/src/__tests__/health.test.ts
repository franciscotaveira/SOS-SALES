import { describe, it, expect } from "vitest";
import { buildApp } from "../index";

describe("Fastify API Health & Readiness Probes", () => {
  it("should respond 200 on /health liveness check", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.status).toBe("live");
    expect(json.service).toBe("sos-sales-api");
    await app.close();
  });

  it("should respond on / with operational info", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.name).toBe("SOS Sales V3 API");
    await app.close();
  });
});
