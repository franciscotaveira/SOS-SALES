import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  KnownFactIdempotencyConflictError,
  KnownFactOperationsGateway,
  KnownFactRuleViolationError,
  RecordedKnownFact,
  RecordKnownFactInput,
} from '../../application/ports/known-fact-operations-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface RpcRow { result: unknown; }

function parseResult(value: unknown): RecordedKnownFact {
  const result = typeof value === 'string' ? JSON.parse(value) : value;
  if (!result || typeof result !== 'object') throw new Error('Unexpected known fact result');
  const candidate = result as Record<string, unknown>;
  if (
    typeof candidate.factId !== 'string'
    || typeof candidate.journeyId !== 'string'
    || candidate.source !== 'human_operator'
    || typeof candidate.idempotent !== 'boolean'
    || (candidate.supersedesFactId !== null && candidate.supersedesFactId !== undefined && typeof candidate.supersedesFactId !== 'string')
  ) {
    throw new Error('Unexpected known fact result');
  }
  return {
    factId: candidate.factId,
    journeyId: candidate.journeyId,
    source: 'human_operator',
    idempotent: candidate.idempotent,
    ...(typeof candidate.supersedesFactId === 'string' ? { supersedesFactId: candidate.supersedesFactId } : {}),
  };
}

function classify(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  // Keep a journey outside this user's tenant indistinguishable from a
  // missing journey. The RPC is still the authoritative tenant boundary.
  if (/Unauthorized workspace operation|Commercial journey not found/.test(message)) {
    throw new KnownFactNotFoundError();
  }
  if (/Idempotency conflict/.test(message)) {
    throw new KnownFactIdempotencyConflictError('The idempotency key was reused with a different fact');
  }
  if (/Invalid fact key|Invalid fact value|Invalid fact confidence|Invalid fact confirmation|Invalid idempotency key|Evidence message not found|Known fact not found|Known fact already superseded/.test(message)) {
    throw new KnownFactRuleViolationError('The known fact request is not valid');
  }
  throw error;
}

/** Internal sentinel that maps absent and cross-workspace journeys to 404. */
export class KnownFactNotFoundError extends Error {}

/** Executes the append-only RPC under the verified Supabase JWT subject. */
export class PostgresKnownFactOperationsGateway implements KnownFactOperationsGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async record(actor: AuthenticatedActor, input: RecordKnownFactInput): Promise<RecordedKnownFact | null> {
    try {
      return await this.withActor(actor, async (client) => {
        const query = await client.query<RpcRow>(
          'SELECT public.record_known_fact($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9) AS result',
          [
            input.workspaceId,
            input.journeyId,
            input.key,
            JSON.stringify(input.value),
            input.evidenceMessageId ?? null,
            input.confidence,
            input.confirmedByCustomer,
            input.supersedesFactId ?? null,
            input.idempotencyKey,
          ],
        );
        return parseResult(query.rows[0]?.result);
      });
    } catch (error) {
      try {
        classify(error);
      } catch (classified) {
        if (classified instanceof KnownFactNotFoundError) return null;
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
}
