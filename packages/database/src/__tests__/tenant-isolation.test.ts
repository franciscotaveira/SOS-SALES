import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools, runSafeNegativeDdlTest } from "../test-support";

describe("Tenant Isolation & Row Level Security (RLS) Negative Tests", () => {
  // Test pools strictly isolated to sos_sales_v3_test database
  const { appPool, ownerPool } = createTestDatabasePools();

  let workspaceAId: string;
  let workspaceBId: string;
  let credentialAId: string;
  let credentialBId: string;

  // Workspace B entities for negative cross-tenant assertions
  let contactBId: string;
  let channelBId: string;
  let threadBId: string;
  let messageBId: string;
  let productBId: string;
  let pixChargeBId: string;
  let journeyBId: string;
  let outcomeBId: string;
  let suggestionBId: string;

  beforeAll(async () => {
    // 1. Setup organizations and workspaces via owner pool
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug) 
      VALUES ('Test Org Alpha', 'test-org-alpha-${Date.now()}') 
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug) 
      VALUES ($1, 'Workspace A', 'workspace-a-${Date.now()}') 
      RETURNING id;
    `, [orgId]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug) 
      VALUES ($1, 'Workspace B', 'workspace-b-${Date.now()}') 
      RETURNING id;
    `, [orgId]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Insert credentials for both workspaces
    const credARes = await ownerPool.query(`
      INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
      VALUES ($1, 'meta_waba', 'acc-a', 'cipher_a', 'iv_a', 'tag_a')
      RETURNING id;
    `, [workspaceAId]);
    credentialAId = credARes.rows[0].id;

    const credBRes = await ownerPool.query(`
      INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
      VALUES ($1, 'meta_waba', 'acc-b', 'cipher_b', 'iv_b', 'tag_b')
      RETURNING id;
    `, [workspaceBId]);
    credentialBId = credBRes.rows[0].id;

    // 3. Create a test user for registered_by fields
    const userRes = await ownerPool.query(`
      INSERT INTO users (email, name)
      VALUES ($1, 'User Test B')
      RETURNING id;
    `, [`user-test-b-${Date.now()}@example.com`]);
    const userId = userRes.rows[0].id;

    // 4. Create Channel Instance for Workspace B
    const tokenHashB = crypto.createHash("sha256").update(`token-${Date.now()}-b`).digest("hex");
    const channelRes = await ownerPool.query(`
      INSERT INTO channel_instances (workspace_id, provider, display_name, endpoint_token_hash)
      VALUES ($1, 'meta_waba', 'Canal B', $2)
      RETURNING id;
    `, [workspaceBId, tokenHashB]);
    channelBId = channelRes.rows[0].id;

    // 5. Create Contact for Workspace B
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5549988887766', 'Contato B')
      RETURNING id;
    `, [workspaceBId]);
    contactBId = contactRes.rows[0].id;

    // 6. Create Commercial Thread for Workspace B
    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      RETURNING id;
    `, [workspaceBId, channelBId, contactBId]);
    threadBId = threadRes.rows[0].id;

    // 7. Create Message for Workspace B
    const msgRes = await ownerPool.query(`
      INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body)
      VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5549988887766', '+5549988880000', 'text', 'Mensagem Secreta de B')
      RETURNING id;
    `, [workspaceBId, channelBId, threadBId]);
    messageBId = msgRes.rows[0].id;

    // 8. Create Product for Workspace B
    const prodRes = await ownerPool.query(`
      INSERT INTO products (workspace_id, retailer_id, title, description, price_cents, image_url)
      VALUES ($1, 'ret-b-01', 'Produto Exclusivo B', 'Desc', 4990, 'https://example.com/p.jpg')
      RETURNING id;
    `, [workspaceBId]);
    productBId = prodRes.rows[0].id;

    // 9. Create Pix Charge for Workspace B
    const pixRes = await ownerPool.query(`
      INSERT INTO pix_charges (workspace_id, thread_id, contact_id, title, amount_cents, pix_code, expires_at)
      VALUES ($1, $2, $3, 'Cobrança Exclusiva B', 4990, '00020126580014BR.GOV.BCB.PIX0114+5549988887766520400005303986540449.905802BR5909Empresa B6009Chapeco62070503***6304ABCD', now() + interval '1 hour')
      RETURNING id;
    `, [workspaceBId, threadBId, contactBId]);
    pixChargeBId = pixRes.rows[0].id;

    // 10. Create Commercial Journey & Outcome for Workspace B
    const journeyRes = await ownerPool.query(`
      INSERT INTO commercial_journeys (workspace_id, contact_id, thread_id, title, estimated_value_cents)
      VALUES ($1, $2, $3, 'Jornada Comercial B', 4990)
      RETURNING id;
    `, [workspaceBId, contactBId, threadBId]);
    journeyBId = journeyRes.rows[0].id;

    const outcomeRes = await ownerPool.query(`
      INSERT INTO commercial_outcomes (workspace_id, journey_id, status, value_cents, registered_by_user_id)
      VALUES ($1, $2, 'won', 4990, $3)
      RETURNING id;
    `, [workspaceBId, journeyBId, userId]);
    outcomeBId = outcomeRes.rows[0].id;

    // 11. Create Integration Suggestion for Workspace B
    const sugRes = await ownerPool.query(`
      INSERT INTO integration_suggestions (
        workspace_id, thread_id, contact_id, suggestion_type, title, body, priority,
        module_key, rule_version, idempotency_key, origin_snapshot
      ) VALUES (
        $1, $2, $3, 'follow_up', 'Sugestão Exclusiva B', 'Corpo B', 'high',
        'radar_m01', '1.0.0', $4, $5
      ) RETURNING id;
    `, [
      workspaceBId,
      threadBId,
      contactBId,
      `idem-b-${Date.now()}`,
      JSON.stringify({ threadId: threadBId, lastMessageAt: new Date().toISOString() }),
    ]);
    suggestionBId = sugRes.rows[0].id;
  });

  afterAll(async () => {
    // Isolated test database: ZERO DISABLE TRIGGER calls. Audit trigger remains active 100% of the time.
    await ownerPool.end();
    await appPool.end();
  });

  it("should fail-closed when app.current_workspace_id is not set (returns 0 rows)", async () => {
    const client = await appPool.connect();
    try {
      const res = await client.query("SELECT * FROM provider_credentials");
      expect(res.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });

  it("should only see Workspace A data when authenticated as Workspace A", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

      const res = await client.query("SELECT * FROM provider_credentials");
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].id).toBe(credentialAId);
      expect(res.rows[0].workspace_id).toBe(workspaceAId);

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  it("should return 0 rows when Workspace A explicitly queries Workspace B ID", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

      const res = await client.query("SELECT * FROM provider_credentials WHERE id = $1", [credentialBId]);
      expect(res.rows.length).toBe(0);

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  it("should BLOCK inserting data with another tenant workspace_id (violates RLS WITH CHECK)", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

      // Attempt to inject a row with workspaceBId while running as workspaceA
      await expect(
        client.query(`
          INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
          VALUES ($1, 'waha', 'acc-malicious', 'cipher', 'iv', 'tag')
        `, [workspaceBId])
      ).rejects.toThrow(/violates row-level security policy/i);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("should affect 0 rows when Workspace A attempts to UPDATE Workspace B data", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

      const res = await client.query(
        "UPDATE provider_credentials SET status = 'TAMPERED' WHERE id = $1",
        [credentialBId]
      );
      expect(res.rowCount).toBe(0);

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  it("should affect 0 rows when Workspace A attempts to DELETE Workspace B data", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

      const res = await client.query(
        "DELETE FROM provider_credentials WHERE id = $1",
        [credentialBId]
      );
      expect(res.rowCount).toBe(0);

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  it("should deny DDL execution for sos_app_user using runSafeNegativeDdlTest (cannot drop or alter tables)", async () => {
    const client = await appPool.connect();
    try {
      await expect(
        runSafeNegativeDdlTest(client, "CREATE TABLE public.attacker_table (id INT);")
      ).rejects.toThrow(/permission denied/i);

      await expect(
        runSafeNegativeDdlTest(client, "DROP TABLE public.workspaces;")
      ).rejects.toThrow(/must be owner/i);

      // Verify that workspaces table remains completely intact and unaffected
      const checkRes = await client.query("SELECT to_regclass('public.workspaces') as tbl;");
      expect(checkRes.rows[0].tbl).toBe("workspaces");
    } finally {
      client.release();
    }
  });

  it("should strictly PROHIBIT UPDATE and DELETE on audit_events (immutable append-only ledger)", async () => {
    // 1. Insert a legitimate audit event via ownerPool
    const insertRes = await ownerPool.query(`
      INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, resource_type, resource_id)
      VALUES ($1, $2, 'user', 'test.immutable_action', 'workspace', $3)
      RETURNING id;
    `, [workspaceAId, "00000000-0000-0000-0000-000000000001", workspaceAId]);
    const auditId = insertRes.rows[0].id;

    // 2. Test UPDATE rejection (blocked by trigger and permissions)
    await expect(
      ownerPool.query("UPDATE audit_events SET action = 'tampered' WHERE id = $1", [auditId])
    ).rejects.toThrow(/immutable append-only ledger/i);

    // 3. Test DELETE rejection (blocked by trigger and permissions)
    await expect(
      ownerPool.query("DELETE FROM audit_events WHERE id = $1", [auditId])
    ).rejects.toThrow(/immutable append-only ledger/i);
  });

  it("should ensure security definer functions are owned by sos_migration_owner and revoked from PUBLIC", async () => {
    const res = await ownerPool.query(`
      SELECT proname, pg_get_userbyid(proowner) AS owner, array_to_string(proacl, ',') AS acl
      FROM pg_proc 
      WHERE proname IN ('get_user_workspaces', 'record_security_audit_event');
    `);

    expect(res.rows.length).toBe(2);
    for (const row of res.rows) {
      expect(row.owner).toBe("sos_migration_owner");
      // proacl must NOT contain '=X/' without a grantee (which denotes PUBLIC in PostgreSQL)
      expect(row.acl).not.toMatch(/(^|,)=X\//);
      expect(row.acl).toMatch(/sos_app_user=X\/sos_migration_owner/);
    }
  });

  describe("Negative Cross-Tenant Isolation Across All Core Entities (M2 DoD)", () => {
    it("strictly isolates contacts across tenants (returns 0 rows on cross-tenant select, update, and denies cross-tenant insert)", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        // 1. Cross-tenant SELECT returns 0
        const selRes = await client.query("SELECT * FROM contacts WHERE id = $1", [contactBId]);
        expect(selRes.rows.length).toBe(0);

        // 2. Cross-tenant UPDATE affects 0
        const updRes = await client.query("UPDATE contacts SET name = 'Hacked' WHERE id = $1", [contactBId]);
        expect(updRes.rowCount).toBe(0);

        // 3. DELETE is strictly revoked for sos_app_user (defense-in-depth least privilege)
        await expect(
          client.query("DELETE FROM contacts WHERE id = $1", [contactBId])
        ).rejects.toThrow(/permission denied/i);

        await client.query("ROLLBACK");

        // 4. In a clean transaction: cross-tenant INSERT blocked by WITH CHECK
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);
        await expect(
          client.query("INSERT INTO contacts (workspace_id, phone_e164, name) VALUES ($1, '+5549988889999', 'Fake')", [workspaceBId])
        ).rejects.toThrow(/violates row-level security policy/i);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("strictly isolates commercial_threads across tenants", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const selRes = await client.query("SELECT * FROM commercial_threads WHERE id = $1", [threadBId]);
        expect(selRes.rows.length).toBe(0);

        const updRes = await client.query("UPDATE commercial_threads SET status = 'closed' WHERE id = $1", [threadBId]);
        expect(updRes.rowCount).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("strictly isolates messages across tenants", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const selRes = await client.query("SELECT * FROM messages WHERE id = $1", [messageBId]);
        expect(selRes.rows.length).toBe(0);

        const updRes = await client.query("UPDATE messages SET body = 'Tampered' WHERE id = $1", [messageBId]);
        expect(updRes.rowCount).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("strictly isolates products (catalog) across tenants", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const selRes = await client.query("SELECT * FROM products WHERE id = $1", [productBId]);
        expect(selRes.rows.length).toBe(0);

        const updRes = await client.query("UPDATE products SET price_cents = 0 WHERE id = $1", [productBId]);
        expect(updRes.rowCount).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("strictly isolates pix_charges across tenants", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const selRes = await client.query("SELECT * FROM pix_charges WHERE id = $1", [pixChargeBId]);
        expect(selRes.rows.length).toBe(0);

        const updRes = await client.query("UPDATE pix_charges SET status = 'PAID' WHERE id = $1", [pixChargeBId]);
        expect(updRes.rowCount).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("strictly isolates commercial_journeys & commercial_outcomes across tenants", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const selJourney = await client.query("SELECT * FROM commercial_journeys WHERE id = $1", [journeyBId]);
        expect(selJourney.rows.length).toBe(0);

        const selOutcome = await client.query("SELECT * FROM commercial_outcomes WHERE id = $1", [outcomeBId]);
        expect(selOutcome.rows.length).toBe(0);

        const updJourney = await client.query("UPDATE commercial_journeys SET status = 'won' WHERE id = $1", [journeyBId]);
        expect(updJourney.rowCount).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("strictly isolates integration_suggestions across tenants", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const selRes = await client.query("SELECT * FROM integration_suggestions WHERE id = $1", [suggestionBId]);
        expect(selRes.rows.length).toBe(0);

        const updRes = await client.query("UPDATE integration_suggestions SET status = 'accepted' WHERE id = $1", [suggestionBId]);
        expect(updRes.rowCount).toBe(0);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });
});

