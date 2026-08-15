import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  CockpitJourney,
  CockpitMessage,
  CockpitPriority,
  CockpitReadGateway,
  CursorPage,
} from '../../application/ports/cockpit-read-gateway.js';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface DatabaseCursor {
  at: string;
  id: string;
}

interface PriorityRow extends QueryResultRow {
  journey_id: string;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  pipeline_stage: string | null;
  handoff_case_id: string | null;
  handoff_status: string | null;
  assigned_to_user_id: string | null;
  last_message_text: string | null;
  last_message_at: Date | null;
  follow_up_due_at: Date | null;
  sla_deadline: Date | null;
  sla_state: 'OK' | 'DUE' | 'OVERDUE';
  priority_reason: string;
  unread_count: string | number;
}

interface JourneyRow extends QueryResultRow {
  id: string;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  status: CockpitJourney['status'];
  pipeline_stage: string | null;
  primary_service_or_product: string | null;
  started_at: Date;
  updated_at: Date;
}

interface MessageRow extends QueryResultRow {
  id: string;
  direction: CockpitMessage['direction'];
  sender_type: CockpitMessage['senderType'];
  text_content: string | null;
  sent_at: Date;
}

function asIso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function encodeCursor(value: DatabaseCursor): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(value: string | null): DatabaseCursor | null {
  if (!value) return null;
  const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<DatabaseCursor>;
  if (
    typeof parsed.at !== 'string' ||
    Number.isNaN(Date.parse(parsed.at)) ||
    typeof parsed.id !== 'string'
  ) {
    throw new Error('Invalid cursor');
  }
  return { at: parsed.at, id: parsed.id };
}

/**
 * Executes all reads as the authenticated JWT subject. The postgres login is
 * never treated as an application actor, and every resource lookup remains
 * subject to the database RLS policies.
 */
export class PostgresCockpitReadGateway implements CockpitReadGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async listPriorities(actor: AuthenticatedActor, workspaceId: string, limit: number): Promise<CockpitPriority[] | null> {
    return this.withActor(actor, async (client) => {
      if (!(await this.hasWorkspaceAccess(client, workspaceId))) return null;
      const result = await client.query<PriorityRow>(`
        SELECT journey_id, contact_id, contact_name, contact_phone, pipeline_stage,
               handoff_case_id, handoff_status, assigned_to_user_id,
               last_message_text, last_message_at, follow_up_due_at,
               sla_deadline, sla_state, priority_reason, unread_count
        FROM public.get_workspace_priorities($1, $2)
      `, [workspaceId, limit]);
      return result.rows.map((row) => ({
        journeyId: row.journey_id,
        contactId: row.contact_id,
        contactName: row.contact_name,
        contactPhone: row.contact_phone,
        pipelineStage: row.pipeline_stage,
        handoffCaseId: row.handoff_case_id,
        handoffStatus: row.handoff_status,
        assignedToUserId: row.assigned_to_user_id,
        lastMessageText: row.last_message_text,
        lastMessageAt: asIso(row.last_message_at),
        followUpDueAt: asIso(row.follow_up_due_at),
        slaDeadline: asIso(row.sla_deadline),
        slaState: row.sla_state,
        priorityReason: row.priority_reason,
        unreadCount: Number(row.unread_count),
      }));
    });
  }

  async listJourneys(
    actor: AuthenticatedActor,
    workspaceId: string,
    options: { limit: number; cursor: string | null },
  ): Promise<CursorPage<CockpitJourney> | null> {
    const cursor = decodeCursor(options.cursor);
    return this.withActor(actor, async (client) => {
      if (!(await this.hasWorkspaceAccess(client, workspaceId))) return null;
      const result = await client.query<JourneyRow>(`
        SELECT j.id, j.contact_id, c.name AS contact_name, c.phone AS contact_phone,
               j.status, j.pipeline_stage, j.primary_service_or_product,
               j.started_at, j.updated_at
        FROM public.commercial_journeys j
        JOIN public.contacts c ON c.workspace_id = j.workspace_id AND c.id = j.contact_id
        WHERE j.workspace_id = $1
          AND ($2::timestamptz IS NULL OR (j.updated_at, j.id) < ($2::timestamptz, $3::uuid))
        ORDER BY j.updated_at DESC, j.id DESC
        LIMIT $4
      `, [workspaceId, cursor?.at ?? null, cursor?.id ?? null, options.limit + 1]);
      return this.journeyPage(result.rows, options.limit);
    });
  }

  async listMessages(
    actor: AuthenticatedActor,
    journeyId: string,
    options: { limit: number; cursor: string | null },
  ): Promise<CursorPage<CockpitMessage> | null> {
    const cursor = decodeCursor(options.cursor);
    return this.withActor(actor, async (client) => {
      // RLS intentionally makes both a missing and a cross-tenant journey look absent.
      const journey = await client.query<{ id: string }>(
        'SELECT id FROM public.commercial_journeys WHERE id = $1',
        [journeyId],
      );
      if (journey.rowCount === 0) return null;
      const result = await client.query<MessageRow>(`
        SELECT id, direction, sender_type, text_content, sent_at
        FROM public.conversation_messages
        WHERE journey_id = $1
          AND ($2::timestamptz IS NULL OR (sent_at, id) < ($2::timestamptz, $3::uuid))
        ORDER BY sent_at DESC, id DESC
        LIMIT $4
      `, [journeyId, cursor?.at ?? null, cursor?.id ?? null, options.limit + 1]);
      return this.messagePage(result.rows, options.limit);
    });
  }

  private async hasWorkspaceAccess(client: PoolClient, workspaceId: string): Promise<boolean> {
    const result = await client.query('SELECT id FROM public.workspaces WHERE id = $1', [workspaceId]);
    return result.rowCount === 1;
  }

  private async withActor<T>(actor: AuthenticatedActor, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
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

  private journeyPage(rows: JourneyRow[], limit: number): CursorPage<CockpitJourney> {
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => ({
        id: row.id,
        contactId: row.contact_id,
        contactName: row.contact_name,
        contactPhone: row.contact_phone,
        status: row.status,
        pipelineStage: row.pipeline_stage,
        primaryServiceOrProduct: row.primary_service_or_product,
        startedAt: new Date(row.started_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
      nextCursor: rows.length > limit && last
        ? encodeCursor({ at: new Date(last.updated_at).toISOString(), id: last.id })
        : null,
    };
  }

  private messagePage(rows: MessageRow[], limit: number): CursorPage<CockpitMessage> {
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => ({
        id: row.id,
        direction: row.direction,
        senderType: row.sender_type,
        textContent: row.text_content,
        sentAt: new Date(row.sent_at).toISOString(),
      })),
      nextCursor: rows.length > limit && last
        ? encodeCursor({ at: new Date(last.sent_at).toISOString(), id: last.id })
        : null,
    };
  }
}
