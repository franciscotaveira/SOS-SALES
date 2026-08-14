import { ChannelWebhookAdapter } from '../../application/ports/channel-webhook-adapter.js';
import { OutboxProcessingGateway } from '../../application/ports/outbox-processing-gateway.js';
import { LidIdentityResolver } from '../../application/ports/lid-identity-resolver.js';
import { randomUUID } from 'node:crypto';

export interface WahaInboundWorkerOptions {
  adapter: ChannelWebhookAdapter;
  outboxGateway: OutboxProcessingGateway;
  lidIdentityResolver?: LidIdentityResolver;
  pollingIntervalMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  workerId?: string;
}

/**
 * TX COMMERCIAL CORE — WAHA INBOUND WORKER
 *
 * Polls the outbox for InboundChannelEvent rows claimed by this worker ID,
 * normalizes them via the injected ChannelWebhookAdapter and records the
 * result back through the injected OutboxProcessingGateway.
 *
 * Has NO direct dependency on pg Pool, SET ROLE, or any database connection.
 * All data access is delegated to the injected OutboxProcessingGateway.
 */
export class WahaInboundWorker {
  private readonly adapter: ChannelWebhookAdapter;
  private readonly outboxGateway: OutboxProcessingGateway;
  private readonly lidIdentityResolver?: LidIdentityResolver;
  private readonly pollingIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly workerId: string;

  private isRunning = false;
  private isProcessing = false;
  private lastPollingError: Error | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: WahaInboundWorkerOptions) {
    if (!options.adapter) {
      throw new Error('WahaInboundWorker requires a ChannelWebhookAdapter instance');
    }
    if (!options.outboxGateway) {
      throw new Error('WahaInboundWorker requires an OutboxProcessingGateway instance');
    }
    this.adapter = options.adapter;
    this.outboxGateway = options.outboxGateway;
    this.lidIdentityResolver = options.lidIdentityResolver;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 10;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.workerId = options.workerId ?? `waha-inbound-worker-${randomUUID()}`;
  }

  /**
   * Starts background polling for outbox events (idempotent).
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.lastPollingError = null;
    this.scheduleNextTick(0);
  }

  /** True only when polling is active and no unrecovered polling failure exists. */
  public isHealthy(): boolean {
    return this.isRunning && this.lastPollingError === null;
  }

  /**
   * Stops background polling cleanly, waiting for any in-flight batch to finish.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Wait until in-flight batch execution finishes before returning
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Processes a single batch of pending outbox events.
   * All data access goes through the injected OutboxProcessingGateway.
   */
  public async processSingleBatch(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;

    try {
      const events = await this.outboxGateway.claimBatch({
        workerId: this.workerId,
        eventNames: ['inbound.channel_event_received'],
        batchSize: this.batchSize,
        leaseSeconds: this.leaseSeconds,
      });

      let processedCount = 0;

      for (const event of events) {
        try {
          await this.processEvent(event);
          processedCount++;
        } catch (err) {
          const errorMessage = (err as Error).message || 'Unknown processing error';
          // Record failure — let outbox retry or DLQ policy handle it
          try {
            await this.outboxGateway.failEvent({
              eventId: event.id,
              claimToken: event.claimToken,
              workerId: this.workerId,
              errorMessage,
              maxAttempts: 5,
            });
          } catch {
            // failEvent itself failed — outbox lease will expire naturally
          }
        }
      }

      return processedCount;
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(event: {
    id: string;
    workspaceId: string;
    aggregateType: string;
    aggregateId: string;
    claimToken: string;
  }): Promise<void> {
    // 1. Enforce strict aggregate type lineage
    if (event.aggregateType !== 'InboundChannelEvent') {
      throw new Error(
        `Invalid aggregate_type: expected InboundChannelEvent, found ${event.aggregateType}`
      );
    }

    const inboundEventId = event.aggregateId;
    const workspaceId = event.workspaceId;

    // 2. Fetch raw envelope strictly by aggregate_id and workspace_id
    const envelope = await this.outboxGateway.fetchInboundChannelEvent({
      inboundEventId,
      workspaceId,
      provider: 'waha',
    });

    if (!envelope) {
      throw new Error(
        `Inbound channel event ${inboundEventId} not found for workspace ${workspaceId} ` +
        `and provider waha (integrity violation)`
      );
    }

    // 3. Parse inbound message through pure adapter
    let parseResult = this.adapter.parseInboundMessage(envelope.rawPayload);

    if (parseResult.kind === 'UNRESOLVED_IDENTITY') {
      const session = typeof envelope.rawPayload.session === 'string'
        ? envelope.rawPayload.session.trim()
        : '';
      const phoneJid = session && this.lidIdentityResolver
        ? await this.lidIdentityResolver.resolvePhone({ session, lid: parseResult.lid })
        : null;

      if (!phoneJid) {
        await this.outboxGateway.completeEvent({
          eventId: event.id,
          claimToken: event.claimToken,
          workerId: this.workerId,
        });
        return;
      }

      const originalData = (envelope.rawPayload.payload as Record<string, unknown>) || envelope.rawPayload;
      parseResult = this.adapter.parseInboundMessage({
        ...envelope.rawPayload,
        payload: { ...originalData, from: phoneJid },
      });
    }

    if (parseResult.kind === 'IGNORED') {
      // Non-commercial event — complete outbox without normalization
      await this.outboxGateway.completeEvent({
        eventId: event.id,
        claimToken: event.claimToken,
        workerId: this.workerId,
      });
      return;
    }

    if (parseResult.kind === 'INVALID') {
      throw new Error(`Invalid inbound message: ${parseResult.error}`);
    }

    if (parseResult.kind === 'UNRESOLVED_IDENTITY') {
      throw new Error('WAHA LID resolver returned a non-phone identity');
    }

    // 4. Normalize message via gateway (handles its own transaction)
    const message = parseResult.message;
    await this.outboxGateway.normalizeWahaInboundMessage({
      inboundEventId: envelope.id,
      contactPhone: message.contactPhone,
      whatsappId: message.whatsappId ?? null,
      contactName: message.contactName ?? null,
      providerMessageId: message.providerMessageId,
      textContent: message.textContent ?? null,
      mediaPayload: message.mediaPayload ? JSON.stringify(message.mediaPayload) : null,
      sentAt: message.sentAt,
    });

    // 5. Complete outbox event using the fencing token
    await this.outboxGateway.completeEvent({
      eventId: event.id,
      claimToken: event.claimToken,
      workerId: this.workerId,
    });
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.processSingleBatch();
        this.lastPollingError = null;
      } catch (err) {
        this.lastPollingError = err instanceof Error ? err : new Error('Unknown worker polling error');
        // Log worker error without crashing the polling loop
        if (process.env.NODE_ENV !== 'production') {
          console.error('[WahaInboundWorker] Polling tick error:', err);
        }
      } finally {
        if (this.isRunning) {
          this.scheduleNextTick(this.pollingIntervalMs);
        }
      }
    }, delayMs);
  }
}
