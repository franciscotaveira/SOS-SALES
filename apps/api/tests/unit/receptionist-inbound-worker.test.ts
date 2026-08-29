import { describe, it, expect, beforeEach } from 'vitest';
import type {
  OutboxProcessingGateway,
  OutboxEvent,
  InboundChannelEventRow,
} from '../../src/application/ports/outbox-processing-gateway.js';
import type { ReceptionistInput } from '../../src/application/agents/receptionist-agent.js';
import {
  ReceptionistInboundWorker,
  type ReceptionistHandler,
} from '../../src/infrastructure/workers/receptionist-inbound-worker.js';

// Unit proof for QA-P0 §4.1 ReceptionistInboundWorker. The worker depends only on
// the injected OutboxProcessingGateway and ReceptionistHandler — no pg Pool, no
// SET ROLE, no DB connection — so it is exercised here with in-memory fakes that
// record every call and let each test assert lease/fencing bookkeeping precisely.

interface CompleteCall {
  eventId: string;
  claimToken: string;
  workerId: string;
}
interface FailCall extends CompleteCall {
  errorMessage: string;
  maxAttempts: number;
}

// Full implementation of the OutboxProcessingGateway port (all five methods). The
// worker only reads claimBatch/completeEvent/failEvent; the two channel-normalize
// methods exist to satisfy the interface and throw if ever touched by mistake.
class FakeOutboxGateway implements OutboxProcessingGateway {
  public claimBatchCalls: Array<{
    workerId: string;
    eventNames: string[];
    batchSize: number;
    leaseSeconds: number;
  }> = [];
  public completeCalls: CompleteCall[] = [];
  public failCalls: FailCall[] = [];
  public completeShouldThrow = false;
  public failShouldThrow = false;

  private readonly batches: OutboxEvent[][];

  constructor(batches: OutboxEvent[][] = []) {
    this.batches = [...batches];
  }

  async claimBatch(params: {
    workerId: string;
    eventNames: string[];
    batchSize: number;
    leaseSeconds: number;
  }): Promise<OutboxEvent[]> {
    this.claimBatchCalls.push(params);
    return this.batches.shift() ?? [];
  }

  async completeEvent(params: CompleteCall): Promise<void> {
    this.completeCalls.push(params);
    if (this.completeShouldThrow) {
      throw new Error('completeEvent failed');
    }
  }

  async failEvent(params: FailCall): Promise<void> {
    this.failCalls.push(params);
    if (this.failShouldThrow) {
      throw new Error('failEvent failed');
    }
  }

  async fetchInboundChannelEvent(): Promise<InboundChannelEventRow | null> {
    throw new Error('fetchInboundChannelEvent must not be called by this worker');
  }

  async normalizeWahaInboundMessage(): Promise<void> {
    throw new Error('normalizeWahaInboundMessage must not be called by this worker');
  }
}

class FakeReceptionist implements ReceptionistHandler {
  public inputs: ReceptionistInput[] = [];
  public failOnContactId: string | null = null;

  async handleInbound(input: ReceptionistInput): Promise<unknown> {
    this.inputs.push(input);
    if (this.failOnContactId && input.contactId === this.failOnContactId) {
      throw new Error('agent boom');
    }
    return { handled: true };
  }
}

let seq = 0;
function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    workspaceId: 'ws-1',
    eventName: 'receptionist.inbound_received',
    aggregateType: 'ConversationMessage',
    aggregateId: `msg-${seq}`,
    payload: {
      workspaceId: 'ws-1',
      journeyId: 'jrn-1',
      contactId: `contact-${seq}`,
      fromPhone: '+5511999999999',
      pushName: 'Alice',
      textContent: 'olá',
      messageType: 'text',
      channelConnectionId: 'chan-1',
      phoneNumberId: 'pn-1',
    },
    idempotencyKey: `outbox_receptionist_msg-${seq}`,
    claimToken: `claim-${seq}`,
    attempts: 0,
    ...overrides,
  };
}

function makeWorker(gateway: OutboxProcessingGateway, agent: ReceptionistHandler) {
  return new ReceptionistInboundWorker({
    receptionistAgent: agent,
    outboxGateway: gateway,
    workerId: 'test-worker',
  });
}

describe('ReceptionistInboundWorker — constructor guards', () => {
  it('throws when the receptionist agent is missing', () => {
    const gateway = new FakeOutboxGateway();
    expect(
      () =>
        new ReceptionistInboundWorker({
          receptionistAgent: undefined as unknown as ReceptionistHandler,
          outboxGateway: gateway,
        }),
    ).toThrow('ReceptionistInboundWorker requires a ReceptionistHandler instance');
  });

  it('throws when the outbox gateway is missing', () => {
    const agent = new FakeReceptionist();
    expect(
      () =>
        new ReceptionistInboundWorker({
          receptionistAgent: agent,
          outboxGateway: undefined as unknown as OutboxProcessingGateway,
        }),
    ).toThrow('ReceptionistInboundWorker requires an OutboxProcessingGateway instance');
  });
});

describe('ReceptionistInboundWorker — processSingleBatch', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('claims with the fixed event name, batch size and lease', async () => {
    const gateway = new FakeOutboxGateway([[]]);
    const worker = makeWorker(gateway, new FakeReceptionist());

    await worker.processSingleBatch();

    expect(gateway.claimBatchCalls).toHaveLength(1);
    expect(gateway.claimBatchCalls[0]).toEqual({
      workerId: 'test-worker',
      eventNames: ['receptionist.inbound_received'],
      batchSize: 10,
      leaseSeconds: 60,
    });
  });

  it('returns 0 and drives no agent when the batch is empty', async () => {
    const gateway = new FakeOutboxGateway([[]]);
    const agent = new FakeReceptionist();
    const worker = makeWorker(gateway, agent);

    expect(await worker.processSingleBatch()).toBe(0);
    expect(agent.inputs).toHaveLength(0);
    expect(gateway.completeCalls).toHaveLength(0);
  });

  it('drives the agent and completes the event on the happy path', async () => {
    const event = makeEvent();
    const gateway = new FakeOutboxGateway([[event]]);
    const agent = new FakeReceptionist();
    const worker = makeWorker(gateway, agent);

    expect(await worker.processSingleBatch()).toBe(1);

    expect(agent.inputs).toHaveLength(1);
    expect(agent.inputs[0].contactId).toBe('contact-1');
    expect(gateway.completeCalls).toEqual([
      { eventId: event.id, claimToken: event.claimToken, workerId: 'test-worker' },
    ]);
    expect(gateway.failCalls).toHaveLength(0);
  });

  it('maps every required payload field into the ReceptionistInput', async () => {
    const event = makeEvent();
    const gateway = new FakeOutboxGateway([[event]]);
    const agent = new FakeReceptionist();

    await makeWorker(gateway, agent).processSingleBatch();

    expect(agent.inputs[0]).toEqual({
      workspaceId: 'ws-1',
      journeyId: 'jrn-1',
      contactId: 'contact-1',
      fromPhone: '+5511999999999',
      pushName: 'Alice',
      textContent: 'olá',
      messageType: 'text',
      channelConnectionId: 'chan-1',
      phoneNumberId: 'pn-1',
    });
  });

  it('defaults pushName to empty string when absent', async () => {
    const event = makeEvent();
    delete (event.payload as Record<string, unknown>).pushName;
    const gateway = new FakeOutboxGateway([[event]]);
    const agent = new FakeReceptionist();

    await makeWorker(gateway, agent).processSingleBatch();

    expect(agent.inputs[0].pushName).toBe('');
  });

  it('fails (not completes) an event with the wrong aggregate_type', async () => {
    const event = makeEvent({ aggregateType: 'SomethingElse' });
    const gateway = new FakeOutboxGateway([[event]]);
    const agent = new FakeReceptionist();
    const worker = makeWorker(gateway, agent);

    expect(await worker.processSingleBatch()).toBe(0);

    expect(agent.inputs).toHaveLength(0);
    expect(gateway.completeCalls).toHaveLength(0);
    expect(gateway.failCalls).toHaveLength(1);
    expect(gateway.failCalls[0]).toMatchObject({
      eventId: event.id,
      claimToken: event.claimToken,
      workerId: 'test-worker',
      maxAttempts: 5,
    });
    expect(gateway.failCalls[0].errorMessage).toContain('Invalid aggregate_type');
  });

  it('fails an event whose payload is missing a required string field', async () => {
    const event = makeEvent();
    delete (event.payload as Record<string, unknown>).fromPhone;
    const gateway = new FakeOutboxGateway([[event]]);
    const agent = new FakeReceptionist();
    const worker = makeWorker(gateway, agent);

    expect(await worker.processSingleBatch()).toBe(0);

    expect(gateway.completeCalls).toHaveLength(0);
    expect(gateway.failCalls).toHaveLength(1);
    expect(gateway.failCalls[0].errorMessage).toContain('missing required string field: fromPhone');
  });

  it('records the agent error message when the agent throws', async () => {
    const event = makeEvent();
    const gateway = new FakeOutboxGateway([[event]]);
    const agent = new FakeReceptionist();
    agent.failOnContactId = 'contact-1';
    const worker = makeWorker(gateway, agent);

    expect(await worker.processSingleBatch()).toBe(0);

    expect(gateway.completeCalls).toHaveLength(0);
    expect(gateway.failCalls).toHaveLength(1);
    expect(gateway.failCalls[0].errorMessage).toBe('agent boom');
  });

  it('processes a mixed batch: good events complete, bad ones fail, count is exact', async () => {
    const good1 = makeEvent();
    const bad = makeEvent({ aggregateType: 'Nope' });
    const good2 = makeEvent();
    const gateway = new FakeOutboxGateway([[good1, bad, good2]]);
    const agent = new FakeReceptionist();
    const worker = makeWorker(gateway, agent);

    expect(await worker.processSingleBatch()).toBe(2);

    expect(agent.inputs.map((i) => i.contactId)).toEqual(['contact-1', 'contact-3']);
    expect(gateway.completeCalls.map((c) => c.eventId)).toEqual([good1.id, good2.id]);
    expect(gateway.failCalls.map((f) => f.eventId)).toEqual([bad.id]);
  });

  it('swallows a failEvent error so the batch loop keeps going', async () => {
    const bad1 = makeEvent({ aggregateType: 'Nope' });
    const good = makeEvent();
    const gateway = new FakeOutboxGateway([[bad1, good]]);
    gateway.failShouldThrow = true;
    const agent = new FakeReceptionist();
    const worker = makeWorker(gateway, agent);

    // bad1 fails (failEvent throws but is swallowed); good still completes.
    expect(await worker.processSingleBatch()).toBe(1);
    expect(gateway.completeCalls.map((c) => c.eventId)).toEqual([good.id]);
    expect(gateway.failCalls).toHaveLength(1);
  });

  it('is re-entrancy safe: a second concurrent batch returns 0 without claiming', async () => {
    const gateway = new FakeOutboxGateway([[makeEvent()]]);
    const agent = new FakeReceptionist();
    const worker = makeWorker(gateway, agent);

    // Simulate an in-flight batch by flipping the private guard.
    (worker as unknown as { isProcessing: boolean }).isProcessing = true;

    expect(await worker.processSingleBatch()).toBe(0);
    expect(gateway.claimBatchCalls).toHaveLength(0);
  });
});
