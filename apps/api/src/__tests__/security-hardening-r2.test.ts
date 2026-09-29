import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

describe("R2 Security Hardening Integration (SSRF, State Machine, Keyring, Least Privilege)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { ownerPool, appPool, workerPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceId: string;
  let orgId: string;
  let adminUserId: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 1. Provision Org & Workspace
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('R2 Security Org', $1)
       RETURNING id;`,
      [`org-r2-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'R2 Security Workspace', $2)
       RETURNING id;`,
      [orgId, `ws-r2-${Date.now()}`]
    );
    workspaceId = wsRes.rows[0].id;

    // 2. Admin User
    adminUserId = crypto.randomUUID();
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Security Admin');`,
      [adminUserId, `admin-r2-${Date.now()}@example.com`]
    );
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin');`,
      [workspaceId, adminUserId]
    );

    const encoder = new TextEncoder();
    adminToken = await new SignJWT({
      sub: adminUserId,
      email: "security-admin@example.com",
      workspace_id: workspaceId,
      role: "admin",
      permissions: ["workspace:manage", "workspace:read"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(encoder.encode(jwtSecret));
  });

  afterAll(async () => {
    await app.close();
    await ownerPool.end();
    await appPool.end();
    await workerPool.end();
  });

  describe("S-01: SSRF Guard on Channel Endpoints", () => {
    it("should reject WAHA test connection pointing to metadata/loopback with HTTP 400", async () => {
      const oldEnv = process.env.NODE_ENV;
      const oldAllow = process.env.ALLOW_LOCAL_NETWORK_CHANNELS;
      const oldLab = process.env.ENABLE_LAB_SYNTHETIC;
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_LOCAL_NETWORK_CHANNELS;
      delete process.env.ENABLE_LAB_SYNTHETIC;

      try {
        const res = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspaceId}/channels/test-connection`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          payload: {
            provider: "waha",
            credentials: {
              baseUrl: "http://169.254.169.254/latest/meta-data",
              apiKey: "mock-key",
            },
          },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/SSRF|privado|link-local|BLOCKED/i);
      } finally {
        process.env.NODE_ENV = oldEnv;
        if (oldAllow !== undefined) process.env.ALLOW_LOCAL_NETWORK_CHANNELS = oldAllow;
        if (oldLab !== undefined) process.env.ENABLE_LAB_SYNTHETIC = oldLab;
      }
    });

    it("should reject Evolution test connection pointing to internal host with HTTP 400", async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_LOCAL_NETWORK_CHANNELS;
      delete process.env.ENABLE_LAB_SYNTHETIC;

      try {
        const res = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspaceId}/channels/test-connection`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          payload: {
            provider: "evolution",
            credentials: {
              baseUrl: "http://10.0.0.5:8080",
              apiKey: "mock-evolution-key",
            },
          },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/SSRF|privado|BLOCKED/i);
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });
  });

  describe("S-02: Channel State Machine Lifecycle & Active Sync Invariant", () => {
    let createdChannelId: string;

    it("should create channel in unconfigured status with is_active = false", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          provider: "waha",
          displayName: "Support WhatsApp WAHA",
          phoneNumberE164: "+5511988887777",
          status: "unconfigured",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.channel).toBeDefined();
      expect(body.channel.id).toBeDefined();
      expect(body.channel.status).toBe("unconfigured");
      expect(body.channel.isActive).toBe(false);
      createdChannelId = body.channel.id;

      // Verify in DB directly
      const dbCheck = await ownerPool.query(
        `SELECT status, is_active FROM channel_instances WHERE id = $1;`,
        [createdChannelId]
      );
      expect(dbCheck.rows[0].status).toBe("unconfigured");
      expect(dbCheck.rows[0].is_active).toBe(false);
    });

    it("should transition status to validating and pairing while keeping is_active = false", async () => {
      // Step 1: validating
      const resVal = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "validating" },
      });
      expect(resVal.statusCode).toBe(200);
      expect(JSON.parse(resVal.body).status).toBe("validating");
      expect(JSON.parse(resVal.body).isActive).toBe(false);

      // Step 2: pairing
      const resPair = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "pairing" },
      });
      expect(resPair.statusCode).toBe(200);
      expect(JSON.parse(resPair.body).status).toBe("pairing");
      expect(JSON.parse(resPair.body).isActive).toBe(false);
    });

    it("should transition to connected and automatically activate is_active = true", async () => {
      const resConn = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "connected" },
      });
      expect(resConn.statusCode).toBe(200);
      const body = JSON.parse(resConn.body);
      expect(body.status).toBe("connected");
      expect(body.isActive).toBe(true);

      const dbCheck = await ownerPool.query(
        `SELECT status, is_active FROM channel_instances WHERE id = $1;`,
        [createdChannelId]
      );
      expect(dbCheck.rows[0].status).toBe("connected");
      expect(dbCheck.rows[0].is_active).toBe(true);
    });

    it("should transition to revoked via POST /revoke endpoint and sync is_active = false", async () => {
      const resRev = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/revoke`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(resRev.statusCode).toBe(200);
      const body = JSON.parse(resRev.body);
      expect(body.success).toBe(true);
      expect(body.status).toBe("revoked");

      const dbCheck = await ownerPool.query(
        `SELECT status, is_active FROM channel_instances WHERE id = $1;`,
        [createdChannelId]
      );
      expect(dbCheck.rows[0].status).toBe("revoked");
      expect(dbCheck.rows[0].is_active).toBe(false);
    });

    it("should reject invalid status with HTTP 400 Bad Request", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "non_existent_status" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("S-03: Keyring Version Persistence & Rotation Decryption", () => {
    it("should persist key_version when configuring provider credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          provider: "waha",
          displayName: "WAHA Keyring Channel",
          credentials: {
            baseUrl: "https://waha.example.com",
            apiKey: "waha-secret-key-12345",
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.body);
      expect(created.channel.id).toBeDefined();

      const credRow = await ownerPool.query(
        `SELECT key_version, status FROM provider_credentials WHERE workspace_id = $1 AND account_id = 'waha_keyring_channel';`,
        [workspaceId]
      );

      expect(credRow.rows.length).toBe(1);
      expect(credRow.rows[0].key_version).toBeDefined();
      expect(credRow.rows[0].key_version.length).toBeGreaterThan(0);
      expect(credRow.rows[0].status).toBe("ACTIVE");
    });
  });

  describe("S-04: Operational Table Immutability (Least Privilege)", () => {
    it("should forbid DELETE on pix_charges for application/appPool user", async () => {
      await expect(
        appPool.query(`DELETE FROM pix_charges WHERE workspace_id = $1;`, [workspaceId])
      ).rejects.toThrow(/permission denied for table pix_charges/i);
    });

    it("should forbid DELETE on commercial_proposals for application/appPool user", async () => {
      await expect(
        appPool.query(`DELETE FROM commercial_proposals WHERE workspace_id = $1;`, [workspaceId])
      ).rejects.toThrow(/permission denied for table commercial_proposals/i);
    });

    it("should forbid DELETE on commercial_outcomes for application/appPool user", async () => {
      await expect(
        appPool.query(`DELETE FROM commercial_outcomes WHERE workspace_id = $1;`, [workspaceId])
      ).rejects.toThrow(/permission denied for table commercial_outcomes/i);
    });
  });
});
