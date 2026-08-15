import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  CommercialOutcomeConflictError,
  CommercialOutcomeGateway,
  CommercialOutcomeResultRecord,
  CommercialOutcomeRuleViolationError,
  RecordCommercialOutcomeInput,
} from '../../application/ports/commercial-outcome-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

function classify(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  // Do not reveal whether a journey exists in a workspace the actor cannot see.
  if (/Unauthorized: User does not have operator or owner role|Journey .* not found in workspace/.test(message)) {
    throw new CommercialOutcomeNotFoundError();
  }
  if (/already closed|Outcome already exists|Idempotency conflict/.test(message)) {
    throw new CommercialOutcomeConflictError('A final outcome has already been recorded');
  }
  if (/Invalid outcome result|revenue_minor must be zero or greater|currency must be/.test(message)) {
    throw new CommercialOutcomeRuleViolationError('The commercial outcome is not valid');
  }
  throw error;
}

/** Internal sentinel which keeps absent and cross-workspace resources indistinguishable. */
export class CommercialOutcomeNotFoundError extends Error {}

/**
 * Uses the guarded, transactional SQL RPC. Direct inserts/updates of immutable
 * commercial outcomes are intentionally unavailable to authenticated clients.
 */
export class PostgresCommercialOutcomeGateway implements CommercialOutcomeGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async record(
    actor: AuthenticatedActor,
    input: RecordCommercialOutcomeInput,
  ): Promise<CommercialOutcomeResultRecord | null> {
    try {
      return await this.withActor(actor, async (client) => {
        const result = await client.query<{ outcome_id: string }>(
          `SELECT public.record_commercial_outcome($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7) AS outcome_id`,
          [
            input.workspaceId,
            input.journeyId,
            input.result,
            input.revenueMinor,
            input.currency,
            input.reason ?? null,
            input.idempotencyKey,
          ],
        );
        const outcomeId = result.rows[0]?.outcome_id;
        if (typeof outcomeId !== 'string') throw new Error('Unexpected commercial outcome result');
        return { outcomeId };
      });
    } catch (error) {
      try {
        classify(error);
      } catch (classified) {
        if (classified instanceof CommercialOutcomeNotFoundError) return null;
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
