import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  CapiDispatchGateway,
  CapiPurchaseEventPayload,
} from '../../application/ports/capi-dispatch-gateway.js';
import { OutboxProcessingGateway } from '../../application/ports/outbox-processing-gateway.js';
import { resolveCapiConfig } from '../channels/meta/capi-config.js';
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
    this.batchSize = options.batchSize ?? 1;
    this.leaseSeconds = options.leaseSeconds ?? 120;
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
        const context = await this.fetchOutcomeDispatchContext(event.workspaceId, journeyId, outcomeId);

        if (context?.status === 'DISPATCHED') {
          await this.outboxGateway.completeEvent({eventId:event.id, claimToken:event.claimToken, workerId:this.workerId});
          processed++; continue;
        }
        if (context && !context.enabled) {
          await this.recordStatus(outcomeId, event.workspaceId, 'NOT_APPLICABLE', 'CAPI_DISABLED');
          await this.outboxGateway.completeEvent({eventId:event.id, claimToken:event.claimToken, workerId:this.workerId});
          processed++; continue;
        }
        if (!context?.pixelId || !context.accessToken) {
          await this.recordStatus(outcomeId, event.workspaceId, 'FAILED', 'MISSING_CAPI_CONFIGURATION');
          await this.outboxGateway.failEvent({eventId:event.id, claimToken:event.claimToken, workerId:this.workerId, errorMessage:'MISSING_CAPI_CONFIGURATION', maxAttempts:this.maxAttempts});
          processed++; continue;
        }
        await this.recordStatus(outcomeId, event.workspaceId, 'QUEUED');
        const purchaseEvent: CapiPurchaseEventPayload = {
          outcomeId,
          workspaceId: event.workspaceId,
          journeyId,
          revenueMinor,
          currency: 'BRL',
          pixelId: context.pixelId,
          phone: context.phone,
          email: context.email,
          occurredAt: context.occurredAt,
          actionSource: context.actionSource,
          ctwaClid: context.ctwaClid,
          whatsappBusinessAccountId: context.wabaId,
        };

        const dispatchResult = await this.capiGateway.sendPurchaseEvent(purchaseEvent, context.accessToken);

        if (dispatchResult.success) {
          await this.recordStatus(outcomeId, event.workspaceId, 'DISPATCHED', undefined, dispatchResult.fbtraceId);
          await this.outboxGateway.completeEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
          });
        } else if (dispatchResult.kind === 'FATAL') {
          await this.recordStatus(outcomeId, event.workspaceId, 'FAILED', dispatchResult.errorCode);
          // Fatal error (invalid payload or forbidden) -> complete outbox to prevent infinite loop
          await this.outboxGateway.failEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
            errorMessage: dispatchResult.errorCode,
            maxAttempts: 1, // Move to DLQ immediately
          });
        } else {
          await this.recordStatus(outcomeId, event.workspaceId, 'FAILED', dispatchResult.errorCode);
          // Retryable error -> fail and reattempt
          await this.outboxGateway.failEvent({
            eventId: event.id,
            claimToken: event.claimToken,
            workerId: this.workerId,
            errorMessage: dispatchResult.errorCode,
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

  private async recordStatus(outcomeId: string, workspaceId: string, status: string, errorCode?: string, trace?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`INSERT INTO public.capi_deliveries(outcome_id,workspace_id,status,error_code,fbtrace_id)
        SELECT id,workspace_id,$3,$4,$5 FROM public.commercial_outcomes WHERE id=$1 AND workspace_id=$2
        ON CONFLICT(outcome_id) DO UPDATE SET status=EXCLUDED.status,error_code=EXCLUDED.error_code,
        fbtrace_id=EXCLUDED.fbtrace_id,updated_at=now()`, [outcomeId,workspaceId,status,errorCode||null,trace||null]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(()=>undefined); throw e; }
    finally { await client.query('RESET ROLE').catch(()=>undefined); client.release(); }
  }

  private async fetchOutcomeDispatchContext(workspaceId: string, journeyId: string, outcomeId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      const result = await client.query(`SELECT cc.public_config, cs.secret_payload, c.phone, c.email,
        o.occurred_at, COALESCE(d.status,o.capi_status) AS status, ac.click_ids
        FROM public.commercial_outcomes o
        JOIN public.commercial_journeys j ON j.id=o.journey_id AND j.workspace_id=o.workspace_id
        JOIN public.contacts c ON c.id=j.contact_id AND c.workspace_id=j.workspace_id
        LEFT JOIN public.channel_connections cc ON cc.id=j.channel_connection_id AND cc.workspace_id=j.workspace_id
        LEFT JOIN public.capi_deliveries d ON d.outcome_id=o.id AND d.workspace_id=o.workspace_id
        LEFT JOIN LATERAL (SELECT secret_payload FROM public.channel_connection_secrets
          WHERE channel_connection_id=cc.id AND workspace_id=j.workspace_id AND secret_kind='meta_capi_token' LIMIT 1) cs ON true
        LEFT JOIN LATERAL (SELECT click_ids FROM public.acquisition_contexts
          WHERE journey_id=j.id AND workspace_id=j.workspace_id ORDER BY occurred_at ASC LIMIT 1) ac ON true
        WHERE j.id=$1 AND j.workspace_id=$2 AND o.id=$3 LIMIT 1`, [journeyId,workspaceId,outcomeId]);
      await client.query('COMMIT');
      const row=result.rows[0]; if (!row) return null;
      const config=row.public_config||{};
      const resolved=resolveCapiConfig(config,row.secret_payload||{});
      const source=config.metaCapiActionSource;
      return {pixelId:resolved.datasetId,accessToken:resolved.accessToken,enabled:resolved.enabled,
        phone:row.phone||undefined,email:row.email||undefined,occurredAt:row.occurred_at,
        status:row.status,ctwaClid:row.click_ids?.ctwaClid,wabaId:config.wabaId,
        actionSource: (source==='business_messaging'||source==='physical_store'?source:'system_generated') as CapiPurchaseEventPayload['actionSource']};
    } catch (e) { await client.query('ROLLBACK').catch(()=>undefined); throw e; }
    finally { await client.query('RESET ROLE').catch(()=>undefined);client.release(); }
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
