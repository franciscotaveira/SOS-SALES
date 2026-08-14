import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('TX Commercial Core — Multi-Tenant Isolation & RLS Security', () => {
  const userAId = '11111111-1111-1111-1111-111111111111';
  const userBId = '22222222-2222-2222-2222-222222222222';
  
  const workspaceAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const workspaceBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeAll(async () => {
    // Setup 2 isolated workspaces with their respective members and data
    // 1. Workspaces
    await query(`
      INSERT INTO workspaces (id, name, slug, active) VALUES
      ('${workspaceAId}', 'Workspace Alpha (Haven Escovaria)', 'ws-alpha-haven', true),
      ('${workspaceBId}', 'Workspace Beta (Apex Películas)', 'ws-beta-peliculas', true)
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Memberships
    await query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES
      ('${workspaceAId}', '${userAId}', 'owner'),
      ('${workspaceBId}', '${userBId}', 'owner')
      ON CONFLICT DO NOTHING;
    `);

    // 3. Contacts
    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name) VALUES
      ('c0000000-0000-0000-0000-0000000000aa', '${workspaceAId}', '+5549999111111', 'Cliente Alpha'),
      ('c0000000-0000-0000-0000-0000000000bb', '${workspaceBId}', '+5549999222222', 'Cliente Beta')
      ON CONFLICT DO NOTHING;
    `);

    // 4. Commercial Journeys
    await query(`
      INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product, total_revenue_minor) VALUES
      ('d0000000-0000-0000-0000-0000000000aa', '${workspaceAId}', 'c0000000-0000-0000-0000-0000000000aa', 'OPEN', 'Escova Lisa', 5900),
      ('d0000000-0000-0000-0000-0000000000bb', '${workspaceBId}', 'c0000000-0000-0000-0000-0000000000bb', 'OPEN', 'Película Térmica G20', 45000)
      ON CONFLICT DO NOTHING;
    `);
  });

  afterAll(async () => {
    // Clean up test data
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query(`DELETE FROM workspaces WHERE id IN ('${workspaceAId}', '${workspaceBId}')`);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('should isolate User A to only see data from Workspace Alpha', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      // Set RLS role and auth context for User A
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(`SET LOCAL "request.jwt.claim.sub" = '${userAId}'`);

      // 1. Query Workspaces
      const wsRes = await client.query('SELECT id, name FROM workspaces');
      expect(wsRes.rowCount).toBe(1);
      expect(wsRes.rows[0].id).toBe(workspaceAId);

      // 2. Query Contacts
      const contactsRes = await client.query('SELECT id, name, phone FROM contacts');
      expect(contactsRes.rowCount).toBe(1);
      expect(contactsRes.rows[0].name).toBe('Cliente Alpha');

      // 3. Query Journeys
      const journeysRes = await client.query('SELECT id, primary_service_or_product, total_revenue_minor FROM commercial_journeys');
      expect(journeysRes.rowCount).toBe(1);
      expect(journeysRes.rows[0].primary_service_or_product).toBe('Escova Lisa');
      expect(Number(journeysRes.rows[0].total_revenue_minor)).toBe(5900);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('should isolate User B to only see data from Workspace Beta', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      // Set RLS role and auth context for User B
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(`SET LOCAL "request.jwt.claim.sub" = '${userBId}'`);

      // 1. Query Workspaces
      const wsRes = await client.query('SELECT id, name FROM workspaces');
      expect(wsRes.rowCount).toBe(1);
      expect(wsRes.rows[0].id).toBe(workspaceBId);

      // 2. Query Contacts
      const contactsRes = await client.query('SELECT id, name, phone FROM contacts');
      expect(contactsRes.rowCount).toBe(1);
      expect(contactsRes.rows[0].name).toBe('Cliente Beta');

      // 3. Query Journeys
      const journeysRes = await client.query('SELECT id, primary_service_or_product, total_revenue_minor FROM commercial_journeys');
      expect(journeysRes.rowCount).toBe(1);
      expect(journeysRes.rows[0].primary_service_or_product).toBe('Película Térmica G20');
      expect(Number(journeysRes.rows[0].total_revenue_minor)).toBe(45000);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('should prevent User A from inserting records into Workspace Beta', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(`SET LOCAL "request.jwt.claim.sub" = '${userAId}'`);

      // Attempt to insert contact into Workspace Beta (which User A does not belong to)
      await expect(
        client.query(`
          INSERT INTO contacts (workspace_id, phone, name)
          VALUES ('${workspaceBId}', '+5549999333333', 'Intruder Contact')
        `)
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
