import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  CockpitJourney,
  CockpitMessage,
  CockpitPriority,
  CockpitReadGateway,
  CockpitJourneyView,
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

interface JourneyDetailRow extends QueryResultRow {
  id: string;
  contact_id: string;
  status: CockpitJourney['status'];
  pipeline_stage: string | null;
  primary_service_or_product: string | null;
  total_revenue_minor: string | number;
  currency: string;
  started_at: Date;
  closed_at: Date | null;
  updated_at: Date;
  contact_name: string | null;
  contact_phone: string;
  channel_id: string | null;
  channel_provider: string | null;
  channel_phone_number: string | null;
  channel_name: string | null;
  channel_status: string | null;
  acquisitions: unknown[];
  messages: unknown[];
  facts: unknown[];
  state: Record<string, unknown> | null;
  recommendation: Record<string, unknown> | null;
  handoff: Record<string, unknown> | null;
  outcome: Record<string, unknown> | null;
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

  async getJourneyCockpit(
    actor: AuthenticatedActor,
    workspaceId: string,
    journeyId: string,
    messageLimit: number,
  ): Promise<CockpitJourneyView | null> {
    return this.withActor(actor, async (client) => {
      // Execute journey and all sub-entities in a single consolidated query
      // to eliminate multi-roundtrip network latency across remote database pooler.
      const journeyResult = await client.query<JourneyDetailRow>(`
        SELECT
          j.id, j.contact_id, j.status, j.pipeline_stage,
          j.primary_service_or_product, j.total_revenue_minor, j.currency,
          j.started_at, j.closed_at, j.updated_at,
          c.name AS contact_name, c.phone AS contact_phone,
          cc.id AS channel_id, cc.provider AS channel_provider,
          cc.phone_number AS channel_phone_number, cc.name AS channel_name,
          cc.status AS channel_status,
          (
            SELECT COALESCE(json_agg(a ORDER BY a.occurred_at ASC, a.id ASC), '[]'::json)
            FROM (
              SELECT id, source, campaign_id, campaign_name, ad_set_id, ad_id,
                     creative_code, offer_hook, entry_message, confidence, occurred_at
              FROM public.acquisition_contexts
              WHERE workspace_id = j.workspace_id AND journey_id = j.id
            ) a
          ) AS acquisitions,
          (
            SELECT COALESCE(json_agg(m), '[]'::json)
            FROM (
              SELECT id, direction, sender_type, text_content, sent_at
              FROM public.conversation_messages
              WHERE workspace_id = j.workspace_id AND journey_id = j.id
              ORDER BY sent_at DESC, id DESC
              LIMIT $3
            ) m
          ) AS messages,
          (
            SELECT COALESCE(json_agg(f ORDER BY f.observed_at ASC, f.id ASC), '[]'::json)
            FROM (
              SELECT id, key, value, source, confidence, confirmed_by_customer, observed_at
              FROM public.known_facts
              WHERE workspace_id = j.workspace_id AND journey_id = j.id AND superseded_by IS NULL
            ) f
          ) AS facts,
          (
            SELECT row_to_json(s)
            FROM (
              SELECT current_stage, stage_confidence, primary_friction,
                     secondary_frictions, friction_evidence, friction_confidence,
                     friction_resolved, updated_at
              FROM public.decision_states
              WHERE workspace_id = j.workspace_id AND journey_id = j.id
            ) s
          ) AS state,
          (
            SELECT row_to_json(r)
            FROM (
              SELECT id, suggested_action, suggested_draft_text, micro_commitment_goal,
                     confidence, policy_status, policy_reason, created_at
              FROM public.recommended_actions
              WHERE workspace_id = j.workspace_id AND journey_id = j.id
              ORDER BY created_at DESC, id DESC
              LIMIT 1
            ) r
          ) AS recommendation,
          (
            SELECT row_to_json(h)
            FROM (
              SELECT id, status, assigned_to_user_id, briefing, trigger_reason,
                     opened_at, accepted_at, resolved_at
              FROM public.handoff_cases
              WHERE workspace_id = j.workspace_id AND journey_id = j.id
                AND status IN ('PENDING', 'ACCEPTED', 'RETURNED_TO_AI')
              ORDER BY opened_at DESC, id DESC
              LIMIT 1
            ) h
          ) AS handoff,
          (
            SELECT row_to_json(o)
            FROM (
              SELECT id, result, final_revenue_minor, currency, closed_reason,
                     capi_status, occurred_at
              FROM public.commercial_outcomes
              WHERE workspace_id = j.workspace_id AND journey_id = j.id
              LIMIT 1
            ) o
          ) AS outcome
        FROM public.commercial_journeys j
        JOIN public.contacts c
          ON c.workspace_id = j.workspace_id AND c.id = j.contact_id
        LEFT JOIN public.channel_connections cc
          ON cc.workspace_id = j.workspace_id AND cc.id = j.channel_connection_id
        WHERE j.workspace_id = $1 AND j.id = $2
      `, [workspaceId, journeyId, messageLimit]);

      const row = journeyResult.rows[0];
      if (!row) return null;

      const acquisitionsList = Array.isArray(row.acquisitions) ? row.acquisitions : [];
      const messagesList = Array.isArray(row.messages) ? row.messages : [];
      const factsList = Array.isArray(row.facts) ? row.facts : [];
      const state = row.state as Record<string, unknown> | null;
      const recommendation = row.recommendation as Record<string, unknown> | null;
      const handoff = row.handoff as Record<string, unknown> | null;
      const outcome = row.outcome as Record<string, unknown> | null;

      return {
        journey: {
          id: row.id,
          contactId: row.contact_id,
          status: row.status,
          pipelineStage: row.pipeline_stage,
          primaryServiceOrProduct: row.primary_service_or_product,
          totalRevenueMinor: Number(row.total_revenue_minor),
          currency: row.currency,
          startedAt: new Date(row.started_at).toISOString(),
          closedAt: asIso(row.closed_at),
          updatedAt: new Date(row.updated_at).toISOString(),
          contact: { id: row.contact_id, name: row.contact_name, phone: row.contact_phone },
          channel: row.channel_id && row.channel_provider && row.channel_phone_number && row.channel_name && row.channel_status
            ? {
                id: row.channel_id,
                provider: row.channel_provider,
                phoneNumber: row.channel_phone_number,
                name: row.channel_name,
                status: row.channel_status,
              }
            : null,
        },
        acquisitionContexts: acquisitionsList.map((item: any) => ({
          id: String(item.id), source: String(item.source),
          campaignId: item.campaign_id as string | null,
          campaignName: item.campaign_name as string | null,
          adSetId: item.ad_set_id as string | null,
          adId: item.ad_id as string | null,
          creativeCode: item.creative_code as string | null,
          offerHook: item.offer_hook as string | null,
          entryMessage: item.entry_message as string | null,
          confidence: String(item.confidence),
          occurredAt: new Date(item.occurred_at as Date).toISOString(),
        })),
        // Query is DESC for a bounded "latest N" read; reverse only for the
        // user-facing chronological conversation order.
        messages: messagesList.reverse().map((message: any) => ({
          id: message.id, direction: message.direction, senderType: message.sender_type,
          textContent: message.text_content, sentAt: new Date(message.sent_at).toISOString(),
        })),
        knownFacts: factsList.map((fact: any) => ({
          id: String(fact.id), key: String(fact.key), value: fact.value,
          source: String(fact.source), confidence: Number(fact.confidence),
          confirmedByCustomer: Boolean(fact.confirmed_by_customer),
          observedAt: new Date(fact.observed_at as Date).toISOString(),
        })),
        decisionState: state ? {
          currentStage: String(state.current_stage), stageConfidence: Number(state.stage_confidence),
          primaryFriction: state.primary_friction as string | null,
          secondaryFrictions: state.secondary_frictions,
          frictionEvidence: state.friction_evidence as string | null,
          frictionConfidence: Number(state.friction_confidence),
          frictionResolved: Boolean(state.friction_resolved),
          updatedAt: new Date(state.updated_at as Date).toISOString(),
        } : null,
        recommendation: recommendation ? {
          id: String(recommendation.id), suggestedAction: String(recommendation.suggested_action),
          suggestedDraftText: recommendation.suggested_draft_text as string | null,
          microCommitmentGoal: String(recommendation.micro_commitment_goal),
          confidence: Number(recommendation.confidence), policyStatus: String(recommendation.policy_status),
          policyReason: recommendation.policy_reason as string | null,
          createdAt: new Date(recommendation.created_at as Date).toISOString(),
        } : null,
        handoff: handoff ? {
          id: String(handoff.id), status: String(handoff.status),
          assignedToUserId: handoff.assigned_to_user_id as string | null,
          briefing: handoff.briefing, triggerReason: String(handoff.trigger_reason),
          openedAt: new Date(handoff.opened_at as Date).toISOString(),
          acceptedAt: asIso(handoff.accepted_at as Date | null),
          resolvedAt: asIso(handoff.resolved_at as Date | null),
        } : null,
        outcome: outcome ? {
          id: String(outcome.id), result: String(outcome.result),
          finalRevenueMinor: outcome.final_revenue_minor === null ? null : Number(outcome.final_revenue_minor),
          currency: String(outcome.currency), closedReason: outcome.closed_reason as string | null,
          capiStatus: String(outcome.capi_status), occurredAt: new Date(outcome.occurred_at as Date).toISOString(),
        } : null,
      };
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
      // Use sos_sales_runtime which has EXECUTE on current_user_workspace_ids()
      // and inherits from authenticated, so auth.uid() works via request.jwt.claim.sub
      await client.query('SET LOCAL ROLE sos_sales_runtime');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
      await client.query("SELECT pg_catalog.set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.userId, role: 'authenticated', email: actor.email })
      ]);
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
