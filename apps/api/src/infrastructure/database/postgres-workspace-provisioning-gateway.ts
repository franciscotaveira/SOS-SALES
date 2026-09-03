import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  WorkspaceInitResult,
  ClientWorkspaceInput,
  ClientWorkspaceResult,
  WorkspaceProvisioningGateway,
} from '../../application/ports/workspace-provisioning-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

export class PostgresWorkspaceProvisioningGateway implements WorkspaceProvisioningGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async actorHasWorkspace(actor: AuthenticatedActor): Promise<boolean> {
    return this.withServiceRole(async (client) => {
      const result = await client.query<{ id: string }>(
        'SELECT workspace_id FROM public.workspace_memberships WHERE user_id = $1 LIMIT 1',
        [actor.userId],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async initializeForActor(
    actor: AuthenticatedActor,
    workspaceName?: string,
  ): Promise<WorkspaceInitResult> {
    return this.withServiceRole(async (client) => {
      // 1. Check existing
      const existing = await client.query<{
        workspace_id: string;
        name: string;
        membership_id: string;
        role: 'owner';
        channel_id: string | null;
      }>(
        `SELECT
           w.id as workspace_id,
           w.name,
           wm.id as membership_id,
           wm.role,
           cc.id as channel_id
         FROM public.workspace_memberships wm
         JOIN public.workspaces w ON w.id = wm.workspace_id
         LEFT JOIN public.channel_connections cc ON cc.workspace_id = w.id
         WHERE wm.user_id = $1
         ORDER BY wm.created_at ASC
         LIMIT 1`,
        [actor.userId],
      );

      if (existing.rows.length > 0 && existing.rows[0]) {
        const row = existing.rows[0];
        return {
          workspaceId: row.workspace_id,
          workspaceName: row.name,
          membershipId: row.membership_id,
          role: 'owner',
          channelConnectionId: row.channel_id || '',
          isExisting: true,
        };
      }

      // 2. Create new workspace
      const defaultName =
        workspaceName?.trim() ||
        (actor.email ? `${actor.email.split('@')[0]} Workspace` : 'Meu Espaço Comercial');

      const slug = this.workspaceSlug(defaultName);
      const wsResult = await client.query<{ id: string; name: string }>(
        'INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id, name',
        [defaultName, slug],
      );
      const ws = wsResult.rows[0];

      // 3. Create membership (owner)
      const memResult = await client.query<{ id: string }>(
        'INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, $3) RETURNING id',
        [ws.id, actor.userId, 'owner'],
      );
      const membership = memResult.rows[0];

      // 4. Create default channel connection (WAHA DISCONNECTED with dedicated session)
      const sessionName = `ws_${ws.id.replace(/-/g, '')}`;
      const chanResult = await client.query<{ id: string }>(
        `INSERT INTO public.channel_connections (
           workspace_id, provider, phone_number, name, status, public_config
         ) VALUES (
           $1, 'waha', 'pending', 'WhatsApp Principal (WAHA)', 'DISCONNECTED', $2
         ) RETURNING id`,
        [ws.id, JSON.stringify({ autoCreated: true, session: sessionName })],
      );
      const channel = chanResult.rows[0];

      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        membershipId: membership.id,
        role: 'owner',
        channelConnectionId: channel.id,
        isExisting: false,
      };
    });
  }

  async createClientWorkspace(
    actor: AuthenticatedActor,
    input: ClientWorkspaceInput,
  ): Promise<ClientWorkspaceResult> {
    return this.withServiceRole(async (client) => {
      const authorization = await client.query(
        `SELECT 1 FROM public.workspace_memberships
         WHERE workspace_id = $1 AND user_id = $2 AND role = 'owner'`,
        [input.parentWorkspaceId, actor.userId],
      );
      if (authorization.rowCount !== 1) throw new Error('CLIENT_WORKSPACE_OWNER_REQUIRED');

      const slug = this.workspaceSlug(input.name);
      const workspace = await client.query<{ id: string; name: string }>(
        `INSERT INTO public.workspaces (name, slug)
         VALUES ($1, $2)
         RETURNING id, name`,
        [input.name.trim(), slug],
      );
      const ws = workspace.rows[0];
      const membership = await client.query<{ id: string }>(
        `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner') RETURNING id`,
        [ws.id, actor.userId],
      );

      const provider = input.provider === 'waba' ? 'meta_cloud' : 'waha';
      const publicConfig = input.provider === 'waba'
        ? { onboardingState: 'PENDING_EMBEDDED_SIGNUP' }
        : { session: `ws_${ws.id.replace(/-/g, '')}`, onboardingState: 'PENDING_QR' };
      const channel = await client.query<{ id: string }>(
        `INSERT INTO public.channel_connections (
           workspace_id, provider, phone_number, name, status, public_config
         ) VALUES ($1, $2, $3, $4, 'DISCONNECTED', $5) RETURNING id`,
        [
          ws.id,
          provider,
          // A disconnected client has no provider identifier yet. Do not use
          // a shared literal such as "pending": it collides with the
          // provider-identifier uniqueness index and looks like a real number.
          input.whatsappNumber?.trim() || '',
          input.provider === 'waba' ? 'WhatsApp Oficial (Meta Cloud)' : 'WhatsApp Principal (WAHA)',
          JSON.stringify(publicConfig),
        ],
      );

      await client.query(
        `INSERT INTO public.workspace_agent_config (
           workspace_id, business_type, phone, extra_context
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id) DO NOTHING`,
        [ws.id, input.businessType, input.whatsappNumber?.trim() || '', input.tagline.trim() || null],
      );

      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        membershipId: membership.rows[0].id,
        role: 'owner',
        channelConnectionId: channel.rows[0].id,
        slug,
        channelProvider: provider,
        channelStatus: 'DISCONNECTED',
        ownerAccess: 'agency_owner',
      };
    });
  }

  async deactivateWorkspace(actor: AuthenticatedActor, workspaceId: string): Promise<void> {
    return this.withServiceRole(async (client) => {
      // Deactivation is intentionally not a DELETE: messages, journeys and
      // audit evidence remain intact and no phone number can be reassigned by
      // accident. Only an owner of this exact workspace may perform it.
      const result = await client.query(
        `UPDATE public.workspaces w
         SET active = false
         WHERE w.id = $1
           AND w.active = true
           AND EXISTS (
             SELECT 1
             FROM public.workspace_memberships wm
             WHERE wm.workspace_id = w.id
               AND wm.user_id = $2
               AND wm.role = 'owner'
           )`,
        [workspaceId, actor.userId],
      );

      if (result.rowCount !== 1) throw new Error('WORKSPACE_DEACTIVATION_FORBIDDEN_OR_NOT_FOUND');
    });
  }

  private workspaceSlug(name: string): string {
    const base = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 55) || 'workspace';
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  private async withServiceRole<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
  }
}
