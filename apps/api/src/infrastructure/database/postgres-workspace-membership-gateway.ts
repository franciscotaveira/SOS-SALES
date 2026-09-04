import type { Pool, PoolClient } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  WorkspaceMembershipGateway,
  WorkspaceMemberRecord,
  WorkspaceMemberRole,
} from '../../application/ports/workspace-membership-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

export class PostgresWorkspaceMembershipGateway implements WorkspaceMembershipGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async listMembers(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    return this.withServiceRole(async (client) => {
      await this.requireMembership(client, actor.userId, workspaceId, false);
      const result = await client.query<WorkspaceMemberRecord>(`
        SELECT wm.id AS "membershipId", wm.user_id AS "userId",
               wm.role, wm.created_at AS "createdAt"
        FROM public.workspace_memberships wm
        WHERE wm.workspace_id = $1::uuid
        ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'operator' THEN 1 ELSE 2 END,
                 wm.created_at ASC, wm.id ASC
      `, [workspaceId]);
      return result.rows;
    });
  }

  async createInvitation(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: { email: string; role: 'operator' | 'viewer' },
  ): Promise<{ code: string; email: string; role: 'operator' | 'viewer'; expiresAt: string }> {
    return this.withServiceRole(async (client) => {
      await this.requireMembership(client, actor.userId, workspaceId, true);
      const code = randomBytes(24).toString('base64url');
      const tokenHash = this.hashCode(code);
      const email = input.email.trim().toLowerCase();
      const result = await client.query<{ expires_at: string }>(`
        INSERT INTO public.workspace_member_invitations
          (workspace_id, invitee_email, role, token_hash, created_by)
        VALUES ($1::uuid, $2, $3, $4, $5::uuid)
        RETURNING expires_at
      `, [workspaceId, email, input.role, tokenHash, actor.userId]);
      return { code, email, role: input.role, expiresAt: result.rows[0].expires_at };
    });
  }

  async acceptInvitation(actor: AuthenticatedActor, code: string): Promise<{ workspaceId: string; role: WorkspaceMemberRole }> {
    const actorEmail = actor.email?.trim().toLowerCase();
    if (!actorEmail) throw new Error('WORKSPACE_MEMBER_EMAIL_REQUIRED');
    return this.withServiceRole(async (client) => {
      const invitation = await client.query<{
        id: string; workspace_id: string; invitee_email: string; role: 'operator' | 'viewer'; expires_at: string;
      }>(`
        SELECT id, workspace_id, invitee_email, role, expires_at
        FROM public.workspace_member_invitations
        WHERE token_hash = $1
          AND accepted_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE
      `, [this.hashCode(code.trim())]);
      if (invitation.rowCount !== 1) throw new Error('WORKSPACE_MEMBER_INVITATION_INVALID');
      const record = invitation.rows[0];
      if (record.invitee_email !== actorEmail) throw new Error('WORKSPACE_MEMBER_INVITATION_EMAIL_MISMATCH');

      await client.query(`
        INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
        VALUES ($1::uuid, $2::uuid, $3)
        ON CONFLICT (workspace_id, user_id) DO NOTHING
      `, [record.workspace_id, actor.userId, record.role]);
      await client.query(`
        UPDATE public.workspace_member_invitations
        SET accepted_at = NOW(), accepted_by = $2::uuid
        WHERE id = $1::uuid
      `, [record.id, actor.userId]);
      return { workspaceId: record.workspace_id, role: record.role };
    });
  }

  async removeMember(actor: AuthenticatedActor, workspaceId: string, membershipId: string): Promise<void> {
    return this.withServiceRole(async (client) => {
      await this.requireMembership(client, actor.userId, workspaceId, true);
      const result = await client.query(`
        DELETE FROM public.workspace_memberships
        WHERE id = $1::uuid
          AND workspace_id = $2::uuid
          AND role IN ('operator', 'viewer')
      `, [membershipId, workspaceId]);
      if (result.rowCount !== 1) throw new Error('WORKSPACE_MEMBER_NOT_REMOVABLE_OR_NOT_FOUND');
    });
  }

  private async requireMembership(client: PoolClient, userId: string, workspaceId: string, ownerRequired: boolean): Promise<void> {
    const result = await client.query<{ role: string }>(`
      SELECT role
      FROM public.workspace_memberships
      WHERE workspace_id = $1::uuid AND user_id = $2::uuid
      LIMIT 1
    `, [workspaceId, userId]);
    if (result.rowCount !== 1 || (ownerRequired && result.rows[0].role !== 'owner')) {
      throw new Error('WORKSPACE_MEMBERSHIP_FORBIDDEN');
    }
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

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
