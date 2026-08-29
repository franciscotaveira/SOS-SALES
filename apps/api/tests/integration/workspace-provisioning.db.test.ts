import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPool } from '../../src/infrastructure/database/pool.js';
import { PostgresWorkspaceProvisioningGateway } from '../../src/infrastructure/database/postgres-workspace-provisioning-gateway.js';

describe('Workspace provisioning persistence', () => {
  const parentId = 'f1000000-0000-4000-8000-000000000001';
  const actorId = 'f1100000-0000-4000-8000-000000000001';
  const actor = { userId: actorId, email: 'agency@example.test', globalRole: 'authenticated' as const };
  const createdWorkspaceIds: string[] = [];
  const gateway = new PostgresWorkspaceProvisioningGateway(dbPool);

  beforeAll(async () => {
    await dbPool.query(
      `INSERT INTO public.workspaces (id, name, slug, active)
       VALUES ($1, 'Agency Parent', 'agency-parent-test', true)
       ON CONFLICT (id) DO NOTHING`,
      [parentId],
    );
    await dbPool.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`,
      [parentId, actorId],
    );
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) await dbPool.query('DELETE FROM public.workspaces WHERE id = $1', [id]);
    await dbPool.query('DELETE FROM public.workspaces WHERE id = $1', [parentId]);
    await dbPool.end();
  });

  it('creates a real disconnected WABA workspace and agent profile owned by the agency', async () => {
    const result = await gateway.createClientWorkspace(actor, {
      parentWorkspaceId: parentId,
      name: 'Jacob Adv',
      businessType: 'general_services',
      tagline: 'Escritório de advocacia migratória',
      whatsappNumber: '+1 (508) 250 1315',
      provider: 'waba',
    });
    createdWorkspaceIds.push(result.workspaceId);

    expect(result).toMatchObject({
      workspaceName: 'Jacob Adv',
      channelProvider: 'meta_cloud',
      channelStatus: 'DISCONNECTED',
      ownerAccess: 'agency_owner',
    });
    const persisted = await dbPool.query(
      `SELECT w.slug, wm.role, cc.provider, cc.status, cfg.business_type
       FROM public.workspaces w
       JOIN public.workspace_memberships wm ON wm.workspace_id = w.id AND wm.user_id = $2
       JOIN public.channel_connections cc ON cc.workspace_id = w.id
       JOIN public.workspace_agent_config cfg ON cfg.workspace_id = w.id
       WHERE w.id = $1`,
      [result.workspaceId, actorId],
    );
    expect(persisted.rows[0]).toMatchObject({
      role: 'owner',
      provider: 'meta_cloud',
      status: 'DISCONNECTED',
      business_type: 'general_services',
    });
    expect(persisted.rows[0].slug).toMatch(/^jacob-adv-/);
  });
});
