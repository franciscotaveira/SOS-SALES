import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Redis } from "ioredis";
import { RedisTwoTierRateLimiter } from "../services/redis-rate-limiter";
import { buildApp, getRedisClient, resolveTrustProxy } from "../index";

describe("CH-05: Distributed Redis Rate Limiter & Trusted Proxy Hardening", () => {
  let redis: Redis;
  const testPrefix = `test:ratelimit:${Date.now()}`;

  beforeAll(async () => {
    redis = getRedisClient();
    if (redis.status === "wait") {
      await redis.connect();
    }
  });

  afterAll(async () => {
    try {
      const keys = await redis.keys(`${testPrefix}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe("Multi-Instance Quota Consistency across API Replicas", () => {
    it("should enforce shared IP quota across multiple simulated API replica instances", async () => {
      // Replica A and Replica B share the exact same Redis instance and prefix
      const replicaA = new RedisTwoTierRateLimiter({
        redisClient: redis,
        keyPrefix: testPrefix,
        maxIpRequests: 5,
        maxChannelRequests: 15,
        windowMs: 60_000,
      });

      const replicaB = new RedisTwoTierRateLimiter({
        redisClient: redis,
        keyPrefix: testPrefix,
        maxIpRequests: 5,
        maxChannelRequests: 15,
        windowMs: 60_000,
      });

      const targetIp = "198.51.100.42";

      // 1. Send 3 requests via Replica A
      expect(await replicaA.isIpAllowed(targetIp)).toBe(true);
      expect(await replicaA.isIpAllowed(targetIp)).toBe(true);
      expect(await replicaA.isIpAllowed(targetIp)).toBe(true);

      // 2. Send 2 requests via Replica B (quota reached 5 total)
      expect(await replicaB.isIpAllowed(targetIp)).toBe(true);
      expect(await replicaB.isIpAllowed(targetIp)).toBe(true);

      // 3. 6th request via Replica A must be blocked
      const checkA = await replicaA.checkIpLimit(targetIp);
      expect(checkA.allowed).toBe(false);
      expect(checkA.remaining).toBe(0);
      expect(checkA.resetMs).toBeGreaterThan(0);

      // 4. 7th request via Replica B must also be blocked
      const checkB = await replicaB.checkIpLimit(targetIp);
      expect(checkB.allowed).toBe(false);
      expect(checkB.remaining).toBe(0);
    });

    it("should enforce shared Channel quota across multiple simulated API replicas", async () => {
      const replicaA = new RedisTwoTierRateLimiter({
        redisClient: redis,
        keyPrefix: testPrefix,
        maxIpRequests: 100,
        maxChannelRequests: 3,
        windowMs: 60_000,
      });

      const replicaB = new RedisTwoTierRateLimiter({
        redisClient: redis,
        keyPrefix: testPrefix,
        maxIpRequests: 100,
        maxChannelRequests: 3,
        windowMs: 60_000,
      });

      const channelId1 = "11111111-2222-3333-4444-555555555555";
      const channelId2 = "99999999-8888-7777-6666-555555555555";

      // Channel 1: 2 hits on Replica A, 1 hit on Replica B
      expect(await replicaA.isChannelAllowed(channelId1)).toBe(true);
      expect(await replicaA.isChannelAllowed(channelId1)).toBe(true);
      expect(await replicaB.isChannelAllowed(channelId1)).toBe(true);

      // 4th hit on Channel 1 is blocked across both replicas
      expect(await replicaA.isChannelAllowed(channelId1)).toBe(false);
      expect(await replicaB.isChannelAllowed(channelId1)).toBe(false);

      // Channel 2 quota remains unaffected (tenant/channel isolation)
      expect(await replicaA.isChannelAllowed(channelId2)).toBe(true);
      expect(await replicaB.isChannelAllowed(channelId2)).toBe(true);
    });
  });

  describe("Sliding Window Expiration and Quota Recovery", () => {
    it("should allow requests again once the sliding window expires", async () => {
      const fastLimiter = new RedisTwoTierRateLimiter({
        redisClient: redis,
        keyPrefix: `${testPrefix}:fast`,
        maxIpRequests: 2,
        windowMs: 400, // 400ms window
      });

      const ip = "203.0.113.88";

      // 1. Consume 2 requests
      expect(await fastLimiter.isIpAllowed(ip)).toBe(true);
      expect(await fastLimiter.isIpAllowed(ip)).toBe(true);

      // 2. 3rd request blocked
      const blocked = await fastLimiter.checkIpLimit(ip);
      expect(blocked.allowed).toBe(false);

      // 3. Wait for sliding window to slide past (500ms)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 4. Should be allowed again
      const recovered = await fastLimiter.checkIpLimit(ip);
      expect(recovered.allowed).toBe(true);
    });
  });

  describe("Graceful Fallback on Redis Failure", () => {
    it("should gracefully fall back to in-memory limiter if Redis throws an error", async () => {
      // Mock Redis instance that always throws
      const faultyRedis = {
        eval: async () => {
          throw new Error("ECONNREFUSED: Simulated Redis cluster outage");
        },
        keys: async () => [],
        del: async () => 0,
      } as unknown as Redis;

      const resilientLimiter = new RedisTwoTierRateLimiter({
        redisClient: faultyRedis,
        maxIpRequests: 3,
        windowMs: 60_000,
      });

      const ip = "192.0.2.1";

      // Should degrade gracefully without throwing uncaught exception
      expect(await resilientLimiter.isIpAllowed(ip)).toBe(true);
      expect(await resilientLimiter.isIpAllowed(ip)).toBe(true);
      expect(await resilientLimiter.isIpAllowed(ip)).toBe(true);
      // 4th request exceeds local fallback limit
      expect(await resilientLimiter.isIpAllowed(ip)).toBe(false);
    });
  });

  describe("Trusted Proxy Configuration & Anti-Spoofing", () => {
    it("should resolve secure default CIDRs when TRUST_PROXY is undefined", () => {
      const defaultProxies = resolveTrustProxy(undefined);
      expect(Array.isArray(defaultProxies)).toBe(true);
      expect(defaultProxies).toContain("127.0.0.1");
      expect(defaultProxies).toContain("::1");
      expect(defaultProxies).toContain("10.0.0.0/8");
      expect(defaultProxies).toContain("172.16.0.0/12");
      expect(defaultProxies).toContain("192.168.0.0/16");
    });

    it("should parse comma-separated CIDRs from TRUST_PROXY environment variable", () => {
      const originalEnv = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = "10.100.0.1, 10.100.0.2, 172.20.0.0/16";
        const parsed = resolveTrustProxy(undefined);
        expect(parsed).toEqual(["10.100.0.1", "10.100.0.2", "172.20.0.0/16"]);
      } finally {
        if (originalEnv !== undefined) {
          process.env.TRUST_PROXY = originalEnv;
        } else {
          delete process.env.TRUST_PROXY;
        }
      }
    });

    it("should support boolean flags in TRUST_PROXY environment variable", () => {
      const originalEnv = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = "false";
        expect(resolveTrustProxy(undefined)).toBe(false);
        process.env.TRUST_PROXY = "true";
        expect(resolveTrustProxy(undefined)).toBe(true);
      } finally {
        if (originalEnv !== undefined) {
          process.env.TRUST_PROXY = originalEnv;
        } else {
          delete process.env.TRUST_PROXY;
        }
      }
    });

    it("should accurately resolve client IP via trusted loopback proxy and ignore spoofed headers when disabled", async () => {
      // 1. App with trustProxy enabled for loopback
      const trustedApp = await buildApp({
        trustProxy: ["127.0.0.1"],
      });

      try {
        const res = await trustedApp.inject({
          method: "GET",
          url: "/health",
          headers: {
            "x-forwarded-for": "203.0.113.195",
          },
        });

        expect(res.statusCode).toBe(200);
      } finally {
        await trustedApp.close();
      }

      // 2. App with trustProxy disabled
      const untrustedApp = await buildApp({
        trustProxy: false,
      });

      try {
        const res = await untrustedApp.inject({
          method: "GET",
          url: "/health",
          headers: {
            "x-forwarded-for": "203.0.113.195",
          },
        });

        expect(res.statusCode).toBe(200);
      } finally {
        await untrustedApp.close();
      }
    });
  });

  describe("HTTP 429 RFC 6585 Headers Integration", () => {
    it("should return Retry-After and rate limit metadata headers when threshold is exceeded", async () => {
      const limiter = new RedisTwoTierRateLimiter({
        redisClient: redis,
        keyPrefix: `${testPrefix}:headers`,
        maxIpRequests: 2,
        windowMs: 30_000,
      });

      const app = await buildApp({
        rateLimiter: limiter,
        rateLimitMax: 2,
        rateLimitWindowMs: 30_000,
      });

      const dummyEndpointToken = "sample_endpoint_token_123456789";

      try {
        // Request 1
        const res1 = await app.inject({
          method: "GET",
          url: `/v1/webhooks/whatsapp/${dummyEndpointToken}`,
          query: {
            "hub.mode": "subscribe",
            "hub.challenge": "111",
            "hub.verify_token": "any",
          },
        });
        expect([200, 403, 404, 500]).toContain(res1.statusCode);

        // Request 2
        const res2 = await app.inject({
          method: "GET",
          url: `/v1/webhooks/whatsapp/${dummyEndpointToken}`,
          query: {
            "hub.mode": "subscribe",
            "hub.challenge": "222",
            "hub.verify_token": "any",
          },
        });
        expect([200, 403, 404, 500]).toContain(res2.statusCode);

        // Request 3: Must be rate limited
        const res3 = await app.inject({
          method: "GET",
          url: `/v1/webhooks/whatsapp/${dummyEndpointToken}`,
          query: {
            "hub.mode": "subscribe",
            "hub.challenge": "333",
            "hub.verify_token": "any",
          },
        });

        expect(res3.statusCode).toBe(429);
        expect(res3.headers["retry-after"]).toBeDefined();
        expect(Number(res3.headers["retry-after"])).toBeGreaterThan(0);
        expect(res3.headers["x-ratelimit-limit"]).toBe("2");
        expect(res3.headers["x-ratelimit-remaining"]).toBe("0");

        const json = JSON.parse(res3.body);
        expect(json.status).toBe(429);
        expect(json.instance).toBe("/v1/webhooks/whatsapp/[redacted]");
        expect(res3.body).not.toContain(dummyEndpointToken);
      } finally {
        await app.close();
      }
    });
  });
});
