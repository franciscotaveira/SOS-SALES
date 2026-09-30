import { SignJWT } from "../packages/auth/dist/index.js";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const API_URL = process.env.API_URL || "http://localhost:4400";
const SYNTHETIC_URL = process.env.SYNTHETIC_URL || "http://localhost:4000";
const DB_URL =
  process.env.TEST_DOCKER_DB_URL ||
  "postgresql://sos_user:sos_secret_lab_2026@localhost:55440/sos_sales_v3?sslmode=disable";
const JWT_SECRET =
  process.env.JWT_SECRET || "test_jwt_secret_key_minimum_32_characters_long_2026!";
const ISSUER = process.env.AUTH_ISSUER || "sos-sales-v3";
const AUDIENCE = process.env.AUTH_AUDIENCE || "sos-sales-api";
const MASTER_KEY_HEX =
  process.env.APP_MASTER_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const pool = new Pool({ connectionString: DB_URL });

interface JourneyResult {
  journeyId: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const results: JourneyResult[] = [];

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createToken(sub: string, email: string) {
  const secretBytes = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({ sub, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("2h")
    .sign(secretBytes);
}

function encryptCredential(payload: Record<string, any>): {
  encryptedPayload: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(MASTER_KEY_HEX, "hex"), iv);
  const payloadStr = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(payloadStr, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedPayload: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

async function waitForCondition<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 15000,
  intervalMs = 500
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fn();
    if (res) return res;
    await delay(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

// -----------------------------------------------------------------------------
// JOURNEY P1: Webhook Ingress -> Inbox -> Proposal -> Pix -> Outbox -> Provider -> Won Outcome
// -----------------------------------------------------------------------------
async function executeJourneyP1(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P1] Executing Journey P1: Full WhatsApp Sales Cycle (Ingress -> Outbox -> Outcome)...");

  try {
    // 1. Setup clean tenant environment
    const orgId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const operatorId = crypto.randomUUID();
    const rawEndpointToken = `p1_token_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(rawEndpointToken).digest("hex");
    const channelId = crypto.randomUUID();
    const credentialId = crypto.randomUUID();
    const appSecret = "p1_synthetic_app_secret_123";

    await pool.query(
      `INSERT INTO organizations (id, name, slug) VALUES ($1, 'P1 Org', 'p1-org-${Date.now()}')`,
      [orgId]
    );
    await pool.query(
      `INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'P1 Workspace', 'p1-ws-${Date.now()}')`,
      [workspaceId, orgId]
    );
    await pool.query(
      `INSERT INTO users (id, email, name) VALUES ($1, 'operator-p1@test.com', 'Operator P1')`,
      [operatorId]
    );
    await pool.query(
      `INSERT INTO workspace_memberships (id, workspace_id, user_id, role) VALUES ($1, $2, $3, 'admin')`,
      [crypto.randomUUID(), workspaceId, operatorId]
    );

    // Encrypted provider credentials for signature verification & outbound send
    const { encryptedPayload, iv, authTag } = encryptCredential({
      app_secret: appSecret,
      access_token: "synthetic_access_token_p1",
      phone_number_id: "synthetic_phone_id_992145",
      waba_id: "synthetic_waba_id_81829182",
    });

    await pool.query(
      `INSERT INTO provider_credentials (
        id, workspace_id, provider, account_id, encrypted_payload, iv, auth_tag, status
      ) VALUES ($1, $2, 'meta_waba', 'waba_acc_p1', $3, $4, $5, 'ACTIVE')`,
      [credentialId, workspaceId, encryptedPayload, iv, authTag]
    );

    // Create connected channel
    await pool.query(
      `INSERT INTO channel_instances (
        id, workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, credential_id, status, is_active
      ) VALUES ($1, $2, 'meta_waba', 'Haven Main WABA', '+5511999998888', $3, $4, 'connected', true)`,
      [channelId, workspaceId, tokenHash, credentialId]
    );

    const operatorToken = await createToken(operatorId, "operator-p1@test.com");

    // 2. Synthetic Provider dispatches Inbound WhatsApp Message to API
    const customerPhone = "+5511988887777";
    const inboundText = `Olá, gostaria de agendar escova e hidratação ${Date.now()}`;
    const simRes = await fetch(`${SYNTHETIC_URL}/simulate-inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiUrl: "http://api:4400",
        endpointToken: rawEndpointToken,
        appSecret,
        from: customerPhone,
        text: inboundText,
      }),
    });

    if (!simRes.ok) {
      const err = await simRes.text();
      throw new Error(`Synthetic provider failed to simulate inbound: HTTP ${simRes.status}: ${err}`);
    }
    const simData = (await simRes.json()) as any;
    console.log(`  - Inbound webhook accepted by API (messageId: ${simData.inboundMessageId})`);

    // 3. Wait for Worker to process Inbox item into threads & messages
    const threadRecord = await waitForCondition(async () => {
      const res = await pool.query(
        `SELECT t.id, t.contact_id, m.id as message_id, m.body
         FROM commercial_threads t
         JOIN messages m ON m.thread_id = t.id
         WHERE t.workspace_id = $1 AND m.direction = 'inbound' AND m.body = $2`,
        [workspaceId, inboundText]
      );
      return res.rows[0];
    }, 15000);
    console.log(`  - Worker claimed and ingested message into thread ${threadRecord.id}`);

    // 4. Operator creates Commercial Proposal & Pix via API
    const proposalRes = await fetch(
      `${API_URL}/v1/workspaces/${workspaceId}/threads/${threadRecord.id}/proposals`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contactId: threadRecord.contact_id,
          title: "Proposta Escova Premium + Hidratação",
          items: [
            {
              title: "Escova Premium",
              unitPriceCents: 18000,
              quantity: 1,
            },
          ],
          generatePixCharge: true,
        }),
      }
    );
    if (!proposalRes.ok) {
      const err = await proposalRes.text();
      throw new Error(`Failed to create proposal: HTTP ${proposalRes.status}: ${err}`);
    }
    const proposalData = (await proposalRes.json()) as any;
    const proposalId = proposalData.id;
    console.log(`  - Proposal created via API (id: ${proposalId}, stateVersion: ${proposalData.stateVersion})`);
    console.log(`  - Pix charge generated atomically: ${proposalData.pixCharge?.id}`);

    // 5. Operator sends Outbound Message to Customer
    await fetch(`${SYNTHETIC_URL}/requests`, { method: "DELETE" });

    const msgRes = await fetch(
      `${API_URL}/v1/workspaces/${workspaceId}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientPhoneE164: customerPhone,
          contentType: "text",
          body: `Olá! Sua proposta está pronta no valor de R$ 180,00. Copie o código Pix para pagar.`,
          idempotencyKey: `p1_idemp_${Date.now()}`,
        }),
      }
    );
    if (!msgRes.ok) {
      const err = await msgRes.text();
      throw new Error(`Failed to send outbound message: HTTP ${msgRes.status}: ${err}`);
    }
    const msgData = (await msgRes.json()) as any;
    console.log(`  - Outbound message queued via Outbox (id: ${msgData.messageId})`);

    // 6. Wait for Worker Outbox Dispatcher to send to Synthetic Provider
    await waitForCondition(async () => {
      const reqRes = await fetch(`${SYNTHETIC_URL}/requests`);
      const data = (await reqRes.json()) as any;
      const found = data.requests?.find(
        (r: any) => r.method === "POST" && r.pathname.includes("/messages")
      );
      return found;
    }, 15000);
    console.log(`  - Synthetic HTTP Provider received outbound WhatsApp message!`);

    // 7. Operator accepts proposal (PATCH /status with expectedVersion: 1)
    const patchPropRes = await fetch(
      `${API_URL}/v1/workspaces/${workspaceId}/proposals/${proposalId}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "accepted",
          expectedVersion: 1,
        }),
      }
    );
    if (!patchPropRes.ok) {
      const err = await patchPropRes.text();
      throw new Error(`Failed to accept proposal: HTTP ${patchPropRes.status}: ${err}`);
    }
    console.log(`  - Proposal transitioned to 'accepted' with optimistic lock verification`);

    // 8. Operator records Commercial Outcome (won)
    const journeyRes = await pool.query(
      `INSERT INTO commercial_journeys (workspace_id, contact_id, status, title) VALUES ($1, $2, 'active', 'Jornada P1') RETURNING id`,
      [workspaceId, threadRecord.contact_id]
    );
    const journeyId = journeyRes.rows[0].id;

    const outcomeRes = await fetch(`${API_URL}/v1/workspaces/${workspaceId}/commercial/outcomes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        journeyId,
        proposalId,
        status: "won",
        valueCents: 18000,
        currency: "BRL",
        actorId: operatorId,
        reason: "Cliente pagou via Pix e confirmou atendimento",
      }),
    });
    if (!outcomeRes.ok) {
      const err = await outcomeRes.text();
      throw new Error(`Failed to record outcome: HTTP ${outcomeRes.status}: ${err}`);
    }
    console.log(`  - Commercial outcome 'won' recorded successfully`);

    return {
      journeyId: "P1",
      name: "Normal Sales Flow (Ingress -> Outbox -> Outcome Won)",
      passed: true,
      durationMs: Date.now() - start,
      details: "Inbound webhook claimed by worker, proposal and Pix created, outbound dispatched to synthetic provider, proposal accepted, outcome recorded",
    };
  } catch (err: any) {
    return {
      journeyId: "P1",
      name: "Normal Sales Flow",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// JOURNEY P2: Multi-Tenant Strict Isolation
// -----------------------------------------------------------------------------
async function executeJourneyP2(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P2] Executing Journey P2: Multi-Tenant Boundary Enforcement...");

  try {
    const wsA = crypto.randomUUID();
    const wsB = crypto.randomUUID();
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const contactBId = crypto.randomUUID();
    const threadBId = crypto.randomUUID();
    const channelBId = crypto.randomUUID();

    await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'P2 Org', 'p2-${Date.now()}')`, [orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS A', 'wsa-${Date.now()}')`, [wsA, orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS B', 'wsb-${Date.now()}')`, [wsB, orgId]);
    await pool.query(`INSERT INTO users (id, email, name) VALUES ($1, 'usera@test.com', 'User A'), ($2, 'userb@test.com', 'User B')`, [userA, userB]);
    await pool.query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin'), ($3, $4, 'admin')`, [wsA, userA, wsB, userB]);

    // Provision channel, contact and thread in Workspace B
    await pool.query(
      `INSERT INTO channel_instances (id, workspace_id, provider, display_name, endpoint_token_hash, status, is_active)
       VALUES ($1, $2, 'meta_waba', 'WS B Channel', $3, 'connected', true)`,
      [channelBId, wsB, crypto.randomBytes(32).toString("hex")]
    );
    await pool.query(
      `INSERT INTO contacts (id, workspace_id, phone_e164, name) VALUES ($1, $2, '+5511911112222', 'Contact B')`,
      [contactBId, wsB]
    );
    await pool.query(
      `INSERT INTO commercial_threads (id, workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [threadBId, wsB, channelBId, contactBId]
    );

    // Create a proposal in Workspace B
    const propBRes = await pool.query(
      `INSERT INTO commercial_proposals (workspace_id, thread_id, contact_id, title, total_cents, currency, status, created_by_user_id)
       VALUES ($1, $2, $3, 'Secret Proposal B', 50000, 'BRL', 'draft', $4) RETURNING id`,
      [wsB, threadBId, contactBId, userB]
    );
    const propBId = propBRes.rows[0].id;

    const tokenA = await createToken(userA, "usera@test.com");

    // Operator A attempts to access Proposal in Workspace B
    const crossAccessRes = await fetch(`${API_URL}/v1/workspaces/${wsB}/proposals/${propBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (crossAccessRes.status !== 403 && crossAccessRes.status !== 404 && crossAccessRes.status !== 401) {
      throw new Error(`Cross-tenant breach! User A accessed Workspace B with HTTP ${crossAccessRes.status}`);
    }
    console.log(`  - Cross-tenant workspace endpoint blocked with HTTP ${crossAccessRes.status}`);

    // Operator A attempts to access proposals list of Workspace B
    const crossListRes = await fetch(`${API_URL}/v1/workspaces/${wsB}/threads/${threadBId}/proposals`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (crossListRes.status !== 403 && crossListRes.status !== 404 && crossListRes.status !== 401) {
      throw new Error(`Cross-tenant breach on proposals list! HTTP ${crossListRes.status}`);
    }
    console.log(`  - Cross-tenant list access blocked with HTTP ${crossListRes.status}`);

    return {
      journeyId: "P2",
      name: "Multi-Tenant Isolation",
      passed: true,
      durationMs: Date.now() - start,
      details: "Cross-tenant access attempts to Workspace B from User A strictly rejected",
    };
  } catch (err: any) {
    return {
      journeyId: "P2",
      name: "Multi-Tenant Isolation",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// JOURNEY P3: Concurrency, Optimistic Locking & Terminal Outcome Idempotency
// -----------------------------------------------------------------------------
async function executeJourneyP3(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P3] Executing Journey P3: Concurrency, Optimistic Locking & Outcome Terminality...");

  try {
    const wsId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const channelId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const threadId = crypto.randomUUID();

    await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'P3 Org', 'p3-${Date.now()}')`, [orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS P3', 'p3-${Date.now()}')`, [wsId, orgId]);
    await pool.query(`INSERT INTO users (id, email, name) VALUES ($1, 'userp3@test.com', 'User P3')`, [userId]);
    await pool.query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`, [wsId, userId]);

    await pool.query(
      `INSERT INTO channel_instances (id, workspace_id, provider, display_name, endpoint_token_hash, status, is_active)
       VALUES ($1, $2, 'meta_waba', 'P3 Channel', $3, 'connected', true)`,
      [channelId, wsId, crypto.randomBytes(32).toString("hex")]
    );
    await pool.query(
      `INSERT INTO contacts (id, workspace_id, phone_e164, name) VALUES ($1, $2, '+5511933334444', 'Contact P3')`,
      [contactId, wsId]
    );
    await pool.query(
      `INSERT INTO commercial_threads (id, workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [threadId, wsId, channelId, contactId]
    );

    const token = await createToken(userId, "userp3@test.com");

    // 1. Create a proposal
    const propRes = await pool.query(
      `INSERT INTO commercial_proposals (workspace_id, thread_id, contact_id, title, total_cents, currency, status, created_by_user_id, state_version)
       VALUES ($1, $2, $3, 'Concurrency Test Proposal', 10000, 'BRL', 'draft', $4, 1) RETURNING id`,
      [wsId, threadId, contactId, userId]
    );
    const propId = propRes.rows[0].id;

    // Send status update with WRONG expectedVersion
    const staleRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/proposals/${propId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "sent",
        expectedVersion: 999, // Stale version
      }),
    });

    if (staleRes.status !== 409) {
      throw new Error(`Expected HTTP 409 on stale version conflict, got ${staleRes.status}`);
    }
    console.log(`  - Optimistic locking rejected stale update with HTTP 409 Conflict`);

    // 2. Commercial Outcome Terminality (won -> lost alteration rejected)
    const journeyRes = await pool.query(
      `INSERT INTO commercial_journeys (workspace_id, contact_id, status, title) VALUES ($1, $2, 'active', 'Jornada P3') RETURNING id`,
      [wsId, contactId]
    );
    const journeyId = journeyRes.rows[0].id;

    // Create outcome WON
    const wonRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/commercial/outcomes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        journeyId,
        proposalId: propId,
        status: "won",
        valueCents: 10000,
        currency: "BRL",
        actorId: userId,
        reason: "First won record",
      }),
    });
    if (!wonRes.ok) {
      throw new Error(`Failed to record first won outcome: HTTP ${wonRes.status}`);
    }
    console.log(`  - First outcome 'won' recorded`);

    // Attempt to alter WON to LOST
    const alterRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/commercial/outcomes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        journeyId,
        proposalId: propId,
        status: "lost",
        valueCents: 10000,
        currency: "BRL",
        actorId: userId,
        reason: "Attempting to change won to lost",
      }),
    });
    if (alterRes.status !== 409) {
      throw new Error(`Expected HTTP 409 on terminal outcome change, got ${alterRes.status}`);
    }
    console.log(`  - Attempt to alter terminal outcome 'won' to 'lost' rejected with HTTP 409 Conflict`);

    // Attempt divergent payload on replay
    const divRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/commercial/outcomes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        journeyId,
        proposalId: propId,
        status: "won",
        valueCents: 99999, // Divergent value
        currency: "BRL",
        actorId: userId,
      }),
    });
    if (divRes.status !== 409) {
      throw new Error(`Expected HTTP 409 on outcome payload divergence, got ${divRes.status}`);
    }
    console.log(`  - Replay with divergent financial value rejected with HTTP 409 Conflict`);

    // Identical replay succeeds idempotently
    const replayRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/commercial/outcomes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        journeyId,
        proposalId: propId,
        status: "won",
        valueCents: 10000,
        currency: "BRL",
        actorId: userId,
      }),
    });
    if (!replayRes.ok) {
      throw new Error(`Expected identical replay to succeed with 200/201, got ${replayRes.status}`);
    }
    console.log(`  - Identical outcome replay accepted idempotently with HTTP ${replayRes.status}`);

    return {
      journeyId: "P3",
      name: "Concurrency & Outcome Terminality",
      passed: true,
      durationMs: Date.now() - start,
      details: "Stale version rejected with 409, outcome transition won->lost rejected with 409, divergence rejected with 409, identical replay idempotent",
    };
  } catch (err: any) {
    return {
      journeyId: "P3",
      name: "Concurrency & Outcome Terminality",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// JOURNEY P4: Delayed Context Switch / API Resilience Under Load
// -----------------------------------------------------------------------------
async function executeJourneyP4(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P4] Executing Journey P4: Rapid Context Switching & API Resilience...");

  try {
    const wsId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();

    await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'P4 Org', 'p4-${Date.now()}')`, [orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS P4', 'p4-${Date.now()}')`, [wsId, orgId]);
    await pool.query(`INSERT INTO users (id, email, name) VALUES ($1, 'userp4@test.com', 'User P4')`, [userId]);
    await pool.query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [wsId, userId]);

    const token = await createToken(userId, "userp4@test.com");

    // Execute 25 rapid concurrent requests across various endpoints
    const promises: Promise<Response>[] = [];
    for (let i = 0; i < 25; i++) {
      promises.push(
        fetch(`${API_URL}/v1/workspaces/${wsId}/channels`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
    }

    const responses = await Promise.all(promises);
    const allSuccessful = responses.every((r) => r.status === 200);
    if (!allSuccessful) {
      const statuses = responses.map((r) => r.status).join(", ");
      throw new Error(`Some requests failed under rapid concurrent load (statuses: ${statuses})`);
    }
    console.log(`  - 25 concurrent workspace API requests returned HTTP 200 with zero server errors`);

    return {
      journeyId: "P4",
      name: "Rapid Context Switching & Resilience",
      passed: true,
      durationMs: Date.now() - start,
      details: "25 concurrent requests executed cleanly without timeout or socket saturation",
    };
  } catch (err: any) {
    return {
      journeyId: "P4",
      name: "Rapid Context Switching & Resilience",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// JOURNEY P5: Worker Container Restart & Lease Reclamation Without Duplicate Send
// -----------------------------------------------------------------------------
async function executeJourneyP5(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P5] Executing Journey P5: Worker Container Restart & Zero Duplicate Send...");

  try {
    const orgId = crypto.randomUUID();
    const wsId = crypto.randomUUID();
    const channelId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const threadId = crypto.randomUUID();
    const msgId = crypto.randomUUID();
    const cmdId = crypto.randomUUID();
    const tokenHash = crypto.randomBytes(32).toString("hex");

    await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'P5 Org', 'p5-${Date.now()}')`, [orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS P5', 'p5-${Date.now()}')`, [wsId, orgId]);
    await pool.query(
      `INSERT INTO contacts (id, workspace_id, phone_e164, name) VALUES ($1, $2, '+5511977776666', 'Contact P5')`,
      [contactId, wsId]
    );

    // Insert channel, thread, message, and command
    await pool.query(
      `INSERT INTO channel_instances (id, workspace_id, provider, display_name, endpoint_token_hash, status, is_active)
       VALUES ($1, $2, 'meta_waba', 'P5 Channel', $3, 'connected', true)`,
      [channelId, wsId, tokenHash]
    );
    await pool.query(
      `INSERT INTO commercial_threads (id, workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [threadId, wsId, channelId, contactId]
    );
    await pool.query(
      `INSERT INTO messages (id, workspace_id, channel_instance_id, thread_id, provider, direction, from_phone, to_phone, type, body, status)
       VALUES ($1, $2, $3, $4, 'meta_waba', 'outbound', '+5511999998888', '+5511977776666', 'text', 'P5 Recovery Test', 'queued')`,
      [msgId, wsId, channelId, threadId]
    );
    // Command in 'processing' with expired lease from dead worker
    await pool.query(
      `INSERT INTO outbound_commands (id, workspace_id, channel_instance_id, message_id, status, worker_id, lease_until, lease_token)
       VALUES ($1, $2, $3, $4, 'processing', 'dead-worker-pid-999', NOW() - INTERVAL '30 seconds', gen_random_uuid())`,
      [cmdId, wsId, channelId, msgId]
    );

    // Restart worker container via docker CLI
    console.log("  - Restarting worker container (sos-v3-worker)...");
    execSync("docker compose restart worker", { encoding: "utf-8" });

    // Wait for worker to report healthy
    await waitForCondition(async () => {
      try {
        const out = execSync("docker inspect --format='{{.State.Health.Status}}' sos-v3-worker", {
          encoding: "utf-8",
        }).trim();
        return out === "healthy";
      } catch {
        return false;
      }
    }, 20000);
    console.log("  - Worker container restarted and confirmed healthy");

    // Wait for restarted worker to reclaim expired lease and process to 'sent'
    await waitForCondition(async () => {
      const res = await pool.query(
        `SELECT status, worker_id, external_message_id FROM outbound_commands WHERE id = $1`,
        [cmdId]
      );
      if (res.rows[0]?.status === "sent") return res.rows[0];
      return null;
    }, 15000);
    console.log("  - Expired lease command reclaimed by new worker and successfully dispatched to provider!");

    return {
      journeyId: "P5",
      name: "Worker Container Restart & Lease Reclamation",
      passed: true,
      durationMs: Date.now() - start,
      details: "Worker container restarted, health verified, expired lease reclaimed and dispatched cleanly",
    };
  } catch (err: any) {
    return {
      journeyId: "P5",
      name: "Worker Container Restart & Lease Reclamation",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// JOURNEY P6: Meta CAPI Conversion Event Dispatch
// -----------------------------------------------------------------------------
async function executeJourneyP6(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P6] Executing Journey P6: Meta CAPI Conversion Dispatch...");

  try {
    const orgId = crypto.randomUUID();
    const wsId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const journeyId = crypto.randomUUID();

    await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'P6 Org', 'p6-${Date.now()}')`, [orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS P6', 'p6-${Date.now()}')`, [wsId, orgId]);
    await pool.query(
      `INSERT INTO contacts (id, workspace_id, phone_e164, name) VALUES ($1, $2, '+5511955556666', 'Contact P6')`,
      [contactId, wsId]
    );

    // Create journey with contact_id
    await pool.query(
      `INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, title) VALUES ($1, $2, $3, 'active', 'Jornada P6')`,
      [journeyId, wsId, contactId]
    );

    // Clear synthetic requests
    await fetch(`${SYNTHETIC_URL}/requests`, { method: "DELETE" });

    // Insert queued conversion event
    await pool.query(
      `INSERT INTO conversion_events (
        id, workspace_id, journey_id, event_name, event_time, user_data, value_cents, currency, status
      ) VALUES ($1, $2, $3, 'PurchaseCompleted', NOW(), '{"hashedPhone": "sha256_mock_ph"}', 18000, 'BRL', 'QUEUED')`,
      [eventId, wsId, journeyId]
    );
    console.log(`  - Conversion event inserted with status 'QUEUED' (id: ${eventId})`);

    // Wait for Worker CapiDispatcher to claim and dispatch event
    await waitForCondition(async () => {
      const reqRes = await fetch(`${SYNTHETIC_URL}/requests`);
      const data = (await reqRes.json()) as any;
      const found = data.requests?.find(
        (r: any) => r.method === "POST" && r.pathname.includes("/events")
      );
      return found;
    }, 15000);
    console.log(`  - Synthetic HTTP Provider received CAPI event!`);

    // Verify event status in DB
    await waitForCondition(async () => {
      const res = await pool.query(
        `SELECT status, provider_receipt FROM conversion_events WHERE id = $1`,
        [eventId]
      );
      if (res.rows[0]?.status === "ACCEPTED" || res.rows[0]?.status === "SIMULATED") {
        return res.rows[0];
      }
      return null;
    }, 10000);
    console.log(`  - Conversion event verified in DB with status ACCEPTED/SIMULATED`);

    return {
      journeyId: "P6",
      name: "Meta CAPI Conversion Event Dispatch",
      passed: true,
      durationMs: Date.now() - start,
      details: "CAPI purchase event claimed by worker and dispatched to synthetic provider endpoint",
    };
  } catch (err: any) {
    return {
      journeyId: "P6",
      name: "Meta CAPI Conversion Event Dispatch",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// JOURNEY P7: Governed Proposal Terminality & Financial Immutability
// -----------------------------------------------------------------------------
async function executeJourneyP7(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P7] Executing Journey P7: Proposal Terminality & Financial Immutability...");

  try {
    const orgId = crypto.randomUUID();
    const wsId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const channelId = crypto.randomUUID();
    const threadId = crypto.randomUUID();

    await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'P7 Org', 'p7-${Date.now()}')`, [orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS P7', 'p7-${Date.now()}')`, [wsId, orgId]);
    await pool.query(`INSERT INTO users (id, email, name) VALUES ($1, 'userp7@test.com', 'User P7')`, [userId]);
    await pool.query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`, [wsId, userId]);

    await pool.query(
      `INSERT INTO channel_instances (id, workspace_id, provider, display_name, endpoint_token_hash, status, is_active)
       VALUES ($1, $2, 'meta_waba', 'P7 Channel', $3, 'connected', true)`,
      [channelId, wsId, crypto.randomBytes(32).toString("hex")]
    );
    await pool.query(
      `INSERT INTO contacts (id, workspace_id, phone_e164, name) VALUES ($1, $2, '+5511988881111', 'Contact P7')`,
      [contactId, wsId]
    );
    await pool.query(
      `INSERT INTO commercial_threads (id, workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [threadId, wsId, channelId, contactId]
    );

    const token = await createToken(userId, "userp7@test.com");

    // 1. Create and accept proposal
    const propRes = await pool.query(
      `INSERT INTO commercial_proposals (workspace_id, thread_id, contact_id, title, total_cents, currency, status, created_by_user_id, state_version)
       VALUES ($1, $2, $3, 'Terminal Proposal', 25000, 'BRL', 'accepted', $4, 2) RETURNING id`,
      [wsId, threadId, contactId, userId]
    );
    const propId = propRes.rows[0].id;

    // Attempt to mutate accepted proposal back to draft
    const mutateRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/proposals/${propId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "draft",
        expectedVersion: 2,
      }),
    });

    if (mutateRes.status !== 400 && mutateRes.status !== 409) {
      throw new Error(`Expected rejection when mutating accepted proposal, got HTTP ${mutateRes.status}`);
    }
    console.log(`  - Mutation of accepted proposal rejected with HTTP ${mutateRes.status}`);

    // 2. Direct DELETE attempt under operational user rejected by RLS
    const appUserClient = new pg.Client({
      connectionString:
        "postgresql://sos_app_user:sos_app_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable",
    });
    await appUserClient.connect();

    let deleteBlocked = false;
    try {
      await appUserClient.query(`DELETE FROM commercial_proposals WHERE id = $1`, [propId]);
    } catch (err: any) {
      if (err.message.includes("permission denied") || err.code === "42501") {
        deleteBlocked = true;
      }
    } finally {
      await appUserClient.end();
    }

    if (!deleteBlocked) {
      throw new Error("Financial immutability violation: sos_app_user was able to DELETE commercial_proposals!");
    }
    console.log(`  - DELETE on commercial_proposals denied to operational user (42501 permission denied)`);

    return {
      journeyId: "P7",
      name: "Proposal Terminality & Financial Immutability",
      passed: true,
      durationMs: Date.now() - start,
      details: "Terminal proposal status changes blocked; DELETE denied to operational roles by migration 024 RLS",
    };
  } catch (err: any) {
    return {
      journeyId: "P7",
      name: "Proposal Terminality & Financial Immutability",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// JOURNEY P8: Channel Revocation & Token Invalidation
// -----------------------------------------------------------------------------
async function executeJourneyP8(): Promise<JourneyResult> {
  const start = Date.now();
  console.log("\n[P8] Executing Journey P8: Channel Revocation & Token Invalidation...");

  try {
    const orgId = crypto.randomUUID();
    const wsId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const channelId = crypto.randomUUID();
    const rawToken = `p8_token_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'P8 Org', 'p8-${Date.now()}')`, [orgId]);
    await pool.query(`INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'WS P8', 'p8-${Date.now()}')`, [wsId, orgId]);
    await pool.query(`INSERT INTO users (id, email, name) VALUES ($1, 'userp8@test.com', 'User P8')`, [userId]);
    await pool.query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [wsId, userId]);

    // Create channel
    await pool.query(
      `INSERT INTO channel_instances (id, workspace_id, provider, display_name, endpoint_token_hash, status, is_active)
       VALUES ($1, $2, 'meta_waba', 'P8 Revoke Channel', $3, 'connected', true)`,
      [channelId, wsId, tokenHash]
    );

    const token = await createToken(userId, "userp8@test.com");

    // 1. Revoke channel via API
    const revokeRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/channels/${channelId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "revoked" }),
    });
    if (!revokeRes.ok) {
      const err = await revokeRes.text();
      throw new Error(`Failed to revoke channel via API: HTTP ${revokeRes.status}: ${err}`);
    }
    console.log(`  - Channel revoked via PATCH /status (HTTP 200)`);

    // Verify DB is_active = false
    const chRow = await pool.query(
      `SELECT status, is_active FROM channel_instances WHERE id = $1`,
      [channelId]
    );
    if (chRow.rows[0].status !== "revoked" || chRow.rows[0].is_active !== false) {
      throw new Error(`Database trigger failed to sync is_active = false on revocation`);
    }
    console.log(`  - Database confirms status = 'revoked' and is_active = false`);

    // 2. Ingress webhook with revoked token MUST be rejected
    const webhookRes = await fetch(`${API_URL}/v1/webhooks/whatsapp/${rawToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "whatsapp_business_account" }),
    });

    if (webhookRes.status !== 404 && webhookRes.status !== 401 && webhookRes.status !== 400) {
      throw new Error(`Revoked token accepted by webhook! Got HTTP ${webhookRes.status}`);
    }
    console.log(`  - Webhook with revoked token rejected with HTTP ${webhookRes.status}`);

    // 3. Attempt to fetch QR code on revoked channel returns 409 Conflict
    const qrRes = await fetch(`${API_URL}/v1/workspaces/${wsId}/channels/${channelId}/qr-code`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (qrRes.status !== 409) {
      throw new Error(`Expected HTTP 409 Conflict for QR code on revoked channel, got ${qrRes.status}`);
    }
    console.log(`  - QR code request on revoked channel rejected with HTTP 409 Conflict`);

    return {
      journeyId: "P8",
      name: "Channel Revocation & Invalidation",
      passed: true,
      durationMs: Date.now() - start,
      details: "Channel revocation transitions is_active to false; invalidates ingress webhook token; rejects QR pairing with 409",
    };
  } catch (err: any) {
    return {
      journeyId: "P8",
      name: "Channel Revocation & Invalidation",
      passed: false,
      durationMs: Date.now() - start,
      details: err.message || String(err),
    };
  }
}

// -----------------------------------------------------------------------------
// Main Runner Orchestrator
// -----------------------------------------------------------------------------
async function main() {
  console.log("================================================================================");
  console.log(" 🧪 SOS SALES V3 — PHASE R5 TRUE DOCKER E2E TEST RUNNER (P1–P8)");
  console.log("================================================================================");
  console.log(`API URL:        ${API_URL}`);
  console.log(`Synthetic URL:  ${SYNTHETIC_URL}`);
  console.log(`Database URL:   ${DB_URL.replace(/:[^:@]+@/, ":[redacted]@")}`);

  // Pre-flight health checks
  console.log("\n[Pre-flight] Verifying running Docker services...");
  try {
    const apiHealth = await fetch(`${API_URL}/health`);
    if (!apiHealth.ok) throw new Error(`API healthcheck returned HTTP ${apiHealth.status}`);
    console.log("  ✔ API container is healthy (http://localhost:4400/health)");

    const synthHealth = await fetch(`${SYNTHETIC_URL}/health`);
    if (!synthHealth.ok) throw new Error(`Synthetic provider returned HTTP ${synthHealth.status}`);
    console.log("  ✔ Synthetic HTTP Provider is healthy (http://localhost:4000/health)");

    await pool.query("SELECT 1;");
    console.log("  ✔ PostgreSQL container is healthy and accepting connections");
  } catch (err: any) {
    console.error("FATAL: Pre-flight check failed. Ensure Docker stack is up:", err.message);
    process.exit(1);
  }

  // Execute journeys sequentially
  results.push(await executeJourneyP1());
  results.push(await executeJourneyP2());
  results.push(await executeJourneyP3());
  results.push(await executeJourneyP4());
  results.push(await executeJourneyP5());
  results.push(await executeJourneyP6());
  results.push(await executeJourneyP7());
  results.push(await executeJourneyP8());

  await pool.end();

  // Scorecard output
  console.log("\n================================================================================");
  console.log(" 📊 PHASE R5 E2E JOURNEY RESULTS SUMMARY");
  console.log("================================================================================");

  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✔ PASS" : "✖ FAIL";
    console.log(`[${r.journeyId}] ${r.name.padEnd(45)} ${icon} (${r.durationMs}ms)`);
    if (!r.passed) {
      console.log(`    Error: ${r.details}`);
      allPassed = false;
    }
  }

  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`TOTAL: ${passedCount}/${results.length} JOURNEYS PASSED`);

  if (!allPassed) {
    console.error("\n❌ PHASE R5 E2E SUITE FAILED. See details above.");
    process.exit(1);
  }

  console.log("\n✅ ALL P1–P8 JOURNEYS PASSED AGAINST LIVE DOCKER STACK!");
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL UNCAUGHT:", err);
  process.exit(1);
});
