import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  createTestDatabasePools,
  resetTestQueueState,
  withTenantTransaction,
  createCommercialJourney,
  recordCommercialOutcome,
} from "@sos-sales/database";
import { CapiDispatcher } from "../processors/capi-dispatcher";
import { WorkerRuntime } from "../index";

describe("Meta CAPI Conversion Dispatcher Integration Tests", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  let workspaceId: string;
  let contactId: string;
  let userId: string;

  beforeAll(async () => {
    await resetTestQueueState(ownerPool);

    // 1. Provision Org & Workspace
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('CAPI Test Org', $1)
      RETURNING id;
    `, [`org-capi-${crypto.randomUUID()}`]);
    const orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'CAPI Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-capi-${crypto.randomUUID()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. User & Membership
    const userRes = await ownerPool.query(`
      INSERT INTO users (email, name)
      VALUES ($1, 'CAPI Operator')
      RETURNING id;
    `, [`capi-${crypto.randomUUID()}@example.com`]);
    userId = userRes.rows[0].id;

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'admin');
    `, [workspaceId, userId]);

    // 3. Contact
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999998888', 'Lead CAPI')
      RETURNING id;
    `, [workspaceId]);
    contactId = contactRes.rows[0].id;
  });

  afterAll(async () => {
    await ownerPool.end();
    await workerPool.end();
  });

  it("CAPI-01: should claim and dispatch a queued conversion event in sandbox mode, transitioning to ACCEPTED with receipt", async () => {
    // 1. Create a commercial journey & record won outcome
    const { conversionEvent } = await withTenantTransaction(workspaceId, async (client) => {
      const journey = await createCommercialJourney(client, workspaceId, {
        contactId,
        title: "Deal Venda CAPI Test",
        stage: "won",
        attributionSource: "ctwa_meta",
        ctwaClid: "ctwa_test_clid_12345",
        estimatedValueCents: 49700,
      });

      return recordCommercialOutcome(client, workspaceId, {
        journeyId: journey.id,
        status: "won",
        valueCents: 49700,
        currency: "BRL",
        registeredByUserId: userId,
        userPhoneE164: "+5511999998888",
      });
    });

    expect(conversionEvent).not.toBeNull();
    expect(conversionEvent!.status).toBe("QUEUED");

    // 2. Worker claims batch
    const dispatcher = new CapiDispatcher();
    const batch = await dispatcher.claimBatch(workerPool, 10);
    const item = batch.find((e) => e.id === conversionEvent!.id);
    expect(item).toBeDefined();

    // 3. Dispatch item
    const result = await dispatcher.dispatchItem(workerPool, item!);
    expect(result.status).toBe("accepted");
    expect(result.fbtraceId).toBeDefined();

    // 4. Verify in DB
    const checkRes = await ownerPool.query(`
      SELECT status, provider_receipt, error_message
      FROM conversion_events
      WHERE id = $1;
    `, [conversionEvent!.id]);

    expect(checkRes.rows[0].status).toBe("ACCEPTED");
    expect(checkRes.rows[0].error_message).toBeNull();
    const receipt = checkRes.rows[0].provider_receipt;
    expect(receipt.events_received).toBe(1);
    expect(receipt.fbtrace_id).toBe(result.fbtraceId);
  });

  it("CAPI-02: should dispatch conversion payload to an HTTP endpoint and record real provider receipt", async () => {
    let receivedPayload: any = null;

    // Start a temporary HTTP server acting as Meta CAPI endpoint
    const server = http.createServer((req, res) => {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          receivedPayload = JSON.parse(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              events_received: 1,
              fbtrace_id: "fbtrace_live_test_998877",
            })
          );
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const endpointUrl = `http://127.0.0.1:${port}/events`;

    try {
      // 1. Create journey & outcome
      const { conversionEvent } = await withTenantTransaction(workspaceId, async (client) => {
        const journey = await createCommercialJourney(client, workspaceId, {
          contactId,
          title: "Deal HTTP Endpoint Test",
          stage: "won",
          attributionSource: "ctwa_meta",
          ctwaClid: "ctwa_live_clid_67890",
          estimatedValueCents: 120000,
        });

        return recordCommercialOutcome(client, workspaceId, {
          journeyId: journey.id,
          status: "won",
          valueCents: 120000,
          currency: "BRL",
          registeredByUserId: userId,
          userPhoneE164: "+5511999998888",
        });
      });

      expect(conversionEvent).not.toBeNull();

      // 2. Dispatch using custom endpoint
      const dispatcher = new CapiDispatcher({
        endpointUrl,
        accessToken: "EAAB_test_mock_token",
      });

      const batch = await dispatcher.claimBatch(workerPool, 10);
      const targetItem = batch.find((e) => e.id === conversionEvent!.id);
      expect(targetItem).toBeDefined();

      const result = await dispatcher.dispatchItem(workerPool, targetItem!);
      expect(result.status).toBe("accepted");
      expect(result.fbtraceId).toBe("fbtrace_live_test_998877");

      // Verify payload sent to Meta
      expect(receivedPayload).not.toBeNull();
      expect(receivedPayload.data).toHaveLength(1);
      expect(receivedPayload.data[0].event_name).toBe("Purchase");
      expect(receivedPayload.data[0].custom_data.value).toBe(1200);
      expect(receivedPayload.data[0].user_data.ctwa_clid).toBe("ctwa_live_clid_67890");

      // Verify record updated in DB
      const checkRes = await ownerPool.query(`
        SELECT status, provider_receipt
        FROM conversion_events
        WHERE id = $1;
      `, [conversionEvent!.id]);

      expect(checkRes.rows[0].status).toBe("ACCEPTED");
      expect(checkRes.rows[0].provider_receipt.fbtrace_id).toBe("fbtrace_live_test_998877");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("CAPI-03: should transition conversion event to FAILED and record error when endpoint rejects request", async () => {
    // Server returning HTTP 500 error
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Internal Graph API Error" } }));
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const endpointUrl = `http://127.0.0.1:${port}/events`;

    try {
      // 1. Create journey & outcome
      const { conversionEvent } = await withTenantTransaction(workspaceId, async (client) => {
        const journey = await createCommercialJourney(client, workspaceId, {
          contactId,
          title: "Deal Error Handling Test",
          stage: "won",
          attributionSource: "organic_whatsapp",
          estimatedValueCents: 50000,
        });

        return recordCommercialOutcome(client, workspaceId, {
          journeyId: journey.id,
          status: "won",
          valueCents: 50000,
          currency: "BRL",
          registeredByUserId: userId,
        });
      });

      expect(conversionEvent).not.toBeNull();

      const dispatcher = new CapiDispatcher({ endpointUrl });
      const batch = await dispatcher.claimBatch(workerPool, 10);
      const targetItem = batch.find((e) => e.id === conversionEvent!.id);
      expect(targetItem).toBeDefined();

      const result = await dispatcher.dispatchItem(workerPool, targetItem!);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("Meta CAPI endpoint responded HTTP 500");

      const checkRes = await ownerPool.query(`
        SELECT status, error_message
        FROM conversion_events
        WHERE id = $1;
      `, [conversionEvent!.id]);

      expect(checkRes.rows[0].status).toBe("FAILED");
      expect(checkRes.rows[0].error_message).toContain("HTTP 500");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("CAPI-04: should automatically claim and dispatch conversion events during WorkerRuntime.runSingleTick", async () => {
    // 1. Create journey & outcome with won status (R$ 850,00)
    const { conversionEvent } = await withTenantTransaction(workspaceId, async (client) => {
      const journey = await createCommercialJourney(client, workspaceId, {
        contactId,
        title: "Deal WorkerRuntime Integration Test",
        stage: "won",
        attributionSource: "ctwa_meta",
        ctwaClid: "ctwa_runtime_clid_112233",
        estimatedValueCents: 85000,
      });

      return recordCommercialOutcome(client, workspaceId, {
        journeyId: journey.id,
        status: "won",
        valueCents: 85000,
        currency: "BRL",
        registeredByUserId: userId,
        userPhoneE164: "+5511999998888",
      });
    });

    expect(conversionEvent).not.toBeNull();
    expect(conversionEvent!.status).toBe("QUEUED");

    // 2. Instantiate and start WorkerRuntime
    const runtime = new WorkerRuntime({
      workerId: "test-capi-runtime-worker",
      masterKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      workerPool,
      pollIntervalMs: 500,
      batchSize: 5,
    });

    await runtime.start();
    try {
      // Wait for WorkerRuntime loop to process and dispatch the conversion event
      let accepted = false;
      for (let i = 0; i < 20; i++) {
        const checkRes = await ownerPool.query(`
          SELECT status, provider_receipt
          FROM conversion_events
          WHERE id = $1;
        `, [conversionEvent!.id]);

        if (checkRes.rows[0]?.status === "ACCEPTED") {
          accepted = true;
          expect(checkRes.rows[0].provider_receipt.events_received).toBe(1);
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(accepted).toBe(true);
    } finally {
      await runtime.stop();
    }
  });
});
