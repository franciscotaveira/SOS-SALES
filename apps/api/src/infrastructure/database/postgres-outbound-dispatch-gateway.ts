import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  ApproveOutboundDispatchInput,
  CancelOutboundDispatchInput,
  CreateOutboundDraftInput,
  OutboundDispatchConflictError,
  OutboundDispatchGateway,
  OutboundDispatchMutationResult,
  OutboundDispatchNotFoundError,
  OutboundDispatchRecord,
  OutboundDispatchRuleViolationError,
  OUTBOUND_DISPATCH_STATUSES,
} from '../../application/ports/outbound-dispatch-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface RpcRow { result: unknown; }
interface DispatchRow {
  id: string;
  journey_id: string;
  contact_id: string;
  channel_connection_id: string;
  message_kind: 'TEXT';
  text_content: string;
  status: string;
  created_at: Date | string;
  approved_at: Date | string | null;
  cancelled_at: Date | string | null;
  provider_accepted_at: Date | string | null;
  provider_failure_code: string | null;
  provider_failure_at: Date | string | null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isStatus(value: unknown): value is OutboundDispatchMutationResult['status'] {
  return typeof value === 'string' && (OUTBOUND_DISPATCH_STATUSES as readonly string[]).includes(value);
}

function parseMutation(value: unknown): OutboundDispatchMutationResult {
  const result = typeof value === 'string' ? JSON.parse(value) : value;
  if (!result || typeof result !== 'object') throw new Error('Unexpected outbound dispatch result');
  const candidate = result as Record<string, unknown>;
  if (typeof candidate.dispatchId !== 'string' || !isStatus(candidate.status) || typeof candidate.idempotent !== 'boolean') {
    throw new Error('Unexpected outbound dispatch result');
  }
  return { dispatchId: candidate.dispatchId, status: candidate.status, idempotent: candidate.idempotent };
}

function classify(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (/Unauthorized: User does not have operator or owner role|Outbound dispatch not found|Unauthorized workspace operation/.test(message)) {
    throw new OutboundDispatchNotFoundError();
  }
  if (/not awaiting human approval|Only an unclaimed dispatch can be cancelled/.test(message)) {
    throw new OutboundDispatchConflictError('The outbound dispatch state has changed');
  }
  if (/Invalid outbound draft request|Invalid idempotency key|Invalid cancellation request|Open journey with a channel is required/.test(message)) {
    throw new OutboundDispatchRuleViolationError('The outbound dispatch request is not valid');
  }
  throw error;
}

/** Executes all operations as the verified JWT subject under Postgres RLS. */
export class PostgresOutboundDispatchGateway implements OutboundDispatchGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async createDraft(actor: AuthenticatedActor, input: CreateOutboundDraftInput): Promise<OutboundDispatchMutationResult | null> {
    return this.mutate(actor, async (client) => {
      const query = await client.query<RpcRow>(
        'SELECT public.create_outbound_draft($1, $2, $3, $4) AS result',
        [input.workspaceId, input.journeyId, input.textContent, input.idempotencyKey],
      );
      return parseMutation(query.rows[0]?.result);
    });
  }

  async approve(actor: AuthenticatedActor, input: ApproveOutboundDispatchInput): Promise<OutboundDispatchMutationResult | null> {
    return this.mutate(actor, async (client) => {
      const query = await client.query<RpcRow>(
        'SELECT public.approve_outbound_dispatch($1, $2, $3) AS result',
        [input.workspaceId, input.dispatchId, input.idempotencyKey],
      );
      return parseMutation(query.rows[0]?.result);
    });
  }

  async cancel(actor: AuthenticatedActor, input: CancelOutboundDispatchInput): Promise<OutboundDispatchMutationResult | null> {
    return this.mutate(actor, async (client) => {
      const query = await client.query<RpcRow>(
        'SELECT public.cancel_outbound_dispatch($1, $2, $3, $4) AS result',
        [input.workspaceId, input.dispatchId, input.reason, input.idempotencyKey],
      );
      return parseMutation(query.rows[0]?.result);
    });
  }

  async get(actor: AuthenticatedActor, workspaceId: string, dispatchId: string): Promise<OutboundDispatchRecord | null> {
    return this.withActor(actor, async (client) => {
      const query = await client.query<DispatchRow>(
        `SELECT id, journey_id, contact_id, channel_connection_id, message_kind, text_content, status,
                created_at, approved_at, cancelled_at, provider_accepted_at, provider_failure_code, provider_failure_at
         FROM public.outbound_dispatches
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, dispatchId],
      );
      const row = query.rows[0];
      if (!row || !isStatus(row.status) || row.message_kind !== 'TEXT') return null;
      return {
        dispatchId: row.id,
        journeyId: row.journey_id,
        contactId: row.contact_id,
        channelConnectionId: row.channel_connection_id,
        messageKind: 'TEXT',
        textContent: row.text_content,
        status: row.status,
        createdAt: toIso(row.created_at),
        ...(row.approved_at ? { approvedAt: toIso(row.approved_at) } : {}),
        ...(row.cancelled_at ? { cancelledAt: toIso(row.cancelled_at) } : {}),
        ...(row.provider_accepted_at ? { providerAcceptedAt: toIso(row.provider_accepted_at) } : {}),
        ...(row.provider_failure_code ? { providerFailureCode: row.provider_failure_code } : {}),
        ...(row.provider_failure_at ? { providerFailureAt: toIso(row.provider_failure_at) } : {}),
      };
    });
  }

  private async mutate<T>(actor: AuthenticatedActor, action: (client: PoolClient) => Promise<T>): Promise<T | null> {
    try {
      return await this.withActor(actor, action);
    } catch (error) {
      try {
        classify(error);
      } catch (classified) {
        if (classified instanceof OutboundDispatchNotFoundError) return null;
        throw classified;
      }
      throw error;
    }
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
}
