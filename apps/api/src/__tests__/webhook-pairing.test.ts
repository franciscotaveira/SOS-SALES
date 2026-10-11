import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createTestDatabasePools } from "@sos-sales/database";
import { buildApp } from "../index";

/**
 * G2 — WAHA channels in QR pairing (status='pairing', is_active=false by schema constraint)
 * may deliver ONLY authenticated `session.status` events. Everything else stays 404.
 */
describe("Webhook Ingress — WAHA pairing (G2)", () => {
  const { ownerPool, ingressPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const rawKey = `waha_pairing_key_${crypto.randomBytes(6).toString("hex")}`;
  const suffix = crypto.randomBytes(6).toString("hex");

  const hash = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
  const pairingToken = `pairing_token_${suffix}`;
  const inactiveToken = `inactive_token_${suffix}`;
  const unknownToken = `unknown_token_${suffix}`;

  let app: FastifyInstance;
  let workspaceId: string;
  let pairingChannelId: string;

  const insertChannel = async (
    token: string,
    credentialId: string,
    status: "pairing" | "unconfigured"
  ): Promise<string> => {
    const res = await ownerPool.query(
      `INSERT INTO channel_instances (
         workspace_id, provider, display_name, phone_number_e164,
         endpoint_token_hash, credential_id, is_active, status
       ) VALUES ($1, 'waha', $2, NULL, $3, $4, false, $5) RETURNING id;`,
      [workspaceId, `WAHA ${status} ${suffix}`, hash(token), credentialId, status]
    );
    return res.rows[0].id;
  };

  beforeAll(async () => {
    const org = await ownerPool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Pairing Org', $1) RETURNING id;`,
      [`org-pairing-${suffix}`]
    );
    const ws = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug) VALUES ($1, 'Pairing WS', $2) RETURNING id;`,
      [org.rows[0].id, `ws-pairing-${suffix}`]
    );
    workspaceId = ws.rows[0].id;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(testMasterKey, "hex"), iv);
    const payload = JSON.stringify({ api_key: rawKey, webhook_secret: rawKey, session: "haven" });
    const ciphertext = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]);
    const cred = await ownerPool.query(
      `INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
       VALUES ($1, 'waha', $2, $3, $4, $5) RETURNING id;`,
      [
        workspaceId,
        `waha_pairing_${suffix}`,
        ciphertext.toString("base64"),
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
      ]
    );

    pairingChannelId = await insertChannel(pairingToken, cred.rows[0].id, "pairing");
    await insertChannel(inactiveToken, cred.rows[0].id, "unconfigured");

    app = await buildApp({ masterKeyHex: testMasterKey, ingressPool });
  });

  afterAll(async () => {
    if (app) await app.close();
    await ingressPool.end();
    await ownerPool.end();
  });

  const post = (token: string, body: unknown, apiKey: string | null = rawKey) =>
    app.inject({
      method: "POST",
      url: `/v1/webhooks/whatsapp/${token}`,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      payload: JSON.stringify(body),
    });

  const statusEvent = (nonce: string) => ({
    event: "session.status",
    session: "haven",
    payload: { status: "SCAN_QR_CODE", nonce },
  });

  it("accepts an authenticated session.status for a channel in pairing", async () => {
    const res = await post(pairingToken, statusEvent(crypto.randomUUID()));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).received).toBe(true);

    const inbox = await ownerPool.query(
      "SELECT count(*)::int AS n FROM channel_webhook_inbox WHERE channel_instance_id = $1",
      [pairingChannelId]
    );
    expect(inbox.rows[0].n).toBe(1);
  });

  it("returns 404 for a non-status event (message) on a pairing channel and persists nothing new", async () => {
    const before = await ownerPool.query(
      "SELECT count(*)::int AS n FROM channel_webhook_inbox WHERE channel_instance_id = $1",
      [pairingChannelId]
    );
    const res = await post(pairingToken, {
      event: "message",
      session: "haven",
      payload: { id: crypto.randomUUID(), body: "oi" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(pairingToken);

    const after = await ownerPool.query(
      "SELECT count(*)::int AS n FROM channel_webhook_inbox WHERE channel_instance_id = $1",
      [pairingChannelId]
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("returns 401 for session.status with a forged API key on a pairing channel", async () => {
    const res = await post(pairingToken, statusEvent(crypto.randomUUID()), "forged_key");
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for session.status without credentials on a pairing channel", async () => {
    const res = await post(pairingToken, statusEvent(crypto.randomUUID()), null);
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await post(unknownToken, statusEvent(crypto.randomUUID()));
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for an inactive channel that is not in pairing", async () => {
    const res = await post(inactiveToken, statusEvent(crypto.randomUUID()));
    expect(res.statusCode).toBe(404);
  });
});
