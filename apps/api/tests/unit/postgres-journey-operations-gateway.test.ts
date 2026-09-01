import { describe, expect, it } from 'vitest';
import { PostgresJourneyOperationsGateway } from '../../src/infrastructure/database/postgres-journey-operations-gateway.js';

const actor = { userId: '11111111-1111-1111-1111-111111111111', email: 'operator@example.test' };
const workspaceId = '22222222-2222-2222-2222-222222222222';
const journeyId = '33333333-3333-3333-3333-333333333333';
const idempotencyKey = '44444444-4444-4444-4444-444444444444';

function gatewayWithQueries() {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes('set_journey_pipeline_stage')) {
        return { rows: [{ result: { journeyId, stage: 'QUALIFIED', idempotent: false } }] };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const gateway = new PostgresJourneyOperationsGateway({ connect: async () => client as any });
  return { gateway, queries };
}

describe('PostgresJourneyOperationsGateway', () => {
  it('normalizes UI stage aliases to the persisted database contract', async () => {
    const { gateway, queries } = gatewayWithQueries();

    const result = await gateway.setStage(actor, {
      workspaceId,
      journeyId,
      stage: 'QUALIFICADO',
      idempotencyKey,
    });

    expect(result).toMatchObject({ journeyId, stage: 'QUALIFIED', idempotent: false });
    const rpc = queries.find(({ sql }) => sql.includes('set_journey_pipeline_stage'));
    expect(rpc?.values).toEqual([workspaceId, journeyId, 'QUALIFIED', null, idempotencyKey]);
    expect(queries.some(({ sql }) => sql.startsWith('UPDATE public.commercial_journeys'))).toBe(false);
  });

  it('rejects Ganho as a stage because it must use the audited outcome workflow', async () => {
    const { gateway, queries } = gatewayWithQueries();

    await expect(gateway.setStage(actor, {
      workspaceId,
      journeyId,
      stage: 'GANHO',
      idempotencyKey,
    })).rejects.toThrow('Commercial outcome must be recorded through the outcome workflow');

    expect(queries.some(({ sql }) => sql.includes('set_journey_pipeline_stage'))).toBe(false);
  });
});
