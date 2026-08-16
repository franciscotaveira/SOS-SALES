import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import { AccessibleWorkspace, WorkspaceDirectory } from '../../application/ports/workspace-directory.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

/**
 * Reads memberships using the same authenticated claim context used by
 * Supabase RLS. This adapter deliberately never assumes service_role.
 * Uses sos_sales_runtime which has EXECUTE on current_user_workspace_ids()
 * and inherits from authenticated, so auth.uid() works via request.jwt.claim.sub
 */
export class PostgresWorkspaceDirectory implements WorkspaceDirectory {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async listForActor(actor: AuthenticatedActor): Promise<AccessibleWorkspace[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Use sos_sales_runtime which has EXECUTE on current_user_workspace_ids()
      // and inherits from authenticated, so auth.uid() works via request.jwt.claim.sub
      await client.query('SET LOCAL ROLE sos_sales_runtime');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
      await client.query("SELECT pg_catalog.set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.userId, role: 'authenticated', email: actor.email })
      ]);

      const result = await client.query<AccessibleWorkspace>(`
        SELECT w.id, w.name, w.slug, wm.role
        FROM public.workspaces w
        INNER JOIN public.workspace_memberships wm
          ON wm.workspace_id = w.id
        WHERE wm.user_id = auth.uid()
        ORDER BY w.name ASC, w.id ASC
      `);

      await client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
  }
}
