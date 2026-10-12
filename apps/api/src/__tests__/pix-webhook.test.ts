import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createTestDatabasePools } from "@sos-sales/database";
import { buildApp } from "../index";

/**
 * G6 — PSP Pix webhook: HMAC (timing-safe), timestamp window, one-time eventId, idempotent
 * settlement, fail-closed without secret. No real PSP; no schema change.
 */
describe("Pix PSP webhook (G6)", () => {
  const { ownerPool, ingressPool } = createTestDatabasePools();
  const masterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const secret = crypto.randomBytes(32).toString("hex");
  const suffix = crypto.randomBytes(6).toString("hex");
  const originalSecret = process.env.PIX_WEBHOOK_SECRET;

  let app: FastifyInstance;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let threadId: string;
  let contactId: string;

  const newCharge = async (amountCents = 5000): Promise<string> => {
    const res = await ownerPool.query(
      `INSERT INTO pix_charges (workspace_id, thread_id, contact_id, title, amount_cents, pix_code, expires_at)
       VALUES ($1, $2, $3, 'Teste PSP', $4, '000201test', now() + interval '1 hour') RETURNING id;`,
      [workspaceId, threadId, contactId, amountCents]
    );
    return res.rows[0].id;
  };

  const sign = (body: string, ts: string, key = secret) =>
    crypto.createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");

  const send = (
    ws: string,
    event: Record<string, unknown>,
    opts: { ts?: string; key?: string; signature?: string } = {}
  ) => {
    const body = JSON.stringify(event);
    const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
    return app.inject({
      method: "POST",
      url: `/v1/webhooks/pix/${ws}`,
      headers: {
        "content-type": "application/json",
        "x-psp-timestamp": ts,
        "x-psp-signature": opts.signature ?? sign(body, ts, opts.key),
      },
      payload: body,
    });
  };

  const evt = (chargeId: string, amountCents = 5000) => ({
    eventId: `evt_${crypto.randomBytes(8).toString("hex")}`,
    chargeId,
    amountCents,
    status: "PAID",
  });

  const chargeRow = async (id: string) =>
    (await ownerPool.query("SELECT status, verification_method, verified_by_user_id FROM pix_charges WHERE id = $1", [id]))
      .rows[0];

  beforeAll(async () => {
    process.env.PIX_WEBHOOK_SECRET = secret;
    const org = await ownerPool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Pix Org', $1) RETURNING id;`,
      [`org-pix-${suffix}`]
    );
    const mkWs = async (n: string) =>
      (
        await ownerPool.query(
          `INSERT INTO workspaces (organization_id, name, slug) VALUES ($1, $2, $3) RETURNING id;`,
          [org.rows[0].id, n, `ws-pix-${n}-${suffix}`]
        )
      ).rows[0].id as string;
    workspaceId = await mkWs("a");
    otherWorkspaceId = await mkWs("b");

    contactId = (
      await ownerPool.query(
        `INSERT INTO contacts (workspace_id, phone_e164, name) VALUES ($1, '+5511955550001', 'Pix Contact') RETURNING id;`,
        [workspaceId]
      )
    ).rows[0].id;
    const channelId = (
      await ownerPool.query(
        `INSERT INTO channel_instances (workspace_id, provider, display_name, endpoint_token_hash, is_active, status)
         VALUES ($1, 'waha', 'Pix chan', $2, false, 'unconfigured') RETURNING id;`,
        [workspaceId, crypto.createHash("sha256").update(`pix-${suffix}`).digest("hex")]
      )
    ).rows[0].id;
    threadId = (
      await ownerPool.query(
        `INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id) VALUES ($1, $2, $3) RETURNING id;`,
        [workspaceId, channelId, contactId]
      )
    ).rows[0].id;

    app = await buildApp({ masterKeyHex: masterKey, ingressPool });
  });

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.PIX_WEBHOOK_SECRET;
    else process.env.PIX_WEBHOOK_SECRET = originalSecret;
    if (app) await app.close();
    await ingressPool.end();
    await ownerPool.end();
  });

  it("settles a pending charge with a valid signature (BANK_WEBHOOK, no human actor)", async () => {
    const id = await newCharge();
    const res = await send(workspaceId, evt(id));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe("settled");
    const row = await chargeRow(id);
    expect(row.status).toBe("PAID");
    expect(row.verification_method).toBe("BANK_WEBHOOK");
    expect(row.verified_by_user_id).toBeNull();
  });

  it("rejects an invalid signature with 401 and leaves the charge PENDING", async () => {
    const id = await newCharge();
    const res = await send(workspaceId, evt(id), { key: "wrong_secret_wrong_secret_wrong_secret_00" });
    expect(res.statusCode).toBe(401);
    expect((await chargeRow(id)).status).toBe("PENDING");
  });

  it("rejects a malformed signature with 401", async () => {
    const id = await newCharge();
    const res = await send(workspaceId, evt(id), { signature: "zz" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a stale timestamp (outside the window) with 401 even when correctly signed", async () => {
    const id = await newCharge();
    const staleTs = String(Math.floor(Date.now() / 1000) - 3600);
    const res = await send(workspaceId, evt(id), { ts: staleTs });
    expect(res.statusCode).toBe(401);
    expect((await chargeRow(id)).status).toBe("PENDING");
  });

  it("is idempotent: same eventId twice returns 2xx and settles once", async () => {
    const id = await newCharge();
    const event = evt(id);
    const first = await send(workspaceId, event);
    const second = await send(workspaceId, event);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).status).toBe("duplicate");
    expect((await chargeRow(id)).status).toBe("PAID");
  });

  it("is idempotent across distinct eventIds for an already paid charge", async () => {
    const id = await newCharge();
    await send(workspaceId, evt(id));
    const again = await send(workspaceId, evt(id));
    expect(again.statusCode).toBe(200);
    expect(JSON.parse(again.body).status).toBe("already_settled");
  });

  it("rejects an amount mismatch with 409 and leaves the charge PENDING", async () => {
    const id = await newCharge(5000);
    const res = await send(workspaceId, evt(id, 4999));
    expect(res.statusCode).toBe(409);
    expect((await chargeRow(id)).status).toBe("PENDING");
  });

  it("returns 404 for an unknown charge", async () => {
    const res = await send(workspaceId, evt(crypto.randomUUID()));
    expect(res.statusCode).toBe(404);
  });

  it("cannot settle a charge through another workspace's URL (tenant isolation)", async () => {
    const id = await newCharge();
    const res = await send(otherWorkspaceId, evt(id));
    expect(res.statusCode).toBe(404);
    expect((await chargeRow(id)).status).toBe("PENDING");
  });

  it("rejects unknown fields in the event payload with 400", async () => {
    const id = await newCharge();
    const res = await send(workspaceId, { ...evt(id), workspaceId: otherWorkspaceId });
    expect(res.statusCode).toBe(400);
  });

  it("fails closed with 503 when the secret is not configured", async () => {
    delete process.env.PIX_WEBHOOK_SECRET;
    try {
      const id = await newCharge();
      const res = await send(workspaceId, evt(id));
      expect(res.statusCode).toBe(503);
      expect((await chargeRow(id)).status).toBe("PENDING");
    } finally {
      process.env.PIX_WEBHOOK_SECRET = secret;
    }
  });
});
