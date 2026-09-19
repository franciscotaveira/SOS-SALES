import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createTestDatabasePools, decryptPayload } from "@sos-sales/database";
import { buildApp } from "../index";

describe("Webhook Ingress Routes (GET Challenge & POST Ingestion)", () => {
  const { ownerPool, ingressPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const rawAppSecret = "waba_app_secret_super_secure_2026";
  const rawVerifyToken = "independent_verify_token_xyz987";
  const endpointToken = "endpoint_token_test_1234567890abcdef";

  const endpointTokenHash = crypto
    .createHash("sha256")
    .update(endpointToken)
    .digest("hex");

  const verifyTokenHash = crypto
    .createHash("sha256")
    .update(rawVerifyToken)
    .digest("hex");

  // WAHA test channel fixtures
  const rawWahaApiKey = "waha_secret_token_live_2026";
  const wahaEndpointToken = "waha_endpoint_token_9876543210fedcba";
  const wahaEndpointTokenHash = crypto
    .createHash("sha256")
    .update(wahaEndpointToken)
    .digest("hex");

  let app: FastifyInstance;
  let workspaceId: string;
  let channelInstanceId: string;
  let credentialId: string;
  let wahaChannelInstanceId: string;
  let wahaCredentialId: string;

  beforeAll(async () => {
    // 1. Provision Organization and Workspace using ownerPool
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug) VALUES ('Webhook Test Org', $1) RETURNING id;
    `, [`org-webhook-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Webhook Workspace', 'ws-webhook-${Date.now()}')
      RETURNING id;
    `, [orgId]);
    workspaceId = wsRes.rows[0].id;

    // 2. Provision Encrypted Credential with rawAppSecret for Meta WABA
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(testMasterKey, "hex"), iv);
    const payloadStr = JSON.stringify({ app_secret: rawAppSecret, phone_number_id: "phone_123456" });
    const ciphertext = Buffer.concat([cipher.update(payloadStr, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const credRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_test_account', $2, $3, $4)
      RETURNING id;
    `, [
      workspaceId,
      ciphertext.toString("base64"),
      iv.toString("base64"),
      authTag.toString("base64"),
    ]);
    credentialId = credRes.rows[0].id;

    // 3. Provision Channel Instance with dedicated verify_token_hash for Meta WABA
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, verify_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'WABA Test Channel', '+5511999990000',
        $2, $3, $4, true
      ) RETURNING id;
    `, [workspaceId, endpointTokenHash, verifyTokenHash, credentialId]);
    channelInstanceId = chanRes.rows[0].id;

    // 4. Provision Encrypted Credential and Channel Instance for WAHA
    const wahaIv = crypto.randomBytes(12);
    const wahaCipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(testMasterKey, "hex"), wahaIv);
    const wahaPayloadStr = JSON.stringify({ api_key: rawWahaApiKey, webhook_secret: rawWahaApiKey, session: "default" });
    const wahaCiphertext = Buffer.concat([wahaCipher.update(wahaPayloadStr, "utf-8"), wahaCipher.final()]);
    const wahaAuthTag = wahaCipher.getAuthTag();

    const wahaCredRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'waha', 'waha_test_session', $2, $3, $4)
      RETURNING id;
    `, [
      workspaceId,
      wahaCiphertext.toString("base64"),
      wahaIv.toString("base64"),
      wahaAuthTag.toString("base64"),
    ]);
    wahaCredentialId = wahaCredRes.rows[0].id;

    const wahaChanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'waha', 'WAHA Test Channel', '+5511988880000',
        $2, $3, true
      ) RETURNING id;
    `, [workspaceId, wahaEndpointTokenHash, wahaCredentialId]);
    wahaChannelInstanceId = wahaChanRes.rows[0].id;

    // 5. Build Fastify app using the REAL ingressPool (role: sos_ingress_user)
    app = await buildApp({
      masterKeyHex: testMasterKey,
      ingressPool: ingressPool,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await ingressPool.end();
    await ownerPool.end();
  });

  describe("Startup Validation", () => {
    it("should fail fast during startup if master key is missing", async () => {
      const originalAppKey = process.env.APP_MASTER_KEY;
      const originalMctKey = process.env.MCT_CREDENTIALS_MASTER_KEY;
      delete process.env.APP_MASTER_KEY;
      delete process.env.MCT_CREDENTIALS_MASTER_KEY;

      try {
        await expect(
          buildApp({
            masterKeyHex: "",
            ingressPool,
          })
        ).rejects.toThrow("FATAL_STARTUP_CONFIG_ERROR");
      } finally {
        if (originalAppKey) process.env.APP_MASTER_KEY = originalAppKey;
        if (originalMctKey) process.env.MCT_CREDENTIALS_MASTER_KEY = originalMctKey;
      }
    });
  });

  describe("GET /v1/webhooks/whatsapp/:endpointToken (Meta Challenge Handshake)", () => {
    it("should return 404 when endpoint token does not exist without leaking token in instance", async () => {
      const secretToken = "non_existent_token_1234567890";
      const response = await app.inject({
        method: "GET",
        url: `/v1/webhooks/whatsapp/${secretToken}`,
        query: {
          "hub.mode": "subscribe",
          "hub.challenge": "123456789",
          "hub.verify_token": secretToken,
        },
      });

      expect(response.statusCode).toBe(404);
      const json = JSON.parse(response.body);
      expect(json.status).toBe(404);
      // P0 invariant: Endpoint token must NOT appear in instance or detail
      expect(json.instance).toBe("/v1/webhooks/whatsapp/[redacted]");
      expect(response.body).not.toContain(secretToken);
    });

    it("should return 400 when challenge query parameters are missing", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        query: {
          "hub.mode": "subscribe",
        },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.status).toBe(400);
      expect(json.instance).toBe("/v1/webhooks/whatsapp/[redacted]");
    });

    it("should return 403 when verify_token is the endpointToken (must be independent)", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        query: {
          "hub.mode": "subscribe",
          "hub.challenge": "test_challenge_code_999",
          "hub.verify_token": endpointToken, // Attempting to use endpointToken as verify_token
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).toBe("Forbidden");
    });

    it("should return 403 when verify_token is the app_secret (must be independent)", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        query: {
          "hub.mode": "subscribe",
          "hub.challenge": "test_challenge_code_999",
          "hub.verify_token": rawAppSecret, // Attempting to use app_secret as verify_token
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).toBe("Forbidden");
    });

    it("should return 200 with raw plain text challenge when independent verify_token matches", async () => {
      const testChallenge = "1158201444998877";
      const response = await app.inject({
        method: "GET",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        query: {
          "hub.mode": "subscribe",
          "hub.challenge": testChallenge,
          "hub.verify_token": rawVerifyToken,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/plain");
      expect(response.body).toBe(testChallenge);
    });
  });

  describe("POST /v1/webhooks/whatsapp/:endpointToken (Ingress Ingestion & Security)", () => {
    const rawPayload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_test_account",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "+5511999990000",
                  phone_number_id: "phone_123456",
                },
                messages: [
                  {
                    from: "+5511988887777",
                    id: "wamid.HBgLMTIzNDU2",
                    timestamp: "1710000000",
                    text: { body: "Olá, quero agendar uma demonstração" },
                    type: "text",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    });

    it("should return 401 when signature header is missing without leaking endpoint token", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        headers: {
          "content-type": "application/json",
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(401);
      const json = JSON.parse(response.body);
      expect(json.detail).toBe("Invalid webhook signature");
      expect(json.instance).toBe("/v1/webhooks/whatsapp/[redacted]");
      expect(response.body).not.toContain(endpointToken);
    });

    it("should return 401 when signature header is forged", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=" + "0".repeat(64),
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(401);
      const json = JSON.parse(response.body);
      expect(json.detail).toBe("Invalid webhook signature");
    });

    it("should return 401 when payload was tampered in transit", async () => {
      const validHmac = crypto
        .createHmac("sha256", rawAppSecret)
        .update(Buffer.from(rawPayload, "utf-8"))
        .digest("hex");

      const tamperedPayload = rawPayload.replace("demonstração", "fraude");

      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": `sha256=${validHmac}`,
        },
        payload: tamperedPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should accept authentic WABA webhook, encrypt with AAD, and persist to inbox using real sos_ingress_user", async () => {
      const validHmac = crypto
        .createHmac("sha256", rawAppSecret)
        .update(Buffer.from(rawPayload, "utf-8"))
        .digest("hex");

      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": `sha256=${validHmac}`,
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.received).toBe(true);
      expect(json.status).toBe("accepted");

      // Verify in database: channel_webhook_inbox must have the encrypted record
      const rawHash = crypto.createHash("sha256").update(Buffer.from(rawPayload)).digest("hex");
      const inboxRes = await ownerPool.query(
        "SELECT * FROM channel_webhook_inbox WHERE channel_instance_id = $1 AND raw_payload_hash = $2",
        [channelInstanceId, rawHash]
      );

      expect(inboxRes.rows).toHaveLength(1);
      const row = inboxRes.rows[0];
      expect(row.status).toBe("pending");
      expect(row.retry_count).toBe(0);
      expect(row.workspace_id).toBe(workspaceId);
      expect(row.key_version).toBe(1);

      // Verify payload was encrypted with AES-256-GCM + AAD
      const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
      const decrypted = decryptPayload(
        row.encrypted_payload,
        row.payload_iv,
        row.payload_auth_tag,
        testMasterKey,
        { aad }
      );
      expect(decrypted).toBe(rawPayload);

      // Tampered AAD must fail closed
      expect(() => {
        decryptPayload(
          row.encrypted_payload,
          row.payload_iv,
          row.payload_auth_tag,
          testMasterKey,
          { aad: "tampered:workspace:hash" }
        );
      }).toThrow("CRYPTO_PAYLOAD_ERROR");
    });

    it("should handle duplicate webhook delivery (replay attack) gracefully returning HTTP 200 without creating duplicate inbox row", async () => {
      const validHmac = crypto
        .createHmac("sha256", rawAppSecret)
        .update(Buffer.from(rawPayload, "utf-8"))
        .digest("hex");

      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": `sha256=${validHmac}`,
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.received).toBe(true);
      expect(json.status).toBe("duplicate");

      // Ensure count is still exactly 1
      const rawHash = crypto.createHash("sha256").update(Buffer.from(rawPayload)).digest("hex");
      const inboxRes = await ownerPool.query(
        "SELECT COUNT(*) FROM channel_webhook_inbox WHERE channel_instance_id = $1 AND raw_payload_hash = $2",
        [channelInstanceId, rawHash]
      );
      expect(Number(inboxRes.rows[0].count)).toBe(1);
    });

    it("should enforce rate limiting and return 429 when threshold is exceeded", async () => {
      const rateLimitedApp = await buildApp({
        masterKeyHex: testMasterKey,
        ingressPool,
        rateLimitMax: 3,
        rateLimitWindowMs: 10_000,
      });

      try {
        for (let i = 0; i < 3; i++) {
          const res = await rateLimitedApp.inject({
            method: "GET",
            url: `/v1/webhooks/whatsapp/${endpointToken}`,
            query: {
              "hub.mode": "subscribe",
              "hub.challenge": "123",
              "hub.verify_token": rawVerifyToken,
            },
          });
          expect(res.statusCode).toBe(200);
        }

        // 4th request exceeds rateLimitMax of 3
        const blockedRes = await rateLimitedApp.inject({
          method: "GET",
          url: `/v1/webhooks/whatsapp/${endpointToken}`,
          query: {
            "hub.mode": "subscribe",
            "hub.challenge": "123",
            "hub.verify_token": rawVerifyToken,
          },
        });

        expect(blockedRes.statusCode).toBe(429);
        const json = JSON.parse(blockedRes.body);
        expect(json.status).toBe(429);
        expect(json.instance).toBe("/v1/webhooks/whatsapp/[redacted]");
      } finally {
        await rateLimitedApp.close();
      }
    });
  });

  describe("POST /v1/webhooks/whatsapp/:endpointToken (WAHA Engine Ingress & Security)", () => {
    const rawWahaPayload = JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5511988887777@c.us_3EB0123456789",
        timestamp: 1710000000,
        from: "5511988887777@c.us",
        to: "5511988880000@c.us",
        body: "Olá via WAHA webhook",
      },
    });

    it("should accept authentic WAHA webhook with x-api-key header, encrypt with AAD, and persist to inbox", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${wahaEndpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-api-key": rawWahaApiKey,
        },
        payload: rawWahaPayload,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.received).toBe(true);
      expect(json.status).toBe("accepted");

      // Verify in database: channel_webhook_inbox must contain the record under WAHA channel instance
      const rawHash = crypto.createHash("sha256").update(Buffer.from(rawWahaPayload)).digest("hex");
      const inboxRes = await ownerPool.query(
        "SELECT * FROM channel_webhook_inbox WHERE channel_instance_id = $1 AND raw_payload_hash = $2",
        [wahaChannelInstanceId, rawHash]
      );

      expect(inboxRes.rows).toHaveLength(1);
      const row = inboxRes.rows[0];
      expect(row.status).toBe("pending");
      expect(row.retry_count).toBe(0);
      expect(row.workspace_id).toBe(workspaceId);
      expect(row.key_version).toBe(1);

      // Verify AAD decryption
      const aad = `${workspaceId}:${wahaChannelInstanceId}:${rawHash}`;
      const decrypted = decryptPayload(
        row.encrypted_payload,
        row.payload_iv,
        row.payload_auth_tag,
        testMasterKey,
        { aad }
      );
      expect(decrypted).toBe(rawWahaPayload);
    });

    it("should accept authentic WAHA webhook with authorization Bearer header", async () => {
      const bearerPayload = JSON.stringify({
        event: "message.ack",
        session: "default",
        payload: {
          id: "false_5511988887777@c.us_3EB0123456790",
          ack: 2,
        },
      });

      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${wahaEndpointToken}`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${rawWahaApiKey}`,
        },
        payload: bearerPayload,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.received).toBe(true);
      expect(json.status).toBe("accepted");
    });

    it("should accept authentic WAHA webhook with x-webhook-secret header", async () => {
      const secretHeaderPayload = JSON.stringify({
        event: "message.ack",
        session: "default",
        payload: {
          id: "false_5511988887777@c.us_3EB0123456791",
          ack: 3,
        },
      });

      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${wahaEndpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-webhook-secret": rawWahaApiKey,
        },
        payload: secretHeaderPayload,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.received).toBe(true);
      expect(json.status).toBe("accepted");
    });

    it("should return 401 when WAHA auth header is missing without leaking endpoint token", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${wahaEndpointToken}`,
        headers: {
          "content-type": "application/json",
        },
        payload: rawWahaPayload,
      });

      expect(response.statusCode).toBe(401);
      const json = JSON.parse(response.body);
      expect(json.detail).toBe("Invalid webhook signature");
      expect(json.instance).toBe("/v1/webhooks/whatsapp/[redacted]");
      expect(response.body).not.toContain(wahaEndpointToken);
    });

    it("should return 401 when WAHA auth token is forged or mismatched", async () => {
      const forgedPayload = JSON.stringify({
        event: "message",
        session: "default",
        payload: { body: "forged_payload_attack" },
      });

      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${wahaEndpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-api-key": "invalid_forged_key_12345",
        },
        payload: forgedPayload,
      });

      expect(response.statusCode).toBe(401);
      const json = JSON.parse(response.body);
      expect(json.detail).toBe("Invalid webhook signature");

      // Verify forged payload was NEVER persisted
      const forgedHash = crypto.createHash("sha256").update(Buffer.from(forgedPayload)).digest("hex");
      const inboxRes = await ownerPool.query(
        "SELECT COUNT(*) FROM channel_webhook_inbox WHERE channel_instance_id = $1 AND raw_payload_hash = $2",
        [wahaChannelInstanceId, forgedHash]
      );
      expect(Number(inboxRes.rows[0].count)).toBe(0);
    });

    it("should handle duplicate WAHA webhook delivery (replay) returning HTTP 200 duplicate without duplicate rows", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${wahaEndpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-api-key": rawWahaApiKey,
        },
        payload: rawWahaPayload,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.received).toBe(true);
      expect(json.status).toBe("duplicate");

      // Ensure count is still exactly 1
      const rawHash = crypto.createHash("sha256").update(Buffer.from(rawWahaPayload)).digest("hex");
      const inboxRes = await ownerPool.query(
        "SELECT COUNT(*) FROM channel_webhook_inbox WHERE channel_instance_id = $1 AND raw_payload_hash = $2",
        [wahaChannelInstanceId, rawHash]
      );
      expect(Number(inboxRes.rows[0].count)).toBe(1);
    });
  });

  describe("Keyring & Version Rotation Ingress (CH-06)", () => {
    it("should encrypt and store incoming webhook with active keyring version when keyring is configured", async () => {
      const keyV2 = "2222222222222222222222222222222222222222222222222222222222222222";

      const keyringApp = await buildApp({
        keyring: { 1: testMasterKey, 2: keyV2 },
        activeKeyVersion: 2,
        ingressPool,
        keyPrefix: `test:keyring:app:${Date.now()}`,
      });

      const rawRotationPayload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "entry-rotation-test",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { display_phone_number: "5511999990000", phone_number_id: "phone_12345" },
                  messages: [
                    {
                      from: "5511999992222",
                      id: "wamid.keyring.rotation.001",
                      timestamp: "1726700050",
                      type: "text",
                      text: { body: "Keyring rotation test" },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      });

      const hmac = crypto.createHmac("sha256", rawAppSecret).update(rawRotationPayload).digest("hex");

      const res = await keyringApp.inject({
        method: "POST",
        url: `/v1/webhooks/whatsapp/${endpointToken}`,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": `sha256=${hmac}`,
        },
        payload: rawRotationPayload,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.received).toBe(true);

      const rawHash = crypto.createHash("sha256").update(Buffer.from(rawRotationPayload)).digest("hex");
      const inboxRes = await ownerPool.query(
        "SELECT id, key_version, status, encrypted_payload, payload_iv, payload_auth_tag FROM channel_webhook_inbox WHERE channel_instance_id = $1 AND raw_payload_hash = $2",
        [channelInstanceId, rawHash]
      );
      expect(inboxRes.rows.length).toBe(1);
      expect(inboxRes.rows[0].key_version).toBe(2);

      const decrypted = decryptPayload(
        inboxRes.rows[0].encrypted_payload,
        inboxRes.rows[0].payload_iv,
        inboxRes.rows[0].payload_auth_tag,
        { 2: keyV2 },
        {
          aad: `${workspaceId}:${channelInstanceId}:${rawHash}`,
          keyVersion: 2,
        }
      );
      expect(decrypted).toBe(rawRotationPayload);

      await keyringApp.close();
    });
  });
});

