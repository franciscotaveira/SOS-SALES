import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  ApproveOutboundDispatchInput,
  CancelOutboundDispatchInput,
  ClaimedOutboundDispatch,
  CreateOutboundDraftInput,
  CreateWabaOutboundDraftInput,
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
  message_kind: string;
  text_content: string;
  message_payload: Record<string, unknown> | string | null;
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

  async createWabaDraft(actor: AuthenticatedActor, input: CreateWabaOutboundDraftInput): Promise<OutboundDispatchMutationResult | null> {
    return this.mutate(actor, async (client) => {
      const query = await client.query<RpcRow>(
        'SELECT public.create_waba_outbound_draft($1, $2, $3, $4, $5, $6) AS result',
        [input.workspaceId, input.journeyId, input.messageKind, input.textContent, JSON.stringify(input.messagePayload), input.idempotencyKey],
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
        `SELECT id, journey_id, contact_id, channel_connection_id, message_kind, text_content, message_payload, status,
                created_at, approved_at, cancelled_at, provider_accepted_at, provider_failure_code, provider_failure_at
         FROM public.outbound_dispatches
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, dispatchId],
      );
      const row = query.rows[0];
      if (!row || !isStatus(row.status) || !['TEXT', 'WABA_TEMPLATE', 'WABA_BUTTONS', 'WABA_LIST', 'WABA_FLOW', 'WABA_MEDIA'].includes(row.message_kind)) return null;
      const messagePayload = typeof row.message_payload === 'string' ? JSON.parse(row.message_payload) : row.message_payload;
      return {
        dispatchId: row.id,
        journeyId: row.journey_id,
        contactId: row.contact_id,
        channelConnectionId: row.channel_connection_id,
        messageKind: row.message_kind as OutboundDispatchRecord['messageKind'],
        textContent: row.text_content,
        ...(messagePayload && typeof messagePayload === 'object' && Object.keys(messagePayload).length > 0 ? { messagePayload } : {}),
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

  async listClaimableDispatches(params: { limit: number }): Promise<Array<{ dispatchId: string; workspaceId: string }>> {
    return this.withServiceRole(async (client) => {
      const query = await client.query<{ id: string; workspace_id: string }>(
        `SELECT id, workspace_id
         FROM public.outbound_dispatches
         WHERE status = 'APPROVED'
            OR (status = 'CLAIMED' AND claim_expires_at < NOW())
         ORDER BY created_at ASC
         LIMIT $1`,
        [params.limit],
      );
      return query.rows.map((r) => ({ dispatchId: r.id, workspaceId: r.workspace_id }));
    });
  }

  async claimDispatch(params: { dispatchId: string; workerId: string; leaseSeconds?: number }): Promise<ClaimedOutboundDispatch | null> {
    return this.withServiceRole(async (client) => {
      const query = await client.query<RpcRow>(
        'SELECT public.claim_outbound_dispatch($1, $2, $3) AS result',
        [params.dispatchId, params.workerId, params.leaseSeconds ?? 60],
      );
      const raw = query.rows[0]?.result;
      if (!raw) return null;
      const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, string>;

      const detailsQuery = await client.query<{
        phone: string;
        session_name: string | null;
        provider: string;
        public_config: Record<string, unknown> | string;
        secret_payload: Record<string, unknown> | string | null;
        message_kind: string;
        message_payload: Record<string, unknown> | string | null;
      }>(
          `SELECT c.phone, cc.public_config->>'session' AS session_name, cc.provider, cc.public_config,
          secrets.secret_payload, od.message_kind, od.message_payload
           FROM public.outbound_dispatches od
           JOIN public.contacts c ON c.id = od.contact_id
           JOIN public.channel_connections cc ON cc.id = od.channel_connection_id
           LEFT JOIN LATERAL (
             SELECT ccs.secret_payload
             FROM public.channel_connection_secrets ccs
             WHERE ccs.channel_connection_id = cc.id
               AND ccs.workspace_id = cc.workspace_id
               AND ccs.secret_kind = 'meta_bearer_token'
             ORDER BY ccs.updated_at DESC
             LIMIT 1
           ) secrets ON TRUE
           WHERE od.id = $1`,
        [params.dispatchId],
      );
      const details = detailsQuery.rows[0];
      const publicConfig = typeof details?.public_config === 'string'
        ? JSON.parse(details.public_config)
        : (details?.public_config || {});
      const secretPayload = typeof details?.secret_payload === 'string'
        ? JSON.parse(details.secret_payload)
        : (details?.secret_payload || {});
      const messagePayload = typeof details?.message_payload === 'string'
        ? JSON.parse(details.message_payload)
        : (details?.message_payload || {});

      return {
        dispatchId: parsed.dispatchId,
        claimToken: parsed.claimToken,
        textContent: parsed.textContent,
        messageKind: (details?.message_kind || 'TEXT') as ClaimedOutboundDispatch['messageKind'],
        messagePayload,
        channelConnectionId: parsed.channelConnectionId,
        contactId: parsed.contactId,
        contactPhone: details?.phone,
        session: details?.session_name ?? undefined,
        provider: details?.provider === 'meta_cloud' ? 'meta_cloud' : 'waha',
        wabaPhoneNumberId: typeof publicConfig.phoneNumberId === 'string' ? publicConfig.phoneNumberId : undefined,
        wabaAccessToken: typeof secretPayload.accessToken === 'string' ? secretPayload.accessToken : undefined,
      };
    });
  }

  async recordProviderAcceptance(params: { dispatchId: string; claimToken: string; workerId: string; providerMessageId: string }): Promise<OutboundDispatchMutationResult | null> {
    return this.withServiceRole(async (client) => {
      const query = await client.query<RpcRow>(
        'SELECT public.record_outbound_provider_acceptance($1, $2, $3, $4) AS result',
        [params.dispatchId, params.claimToken, params.workerId, params.providerMessageId],
      );
      return parseMutation(query.rows[0]?.result);
    });
  }

  async recordProviderFailure(params: { dispatchId: string; claimToken: string; workerId: string; failureCode: string }): Promise<OutboundDispatchMutationResult | null> {
    return this.withServiceRole(async (client) => {
      const query = await client.query<RpcRow>(
        'SELECT public.record_outbound_provider_failure($1, $2, $3, $4) AS result',
        [params.dispatchId, params.claimToken, params.workerId, params.failureCode],
      );
      return parseMutation(query.rows[0]?.result);
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
      // Use sos_sales_runtime which has EXECUTE on current_user_workspace_ids()
      // and inherits from authenticated, so auth.uid() works via request.jwt.claim.sub
      await client.query('SET LOCAL ROLE sos_sales_runtime');
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

  private async withServiceRole<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true)");
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
