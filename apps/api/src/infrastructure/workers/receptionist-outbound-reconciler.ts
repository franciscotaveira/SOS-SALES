import type { Pool } from 'pg';

export interface ReceptionistOutboundReconcilerOptions {
  pool: Pick<Pool, 'query'>;
  intervalMs?: number;
  staleAfterSeconds?: number;
  batchSize?: number;
}

export interface ReconciledReceptionistOutboundReservation {
  id: string;
  workspaceId: string;
  journeyId: string;
  failureCode: string;
  attempts: number;
}

/**
 * Reconciles provider calls that died after the local reservation was written.
 * A stale SENDING reservation is never retried automatically: the provider may
 * have accepted the original request. UNKNOWN forces human reconciliation.
 */
export class ReceptionistOutboundReconciler {
  private readonly pool: Pick<Pool, 'query'>;
  private readonly intervalMs: number;
  private readonly staleAfterSeconds: number;
  private readonly batchSize: number;
  private isRunning = false;
  private isProcessing = false;
  private lastLoopError: Error | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: ReceptionistOutboundReconcilerOptions) {
    if (!options.pool) throw new Error('ReceptionistOutboundReconciler requires a database pool');
    this.pool = options.pool;
    this.intervalMs = Math.max(1_000, options.intervalMs ?? 30_000);
    this.staleAfterSeconds = Math.max(60, options.staleAfterSeconds ?? 180);
    this.batchSize = Math.max(1, Math.min(500, options.batchSize ?? 100));
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastLoopError = null;
    this.scheduleNextTick(0);
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.isProcessing) await new Promise((resolve) => setTimeout(resolve, 50));
  }

  public isHealthy(): boolean {
    return this.isRunning && this.lastLoopError === null;
  }

  public async reconcileOnce(): Promise<ReconciledReceptionistOutboundReservation[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;
    try {
      const result = await this.pool.query<{
        id: string;
        workspace_id: string;
        journey_id: string;
        failure_code: string;
        attempts: number;
      }>(
        `WITH stale AS (
           SELECT id
           FROM public.receptionist_outbound_reservations
           WHERE status = 'SENDING'
             AND updated_at < NOW() - ($1::int * INTERVAL '1 second')
           ORDER BY updated_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         UPDATE public.receptionist_outbound_reservations reservation
         SET status = 'UNKNOWN',
             failure_code = 'STALE_SENDING_RECONCILIATION',
             attempts = reservation.attempts + 1,
             updated_at = NOW()
         FROM stale
         WHERE reservation.id = stale.id
         RETURNING reservation.id,
                   reservation.workspace_id,
                   reservation.journey_id,
                   reservation.failure_code,
                   reservation.attempts`,
        [this.staleAfterSeconds, this.batchSize],
      );
      this.lastLoopError = null;
      const reconciled = result.rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        journeyId: row.journey_id,
        failureCode: row.failure_code,
        attempts: row.attempts,
      }));
      if (reconciled.length > 0) {
        console.warn('[ReceptionistOutboundReconciler] stale reservations marked UNKNOWN', {
          count: reconciled.length,
          staleAfterSeconds: this.staleAfterSeconds,
          reason: 'STALE_SENDING_RECONCILIATION',
        });
      }
      return reconciled;
    } finally {
      this.isProcessing = false;
    }
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;
      try {
        await this.reconcileOnce();
      } catch (error) {
        this.lastLoopError = error instanceof Error ? error : new Error(String(error));
        console.error('[ReceptionistOutboundReconciler] reconciliation loop failed', this.lastLoopError);
      } finally {
        if (this.isRunning) this.scheduleNextTick(this.intervalMs);
      }
    }, delayMs);
  }
}
