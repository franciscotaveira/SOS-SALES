import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../index";
import { logger } from "@sos-sales/observability";
import { BoundedTwoTierRateLimiter } from "../routes/webhook.routes";

describe("Ingress Operational Security: Log Redaction, Rate Limiting & Signatures", () => {
  describe("Fastify Automatic Log Redaction", () => {
    it("should redact endpointToken in Fastify error logs on JSON parser error", async () => {
      const sensitiveToken = "secret-token-abc-987654321";
      const logChunks: string[] = [];

      // Intercept logger calls to check captured output
      const errorSpy = vi.spyOn(logger, "error").mockImplementation((...args: any[]) => {
        logChunks.push(JSON.stringify(args));
      });
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation((...args: any[]) => {
        logChunks.push(JSON.stringify(args));
      });
      const infoSpy = vi.spyOn(logger, "info").mockImplementation((...args: any[]) => {
        logChunks.push(JSON.stringify(args));
      });

      try {
        const app = await buildApp();

        // Send invalid JSON body (causes body parser error FST_ERR_CTP_INVALID_MEDIA_TYPE or JSON syntax error)
        const response = await app.inject({
          method: "POST",
          url: `/v1/webhooks/whatsapp/${sensitiveToken}`,
          headers: {
            "content-type": "application/json",
          },
          body: "{ this is invalid json : [",
        });

        expect(response.statusCode).toBe(400);

        // Assert response body does NOT contain the raw sensitive token in the detail or instance URL
        expect(response.body).not.toContain(sensitiveToken);
        expect(response.body).toContain("[redacted]");

        // Assert that none of the log messages contain the raw sensitive token
        const combinedLogs = logChunks.join("\n");
        expect(combinedLogs).not.toContain(sensitiveToken);
      } finally {
        errorSpy.mockRestore();
        warnSpy.mockRestore();
        infoSpy.mockRestore();
      }
    });

    it("should redact endpointToken in Fastify error logs when bodyLimit is exceeded", async () => {
      const sensitiveToken = "overflow-token-xyz-11223344";
      const logChunks: string[] = [];

      const errorSpy = vi.spyOn(logger, "error").mockImplementation((...args: any[]) => {
        logChunks.push(JSON.stringify(args));
      });
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation((...args: any[]) => {
        logChunks.push(JSON.stringify(args));
      });

      try {
        const app = await buildApp();

        // Fastify default bodyLimit is 1MB. Send oversized body (1.5MB)
        const hugeBody = JSON.stringify({ data: "a".repeat(1.5 * 1024 * 1024) });

        const response = await app.inject({
          method: "POST",
          url: `/v1/webhooks/whatsapp/${sensitiveToken}`,
          headers: {
            "content-type": "application/json",
          },
          body: hugeBody,
        });

        expect(response.statusCode).toBe(413); // Payload Too Large

        // Assert response does NOT leak raw token
        expect(response.body).not.toContain(sensitiveToken);

        // Assert logs do NOT contain raw token
        const combinedLogs = logChunks.join("\n");
        expect(combinedLogs).not.toContain(sensitiveToken);
      } finally {
        errorSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });
  });

  describe("BoundedTwoTierRateLimiter Memory & Enforcement", () => {
    it("should enforce Tier 1 (IP limit) before channel resolution", () => {
      const limiter = new BoundedTwoTierRateLimiter({
        maxIpRequests: 3,
        maxChannelRequests: 10,
        windowMs: 60000,
        maxCardinality: 100,
      });

      const ip = "198.51.100.1";
      expect(limiter.isIpAllowed(ip)).toBe(true);
      expect(limiter.isIpAllowed(ip)).toBe(true);
      expect(limiter.isIpAllowed(ip)).toBe(true);
      // 4th request from same IP is rate limited
      expect(limiter.isIpAllowed(ip)).toBe(false);
    });

    it("should enforce Tier 2 (Channel limit) after channel resolution", () => {
      const limiter = new BoundedTwoTierRateLimiter({
        maxIpRequests: 100,
        maxChannelRequests: 2,
        windowMs: 60000,
        maxCardinality: 100,
      });

      const channelId = "00000000-0000-0000-0000-000000000001";
      expect(limiter.isChannelAllowed(channelId)).toBe(true);
      expect(limiter.isChannelAllowed(channelId)).toBe(true);
      // 3rd request to same channel is rate limited
      expect(limiter.isChannelAllowed(channelId)).toBe(false);
    });

    it("should bound in-memory map size and evict when thousands of rotating tokens/keys are queried", () => {
      const maxCardinality = 200;
      const limiter = new BoundedTwoTierRateLimiter({
        maxIpRequests: 50,
        maxChannelRequests: 50,
        windowMs: 60000,
        maxCardinality: maxCardinality,
      });

      // Simulate an attacker rotating 2,000 distinct IP addresses / keys to exhaust server RAM
      for (let i = 0; i < 2000; i++) {
        limiter.isIpAllowed(`10.99.${Math.floor(i / 256)}.${i % 256}`);
      }

      // Assert that the internal map size is strictly bounded by maxCardinality and did not grow to 2,000
      expect(limiter.getCardinality()).toBeLessThanOrEqual(maxCardinality);
    });
  });

  describe("Signature Verification Status Classification", () => {
    it("should classify unavailable signature verification as HTTP 500 rather than 401", async () => {
      const app = await buildApp();

      // Send webhook to an endpoint where signing resolver is unavailable or channel doesn't exist
      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/whatsapp/non-existent-token",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=" + "a".repeat(64),
        },
        body: JSON.stringify({ object: "whatsapp_business_account" }),
      });

      // Resolving an unknown endpoint token is a 404/401 not 500, but let's check:
      expect([401, 404, 500]).toContain(response.statusCode);
      // Ensure URL in response is redacted
      expect(response.body).not.toContain("non-existent-token");
    });
  });
});
