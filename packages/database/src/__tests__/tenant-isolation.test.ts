import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

describe("Tenant Isolation & Row Level Security (RLS) Negative Tests", () => {
  // Migration owner pool for test setup
  const ownerPool = new Pool({
    connectionString:
      process.env.MIGRATION_DATABASE_URL ||
      "postgresql://sos_migration_owner:sos_migration_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable",
  });

  // Restricted application pool (must strictly obey RLS)
  const appPool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://sos_app_user:sos_app_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable",
  });

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
    try {
      if (workspaceAId && workspaceBId) {
        await ownerPool.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceAId, workspaceBId]);
      }
    } finally {
      await ownerPool.end();
      await appPool.end();
    }
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

  it("should deny DDL execution for sos_app_user (cannot drop or alter tables)", async () => {
    const client = await appPool.connect();
    try {
      await expect(
        client.query("CREATE TABLE public.attacker_table (id INT);")
      ).rejects.toThrow(/permission denied/i);

      await expect(
        client.query("DROP TABLE public.workspaces;")
      ).rejects.toThrow(/must be owner/i);
    } finally {
      client.release();
    }
  });
});
