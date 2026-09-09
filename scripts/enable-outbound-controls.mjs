import { dbPool } from './dist/pool-5TAEGEFN.js';

async function run() {
  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const ownerUserId = '17fc95cf-7d0f-4ad5-ab92-de1531bd9eb2';

  await dbPool.query(`
    INSERT INTO public.workspace_operation_controls (workspace_id, outbound_enabled, reason, changed_by_user_id, changed_at)
    VALUES ($1, true, 'Habilitacao SOS Sales Comercial', $2, NOW())
    ON CONFLICT (workspace_id) DO UPDATE SET outbound_enabled = true, reason = EXCLUDED.reason, changed_by_user_id = EXCLUDED.changed_by_user_id, changed_at = NOW()
  `, [workspaceId, ownerUserId]);

  const channels = await dbPool.query(
    'SELECT id FROM public.channel_connections WHERE workspace_id = $1',
    [workspaceId]
  );

  for (const ch of channels.rows) {
    await dbPool.query(`
      INSERT INTO public.channel_operation_controls (workspace_id, channel_connection_id, outbound_enabled, reason, changed_by_user_id, changed_at)
      VALUES ($1, $2, true, 'Habilitacao Canal WAHA', $3, NOW())
      ON CONFLICT (workspace_id, channel_connection_id) DO UPDATE SET outbound_enabled = true, reason = EXCLUDED.reason, changed_by_user_id = EXCLUDED.changed_by_user_id, changed_at = NOW()
    `, [workspaceId, ch.id, ownerUserId]);
  }

  console.log('✅ Outbound operation controls enabled successfully.');
  process.exit(0);
}

run().catch(console.error);
