import { describe, it, expect, beforeEach } from "vitest";
import { SecurityShield } from "../services/security-shield";

describe("SecurityShield Suite (MCT OS v2.0 - Anti-Hacker & Rate Limiting)", () => {
  let shield: SecurityShield;

  beforeEach(() => {
    shield = new SecurityShield({
      globalLimitPerMinute: 5,
      loginIpLimitPerMinute: 3,
      loginEmailFailureLimit: 3,
      loginEmailLockoutSeconds: 60,
      jailDurationSeconds: 120,
      redisClient: null, // Test in-memory bounded engine
    });
  });

  describe("Scanner Probe & Malicious Tool Detection", () => {
    it("should detect sqlmap user agent", () => {
      const res = shield.isScannerProbe("/v1/contacts", "sqlmap/1.5.2#stable");
      expect(res.isMalicious).toBe(true);
      expect(res.reason).toContain("sqlmap");
    });

    it("should detect nikto and masscan tools", () => {
      expect(shield.isScannerProbe("/v1/auth/login", "Mozilla/5.0 (compatible; Nikto/2.1.6)").isMalicious).toBe(true);
      expect(shield.isScannerProbe("/v1/workspaces", "masscan/1.3.2").isMalicious).toBe(true);
    });

    it("should detect WordPress probes (.php, wp-admin, wp-login)", () => {
      expect(shield.isScannerProbe("/wp-login.php").isMalicious).toBe(true);
      expect(shield.isScannerProbe("/blog/wp-admin/install.php").isMalicious).toBe(true);
      expect(shield.isScannerProbe("/xmlrpc.php").isMalicious).toBe(true);
    });

    it("should detect environment file and credential exposure probes", () => {
      expect(shield.isScannerProbe("/.env").isMalicious).toBe(true);
      expect(shield.isScannerProbe("/.git/config").isMalicious).toBe(true);
      expect(shield.isScannerProbe("/dump.sql").isMalicious).toBe(true);
      expect(shield.isScannerProbe("/.aws/credentials").isMalicious).toBe(true);
    });

    it("should detect path traversal attacks", () => {
      expect(shield.isScannerProbe("/v1/files/../../../etc/passwd").isMalicious).toBe(true);
      expect(shield.isScannerProbe("/v1/media/..%2f..%2fconfig").isMalicious).toBe(true);
    });

    it("should allow legitimate API requests and standard browsers", () => {
      const res = shield.isScannerProbe("/v1/auth/login", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
      expect(res.isMalicious).toBe(false);
    });
  });

  describe("IP Jail Management", () => {
    it("should jail a malicious IP and report jailed status with retryAfter", async () => {
      const ip = "198.51.100.42";
      expect((await shield.checkIpJail(ip)).jailed).toBe(false);

      await shield.jailIp(ip, "Detected automated scanner attack", 120);

      const jailCheck = await shield.checkIpJail(ip);
      expect(jailCheck.jailed).toBe(true);
      expect(jailCheck.reason).toContain("Detected automated scanner attack");
      expect(jailCheck.retryAfterSeconds).toBeGreaterThan(0);
      expect(jailCheck.retryAfterSeconds).toBeLessThanOrEqual(120);
    });
  });

  describe("Login Brute Force & Credential Stuffing Protection", () => {
    it("should allow login attempts within configured rate limit", async () => {
      const ip = "203.0.113.10";
      const email = "operador@haven.com.br";

      const check = await shield.checkLoginRateLimit(ip, email);
      expect(check.allowed).toBe(true);
    });

    it("should block IP after exceeding login frequency threshold", async () => {
      const ip = "203.0.113.11";
      const email = "operador@haven.com.br";

      // 3 attempts allowed, 4th must be blocked
      for (let i = 0; i < 3; i++) {
        await shield.recordLoginFailure(ip, email);
      }

      const check = await shield.checkLoginRateLimit(ip, email);
      expect(check.allowed).toBe(false);
      expect(check.statusCode).toBe(429);
      expect(check.reason).toContain("Muitas tentativas de login a partir deste IP");
    });

    it("should lockout target email after consecutive login failures", async () => {
      const ip1 = "203.0.113.20";
      const ip2 = "203.0.113.21";
      const ip3 = "203.0.113.22";
      const targetEmail = "diretor@mct.br";

      // Simulating distributed credential stuffing against the same email
      await shield.recordLoginFailure(ip1, targetEmail);
      await shield.recordLoginFailure(ip2, targetEmail);
      await shield.recordLoginFailure(ip3, targetEmail);

      const check = await shield.checkLoginRateLimit("203.0.113.99", targetEmail);
      expect(check.allowed).toBe(false);
      expect(check.statusCode).toBe(429);
      expect(check.reason).toContain("Conta temporariamente protegida");
    });

    it("should reset email lockout when successful login occurs", async () => {
      const email = "vendedor@haven.com.br";
      await shield.recordLoginFailure("203.0.113.31", email);
      await shield.recordLoginFailure("203.0.113.32", email);

      // Successful login resets email counter
      await shield.resetLoginSuccess(email);

      // 1 more failure from a different IP should not lock out
      await shield.recordLoginFailure("203.0.113.33", email);
      const check = await shield.checkLoginRateLimit("203.0.113.34", email);
      expect(check.allowed).toBe(true);
    });
  });

  describe("Global Request Rate Limiting", () => {
    it("should track remaining quota and block when limit is exceeded", async () => {
      const ip = "192.0.2.55";

      for (let i = 0; i < 5; i++) {
        const res = await shield.checkGlobalRateLimit(ip);
        expect(res.allowed).toBe(true);
      }

      const blockedRes = await shield.checkGlobalRateLimit(ip);
      expect(blockedRes.allowed).toBe(false);
      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.remaining).toBe(0);
      expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
    });
  });
});
