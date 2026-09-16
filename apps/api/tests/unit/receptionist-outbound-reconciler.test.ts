import { describe, expect, it } from 'vitest';
import { ReceptionistOutboundReconciler } from '../../src/infrastructure/workers/receptionist-outbound-reconciler.js';

describe('ReceptionistOutboundReconciler', () => {
  it('marks stale reservations UNKNOWN without creating a provider message', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const reconciler = new ReceptionistOutboundReconciler({
      pool: {
        async query(sql: string, params: unknown[]) {
          calls.push({ sql, params });
          return {
            rows: [{
              id: 'reservation-1',
              workspace_id: 'workspace-1',
              journey_id: 'journey-1',
              failure_code: 'STALE_SENDING_RECONCILIATION',
              attempts: 2,
            }],
            rowCount: 1,
          } as never;
        },
      },
      staleAfterSeconds: 180,
      batchSize: 25,
    });

    await expect(reconciler.reconcileOnce()).resolves.toEqual([{
      id: 'reservation-1',
      workspaceId: 'workspace-1',
      journeyId: 'journey-1',
      failureCode: 'STALE_SENDING_RECONCILIATION',
      attempts: 2,
    }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("status = 'SENDING'");
    expect(calls[0].sql).toContain("status = 'UNKNOWN'");
    expect(calls[0].sql).toContain('SKIP LOCKED');
    expect(calls[0].params).toEqual([180, 25]);
  });

  it('does not claim a second batch while one reconciliation is in flight', async () => {
    let release: (() => void) | undefined;
    let calls = 0;
    const reconciler = new ReceptionistOutboundReconciler({
      pool: {
        async query() {
          calls += 1;
          await new Promise<void>((resolve) => { release = resolve; });
          return { rows: [], rowCount: 0 } as never;
        },
      },
    });

    const first = reconciler.reconcileOnce();
    const second = reconciler.reconcileOnce();
    expect(await second).toEqual([]);
    release?.();
    await first;
    expect(calls).toBe(1);
  });
});
