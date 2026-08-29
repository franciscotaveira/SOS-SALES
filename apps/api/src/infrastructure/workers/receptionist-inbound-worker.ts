import { OutboxProcessingGateway } from '../../application/ports/outbox-processing-gateway.js';
import { ReceptionistInput } from '../../application/agents/receptionist-agent.js';
import { randomUUID } from 'node:crypto';

/** Minimal contract the worker needs from the AI Receptionist agent. */
export interface ReceptionistHandler {
  handleInbound(input: ReceptionistInput): Promise<unknown>;
}

export interface ReceptionistInboundWorkerOptions {
  receptionistAgent: ReceptionistHandler;
  outboxGateway: OutboxProcessingGateway;
  pollingIntervalMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  workerId?: string;
}

/**
 * TX COMMERCIAL CORE — RECEPTIONIST INBOUND WORKER (QA-P0 §4.1)
 *
 * Polls the outbox for 'receptionist.inbound_received' events enqueued by the
 * WABA webhook and drives the AI Receptionist agent for each one. Replaces the
 * non-recoverable setImmediate() fire-and-forget trigger: if the process dies
 * mid-flight, the lease expires and another worker re-claims the event.
 *
 * The full ReceptionistInput is carried in the outbox payload, so this worker
 * needs no additional lookups and no new gateway/port method — it reuses the
 * existing claimBatch/completeEvent/failEvent contract.
 *
 * Has NO direct dependency on pg Pool, SET ROLE, or any database connection.
 * All data access is delegated to the injected OutboxProcessingGateway.
 */
export class ReceptionistInboundWorker {
  private readonly receptionistAgent: ReceptionistHandler;
  private readonly outboxGateway: OutboxProcessingGateway;
  private readonly pollingIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly workerId: string;

  private isRunning = false;
  private isProcessing = false;
  private lastPollingError: Error | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: ReceptionistInboundWorkerOptions) {
    if (!options.receptionistAgent) {
      throw new Error('ReceptionistInboundWorker requires a ReceptionistHandler instance');
    }
    if (!options.outboxGateway) {
      throw new Error('ReceptionistInboundWorker requires an OutboxProcessingGateway instance');
    }
    this.receptionistAgent = options.receptionistAgent;
    this.outboxGateway = options.outboxGateway;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 10;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.workerId = options.workerId ?? `receptionist-inbound-worker-${randomUUID()}`;
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
        eventNames: ['receptionist.inbound_received'],
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
    aggregateType: string;
    claimToken: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    // 1. Enforce strict aggregate type lineage
    if (event.aggregateType !== 'ConversationMessage') {
      throw new Error(
        `Invalid aggregate_type: expected ConversationMessage, found ${event.aggregateType}`
      );
    }

    // 2. Drive the AI Receptionist with the self-contained payload
    const input = this.toReceptionistInput(event.payload);
    await this.receptionistAgent.handleInbound(input);

    // 3. Complete outbox event using the fencing token
    await this.outboxGateway.completeEvent({
      eventId: event.id,
      claimToken: event.claimToken,
      workerId: this.workerId,
    });
  }

  /** Validates the outbox payload into a ReceptionistInput (fail fast on drift). */
  private toReceptionistInput(payload: Record<string, unknown>): ReceptionistInput {
    const asString = (key: string): string => {
      const value = payload[key];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Receptionist outbox payload missing required string field: ${key}`);
      }
      return value;
    };

    return {
      workspaceId: asString('workspaceId'),
      journeyId: asString('journeyId'),
      contactId: asString('contactId'),
      fromPhone: asString('fromPhone'),
      pushName: typeof payload.pushName === 'string' ? payload.pushName : '',
      textContent: asString('textContent'),
      messageType: asString('messageType'),
      channelConnectionId: asString('channelConnectionId'),
      phoneNumberId: asString('phoneNumberId'),
    };
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
          console.error('[ReceptionistInboundWorker] Polling tick error:', err);
        }
      } finally {
        if (this.isRunning) {
          this.scheduleNextTick(this.pollingIntervalMs);
        }
      }
    }, delayMs);
  }
}
