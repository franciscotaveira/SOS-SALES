import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  CapiDispatchGateway,
  CapiPurchaseEventPayload,
} from '../../application/ports/capi-dispatch-gateway.js';
import { OutboxProcessingGateway } from '../../application/ports/outbox-processing-gateway.js';
import { dbPool } from '../database/pool.js';

export interface CapiDispatchWorkerOptions {
  outboxGateway: OutboxProcessingGateway;
  capiGateway: CapiDispatchGateway;
  pool?: Pick<Pool, 'connect'>;
  pollingIntervalMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  workerId?: string;
}

export class CapiDispatchWorker {
  private readonly outboxGateway: OutboxProcessingGateway;
  private readonly capiGateway: CapiDispatchGateway;
  private readonly pool: Pick<Pool, 'connect'>;
  private readonly pollingIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly maxAttempts: number;
  private readonly workerId: string;

  private isRunning = false;
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: CapiDispatchWorkerOptions) {
    this.outboxGateway = options.outboxGateway;
    this.capiGateway = options.capiGateway;
    this.pool = options.pool || dbPool;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 10;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.workerId = options.workerId ?? `capi-worker-${randomUUID()}`;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextTick(0);
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  public async processSingleBatch(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const events = await this.outboxGateway.claimBatch({
        workerId: this.workerId,
        eventNames: ['commercial.outcome_recorded', 'commercial_outcome.capi_queued'],
        batchSize: this.batchSize,
        leaseSeconds: this.leaseSeconds,
      });

      if (!events || events.length === 0) {
        return 0;
      }

      let processed = 0;

      for (const event of events) {
        const payload = event.payload || {};
        const outcomeId = (payload.outcomeId as string) || event.aggregateId;
        const result = (payload.result as string) || '';
        const revenueMinor = typeof payload.revenueMinor === 'number' ? payload.revenueMinor : 0;
        const journeyId = (payload.journeyId as string) || '';

        // Non-WON outcomes or outcomes without revenue do not dispatch Purchase CAPI events
        if (result !== 'WON' || revenueMinor <= 0) {
          await this.outboxGateway.completeEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
          });
          processed++;
          continue;
        }

        // Fetch contact phone/email and workspace pixel_id
        const context = await this.fetchOutcomeDispatchContext(event.workspaceId, journeyId);

        if (!context?.pixelId) {
          // Pixel not configured for this workspace, mark as completed
          await this.outboxGateway.completeEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
          });
          processed++;
          continue;
        }

        const purchaseEvent: CapiPurchaseEventPayload = {
          outcomeId,
          workspaceId: event.workspaceId,
          journeyId,
          revenueMinor,
          currency: 'BRL',
          pixelId: context.pixelId,
          phone: context.phone,
          email: context.email,
        };

        const dispatchResult = await this.capiGateway.sendPurchaseEvent(purchaseEvent);

        if (dispatchResult.success) {
          await this.outboxGateway.completeEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
          });
        } else if (dispatchResult.kind === 'FATAL') {
          // Fatal error (invalid payload or forbidden) -> complete outbox to prevent infinite loop
          await this.outboxGateway.failEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
            errorMessage: `${dispatchResult.errorCode}: ${dispatchResult.errorMessage}`,
            maxAttempts: 1, // Move to DLQ immediately
          });
        } else {
          // Retryable error -> fail and reattempt
          await this.outboxGateway.failEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
            errorMessage: `${dispatchResult.errorCode}: ${dispatchResult.errorMessage}`,
            maxAttempts: this.maxAttempts,
          });
        }

        processed++;
      }

      return processed;
    } finally {
      this.isProcessing = false;
    }
  }

  private async fetchOutcomeDispatchContext(
    workspaceId: string,
    journeyId: string,
  ): Promise<{ pixelId?: string; phone?: string; email?: string } | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');

      const result = await client.query<{
        pixel_id: string | null;
        phone: string | null;
        email: string | null;
      }>(
        `SELECT
           (cc.config->>'meta_capi_pixel_id') as pixel_id,
           c.phone,
           c.email
         FROM public.commercial_journeys j
         JOIN public.contacts c ON c.id = j.contact_id
         LEFT JOIN public.channel_connections cc ON cc.id = j.channel_connection_id
         WHERE j.id = $1 AND j.workspace_id = $2
         LIMIT 1`,
        [journeyId, workspaceId],
      );

      await client.query('COMMIT');
      const row = result.rows[0];
      if (!row) return null;

      return {
        pixelId: row.pixel_id || process.env.META_CAPI_PIXEL_ID || undefined,
        phone: row.phone || undefined,
        email: row.email || undefined,
      };
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return null;
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;
      await this.processSingleBatch().catch(() => undefined);
      this.scheduleNextTick(this.pollingIntervalMs);
    }, delayMs);
  }
}
