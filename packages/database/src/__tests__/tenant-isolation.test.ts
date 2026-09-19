import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabasePools, runSafeNegativeDdlTest } from "../test-support";

describe("Tenant Isolation & Row Level Security (RLS) Negative Tests", () => {
  // Test pools strictly isolated to sos_sales_v3_test database
  const { appPool, ownerPool } = createTestDatabasePools();

  let workspaceAId: string;
  let workspaceBId: string;
  let credentialAId: string;
  let credentialBId: string;

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
});
