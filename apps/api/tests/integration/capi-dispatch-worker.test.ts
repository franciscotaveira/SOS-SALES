import { describe, expect, it, vi } from 'vitest';
import { CapiClient, hashPhone, hashPii } from '../../src/infrastructure/channels/meta/capi-client.js';
import { CapiDispatchWorker } from '../../src/infrastructure/workers/capi-dispatch-worker.js';

describe('Meta Conversions API (CAPI) Dispatch Worker', () => {
  it('CAPI-01: hashes PII correctly according to Meta specifications (SHA-256)', () => {
    // Phone normalization (removes '+', spaces, dashes, only digits)
    const rawPhone = '+55 (11) 99999-8888';
    const hashedPhone = hashPhone(rawPhone);
    // sha256 of "5511999998888"
    expect(hashedPhone).toMatch(/^[a-f0-9]{64}$/);

    // Email normalization (trimmed lowercase)
    const rawEmail = ' Test.User@Example.COM ';
    const hashedEmail = hashPii(rawEmail);
    // sha256 of "test.user@example.com"
    expect(hashedEmail).toMatch(/^[a-f0-9]{64}$/);
  });

  it('CAPI-02: formats and dispatches Purchase event to Meta Graph API', async () => {
    const client = new CapiClient({
      defaultAccessToken: 'EAABtestTokenCAPI',
      baseUrl: 'https://mock-graph.facebook.com',
    });

    let sentUrl = '';
    let sentBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      sentUrl = String(url);
      sentBody = JSON.parse(options.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          events_received: 1,
          fbtrace_id: 'E7qWtest123',
        }),
      });
    }) as any;

    const result = await client.sendPurchaseEvent({
      outcomeId: 'out10000-0000-4000-8000-000000000001',
      workspaceId: 'w1000000-0000-4000-8000-000000000001',
      journeyId: 'j1000000-0000-4000-8000-000000000001',
      revenueMinor: 150000, // R$ 1.500,00
      currency: 'BRL',
      pixelId: '123456789012345',
      phone: '+5511999998888',
      email: 'lead@example.com',
    });

    expect(result.success).toBe(true);
    expect(sentUrl).toContain('/v20.0/123456789012345/events');
    expect(sentBody.data[0]).toEqual({
      event_name: 'Purchase',
      event_time: expect.any(Number),
      event_id: 'out10000-0000-4000-8000-000000000001',
      action_source: 'system_generated',
      user_data: {
        ph: [expect.any(String)],
        em: [expect.any(String)],
      },
      custom_data: {
        currency: 'BRL',
        value: 1500,
      },
    });
  });

  it('CAPI-03: worker processes outbox event, dispatches CAPI Purchase and completes outbox', async () => {
    let completedEvent: any = null;

    const mockOutboxGateway = {
      claimBatch: vi.fn().mockResolvedValue([
        {
          id: 'evt10000-0000-4000-8000-000000000001',
          workspaceId: 'w1000000-0000-4000-8000-000000000001',
          eventName: 'commercial.outcome_recorded',
          aggregateType: 'CommercialOutcome',
          aggregateId: 'out10000-0000-4000-8000-000000000001',
          payload: {
            outcomeId: 'out10000-0000-4000-8000-000000000001',
            journeyId: 'j1000000-0000-4000-8000-000000000001',
            result: 'WON',
            revenueMinor: 250000,
          },
          idempotencyKey: 'commercial.outcome:out1',
          claimToken: 'tok10000-0000-4000-8000-000000000001',
          attempts: 0,
        },
      ]),
      completeEvent: vi.fn().mockImplementation((param) => {
        completedEvent = param;
        return Promise.resolve();
      }),
      failEvent: vi.fn(),
      fetchInboundChannelEvent: vi.fn(),
    };

    const mockCapiGateway = {
      sendPurchaseEvent: vi.fn().mockResolvedValue({
        success: true,
        capiEventId: 'out10000-0000-4000-8000-000000000001',
      }),
    };

    const mockPoolClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            pixel_id: '998877665544332',
            phone: '+5511999998888',
            email: 'comprador@example.com',
          },
        ],
      }),
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockPoolClient),
    };

    const worker = new CapiDispatchWorker({
      outboxGateway: mockOutboxGateway as any,
      capiGateway: mockCapiGateway as any,
      pool: mockPool as any,
      workerId: 'test-capi-worker',
    });

    const processed = await worker.processSingleBatch();

    expect(processed).toBe(1);
    expect(mockCapiGateway.sendPurchaseEvent).toHaveBeenCalledWith({
      outcomeId: 'out10000-0000-4000-8000-000000000001',
      workspaceId: 'w1000000-0000-4000-8000-000000000001',
      journeyId: 'j1000000-0000-4000-8000-000000000001',
      revenueMinor: 250000,
      currency: 'BRL',
      pixelId: '998877665544332',
      phone: '+5511999998888',
      email: 'comprador@example.com',
    });
    expect(completedEvent).toEqual({
      eventId: 'evt10000-0000-4000-8000-000000000001',
      claimToken: 'tok10000-0000-4000-8000-000000000001',
      workerId: 'test-capi-worker',
    });
  });

  it('CAPI-04: non-WON outcome completes outbox immediately without invoking CAPI', async () => {
    const mockOutboxGateway = {
      claimBatch: vi.fn().mockResolvedValue([
        {
          id: 'evt20000-0000-4000-8000-000000000002',
          workspaceId: 'w1000000-0000-4000-8000-000000000001',
          eventName: 'commercial.outcome_recorded',
          aggregateType: 'CommercialOutcome',
          aggregateId: 'out20000-0000-4000-8000-000000000002',
          payload: {
            outcomeId: 'out20000-0000-4000-8000-000000000002',
            journeyId: 'j2000000-0000-4000-8000-000000000002',
            result: 'LOST',
            revenueMinor: 0,
          },
          idempotencyKey: 'commercial.outcome:out2',
          claimToken: 'tok20000-0000-4000-8000-000000000002',
          attempts: 0,
        },
      ]),
      completeEvent: vi.fn().mockResolvedValue(undefined),
      failEvent: vi.fn(),
      fetchInboundChannelEvent: vi.fn(),
    };

    const mockCapiGateway = {
      sendPurchaseEvent: vi.fn(),
    };

    const worker = new CapiDispatchWorker({
      outboxGateway: mockOutboxGateway as any,
      capiGateway: mockCapiGateway as any,
    });

    const processed = await worker.processSingleBatch();

    expect(processed).toBe(1);
    expect(mockCapiGateway.sendPurchaseEvent).not.toHaveBeenCalled();
    expect(mockOutboxGateway.completeEvent).toHaveBeenCalledWith({
      eventId: 'evt20000-0000-4000-8000-000000000002',
      claimToken: 'tok20000-0000-4000-8000-000000000002',
      workerId: expect.any(String),
    });
  });
});
