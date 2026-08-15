import type { Pool, PoolClient } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  HandoffOperationInput,
  HandoffOperationResult,
  HandoffOperationsGateway,
  HandoffRuleViolationError,
  HandoffTransitionConflictError,
} from '../../application/ports/handoff-operations-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface RpcRow {
  result: HandoffOperationResult | string;
}

function normalizeResult(value: HandoffOperationResult | string): HandoffOperationResult {
  const result = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    !result ||
    typeof result.handoffCaseId !== 'string' ||
    !['ACCEPTED', 'RESOLVED', 'RETURNED_TO_AI'].includes(result.status) ||
    typeof result.idempotent !== 'boolean'
  ) {
    throw new Error('Unexpected handoff operation result');
  }
  return result;
}

function classifyDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  // Missing, cross-workspace, inactive-workspace and unauthorized actor cases
  // intentionally collapse to null so HTTP can return the same 404 surface.
  if (/Handoff case not found|Unauthorized handoff operation/.test(message)) {
    throw new HandoffNotFoundError();
  }
  if (/Handoff transition conflict/.test(message)) {
    throw new HandoffTransitionConflictError('Handoff transition is no longer valid');
  }
  if (/Only the assigned operator or owner can/.test(message)) {
    throw new HandoffRuleViolationError('The handoff cannot be changed by this operator');
  }
  if (/A return reason is required|Invalid idempotency key/.test(message)) {
    throw new HandoffRuleViolationError('The handoff request is invalid');
  }
  throw error;
}

/** Internal sentinel used to preserve the absent/cross-tenant 404 contract. */
export class HandoffNotFoundError extends Error {}

export class PostgresHandoffOperationsGateway implements HandoffOperationsGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async execute(actor: AuthenticatedActor, input: HandoffOperationInput): Promise<HandoffOperationResult | null> {
    try {
      return await this.withActor(actor, async (client) => {
        let result;
        switch (input.operation) {
          case 'accept':
            result = await client.query<RpcRow>(
              'SELECT public.accept_handoff($1, $2, $3) AS result',
              [input.workspaceId, input.handoffCaseId, input.idempotencyKey],
            );
            break;
          case 'resolve':
            result = await client.query<RpcRow>(
              'SELECT public.resolve_handoff($1, $2, $3) AS result',
              [input.workspaceId, input.handoffCaseId, input.idempotencyKey],
            );
            break;
          case 'return_to_ai':
            result = await client.query<RpcRow>(
              'SELECT public.return_handoff_to_ai($1, $2, $3, $4) AS result',
              [input.workspaceId, input.handoffCaseId, input.reason, input.idempotencyKey],
            );
            break;
        }
        return normalizeResult(result.rows[0]?.result);
      });
    } catch (error) {
      try {
        classifyDatabaseError(error);
      } catch (classified) {
        if (classified instanceof HandoffNotFoundError) return null;
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
