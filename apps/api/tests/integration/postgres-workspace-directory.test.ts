import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresWorkspaceDirectory } from '../../src/infrastructure/database/postgres-workspace-directory.js';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('PostgresWorkspaceDirectory — authenticated claim context and RLS', () => {
  const userA = 'c7100000-0000-4000-8000-000000000001';
  const userB = 'c7100000-0000-4000-8000-000000000002';
  const workspaceA = 'c7200000-0000-4000-8000-000000000001';
  const workspaceB = 'c7200000-0000-4000-8000-000000000002';
  const directory = new PostgresWorkspaceDirectory(dbPool);

  beforeAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA, workspaceB]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
    }
    await query(
      `INSERT INTO workspaces (id, name, slug, active) VALUES
       ($1, 'Workspace Directory Alpha', 'workspace-directory-alpha', true),
       ($2, 'Workspace Directory Beta', 'workspace-directory-beta', true)
       ON CONFLICT (id) DO UPDATE SET active = true`,
      [workspaceA, workspaceB],
    );
    await query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES
       ($1, $3, 'operator'), ($2, $4, 'viewer')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceA, workspaceB, userA, userB],
    );
  });

  afterAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA, workspaceB]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('DIR-01: reads only workspaces permitted by the verifier-derived authenticated subject', async () => {
    const rows = await directory.listForActor({ userId: userA, email: 'a@example.test' });
    expect(rows).toEqual([{ id: workspaceA, name: 'Workspace Directory Alpha', slug: 'workspace-directory-alpha', role: 'operator' }]);
  });

  it('DIR-02: preserves the membership role returned under RLS rather than a caller-supplied role', async () => {
    const rows = await directory.listForActor({ userId: userB });
    expect(rows).toEqual([{ id: workspaceB, name: 'Workspace Directory Beta', slug: 'workspace-directory-beta', role: 'viewer' }]);
  });
});
