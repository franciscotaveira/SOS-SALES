import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  CreateFollowUpInput,
  FollowUpResult,
  JourneyOperationNotFoundError,
  JourneyOperationRuleViolationError,
  JourneyOperationsGateway,
  JourneyStageResult,
  SetJourneyStageInput,
} from '../../application/ports/journey-operations-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface RpcRow<T> {
  result: T | string;
}

function parseResult<T>(value: T | string, valid: (result: unknown) => result is T): T {
  const result: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!valid(result)) throw new Error('Unexpected journey operation result');
  return result;
}

function isStageResult(value: unknown): value is JourneyStageResult {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as JourneyStageResult).journeyId === 'string'
    && ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'].includes((value as JourneyStageResult).stage)
    && typeof (value as JourneyStageResult).idempotent === 'boolean';
}

function isFollowUpResult(value: unknown): value is FollowUpResult {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as FollowUpResult).followUpTaskId === 'string'
    && ['PENDING', 'DUE', 'DONE', 'CANCELLED'].includes((value as FollowUpResult).status)
    && typeof (value as FollowUpResult).idempotent === 'boolean';
}

function classify(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  // Do not let a caller use this mutation endpoint to distinguish an absent
  // journey from a journey outside the actor's workspace.
  if (/Unauthorized workspace operation|Open journey not found/.test(message)) {
    throw new JourneyOperationNotFoundError();
  }
  if (/Invalid pipeline stage|Invalid idempotency key|Follow-up due date must be in the future|Invalid follow-up reason/.test(message)) {
    throw new JourneyOperationRuleViolationError('The journey operation is not valid');
  }
  throw error;
}

/**
 * Executes guarded RPCs as the verified Supabase JWT subject. Direct writes to
 * journeys and follow-up tables remain unavailable to authenticated clients.
 */
export class PostgresJourneyOperationsGateway implements JourneyOperationsGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async setStage(actor: AuthenticatedActor, input: SetJourneyStageInput): Promise<JourneyStageResult | null> {
    try {
      return await this.withActor(actor, async (client) => {
        const result = await client.query<RpcRow<JourneyStageResult>>(
          'SELECT public.set_journey_pipeline_stage($1, $2, $3, $4, $5) AS result',
          [input.workspaceId, input.journeyId, input.stage, input.reason ?? null, input.idempotencyKey],
        );
        return parseResult(result.rows[0]?.result, isStageResult);
      });
    } catch (error) {
      try {
        classify(error);
      } catch (classified) {
        if (classified instanceof JourneyOperationNotFoundError) return null;
        throw classified;
      }
      throw error;
    }
  }

  async createFollowUp(actor: AuthenticatedActor, input: CreateFollowUpInput): Promise<FollowUpResult | null> {
    try {
      return await this.withActor(actor, async (client) => {
        const result = await client.query<RpcRow<FollowUpResult>>(
          'SELECT public.create_follow_up_task($1, $2, $3::timestamptz, $4, $5) AS result',
          [input.workspaceId, input.journeyId, input.dueAt, input.reason, input.idempotencyKey],
        );
        return parseResult(result.rows[0]?.result, isFollowUpResult);
      });
    } catch (error) {
      try {
        classify(error);
      } catch (classified) {
        if (classified instanceof JourneyOperationNotFoundError) return null;
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
