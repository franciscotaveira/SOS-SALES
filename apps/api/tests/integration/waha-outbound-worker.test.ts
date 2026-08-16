import { describe, expect, it, vi } from 'vitest';
import {
  ClaimedOutboundDispatch,
  OutboundDispatchGateway,
  OutboundDispatchMutationResult,
} from '../../src/application/ports/outbound-dispatch-gateway.js';
import { WahaOutboundAdapter } from '../../src/infrastructure/channels/waha/waha-outbound-adapter.js';
import { WahaOutboundWorker } from '../../src/infrastructure/workers/waha-outbound-worker.js';

describe('WAHA Outbound Worker — Supervised Message Sending', () => {
  it('OUTBOUND-WORKER-01: claims approved dispatches, sends via WAHA and records provider acceptance', async () => {
    const dispatchId = 'd1000000-0000-4000-8000-000000000001';
    const claimToken = 'c1000000-0000-4000-8000-000000000001';
    let acceptedPayload: any = null;

    const mockGateway: OutboundDispatchGateway = {
      createDraft: vi.fn(),
      approve: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      listClaimableDispatches: vi.fn().mockResolvedValue([
        { dispatchId, workspaceId: 'w1000000-0000-4000-8000-000000000001' },
      ]),
      claimDispatch: vi.fn().mockResolvedValue({
        dispatchId,
        claimToken,
        textContent: 'Olá! Posso confirmar seu horário amanhã às 15h?',
        channelConnectionId: 'cc100000-0000-4000-8000-000000000001',
        contactId: 'ct100000-0000-4000-8000-000000000001',
        contactPhone: '+5511999998888',
        session: 'default',
      } as ClaimedOutboundDispatch),
      recordProviderAcceptance: vi.fn().mockImplementation((payload) => {
        acceptedPayload = payload;
        return Promise.resolve({
          dispatchId,
          status: 'ACCEPTED',
          idempotent: false,
        } as OutboundDispatchMutationResult);
      }),
      recordProviderFailure: vi.fn(),
    };

    const mockAdapter = new WahaOutboundAdapter({
      endpoint: 'http://localhost:3002',
    });

    vi.spyOn(mockAdapter, 'sendText').mockResolvedValue({
      success: true,
      providerMessageId: 'waha_msg_123456789',
      rawResponse: { id: 'waha_msg_123456789' },
    });

    const worker = new WahaOutboundWorker({
      dispatchGateway: mockGateway,
      outboundAdapter: mockAdapter,
      workerId: 'test-worker-01',
    });

    const processed = await worker.processSingleBatch();

    expect(processed).toBe(1);
    expect(mockAdapter.sendText).toHaveBeenCalledWith({
      chatId: '5511999998888@c.us',
      text: 'Olá! Posso confirmar seu horário amanhã às 15h?',
      session: 'default',
    });
    expect(acceptedPayload).toEqual({
      dispatchId,
      claimToken,
      workerId: 'test-worker-01',
      providerMessageId: 'waha_msg_123456789',
    });
  });

  it('OUTBOUND-WORKER-02: records provider failure when WAHA returns a fatal or HTTP 4xx error', async () => {
    const dispatchId = 'd2000000-0000-4000-8000-000000000002';
    const claimToken = 'c2000000-0000-4000-8000-000000000002';
    let failurePayload: any = null;

    const mockGateway: OutboundDispatchGateway = {
      createDraft: vi.fn(),
      approve: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      listClaimableDispatches: vi.fn().mockResolvedValue([
        { dispatchId, workspaceId: 'w1000000-0000-4000-8000-000000000001' },
      ]),
      claimDispatch: vi.fn().mockResolvedValue({
        dispatchId,
        claimToken,
        textContent: 'Mensagem de teste',
        channelConnectionId: 'cc100000-0000-4000-8000-000000000001',
        contactId: 'ct100000-0000-4000-8000-000000000001',
        contactPhone: '+5511000000000',
      } as ClaimedOutboundDispatch),
      recordProviderAcceptance: vi.fn(),
      recordProviderFailure: vi.fn().mockImplementation((payload) => {
        failurePayload = payload;
        return Promise.resolve({
          dispatchId,
          status: 'FAILED',
          idempotent: false,
        } as OutboundDispatchMutationResult);
      }),
    };

    const mockAdapter = new WahaOutboundAdapter({
      endpoint: 'http://localhost:3002',
    });

    vi.spyOn(mockAdapter, 'sendText').mockResolvedValue({
      success: false,
      kind: 'FATAL',
      failureCode: 'WAHA_HTTP_422',
      message: 'Unprocessable entity - invalid phone number',
    });

    const worker = new WahaOutboundWorker({
      dispatchGateway: mockGateway,
      outboundAdapter: mockAdapter,
      workerId: 'test-worker-01',
    });

    const processed = await worker.processSingleBatch();

    expect(processed).toBe(1);
    expect(failurePayload).toEqual({
      dispatchId,
      claimToken,
      workerId: 'test-worker-01',
      failureCode: 'WAHA_HTTP_422',
    });
  });

  it('OUTBOUND-WORKER-03: marks ambiguous timeout as failure without blind retries', async () => {
    const dispatchId = 'd3000000-0000-4000-8000-000000000003';
    const claimToken = 'c3000000-0000-4000-8000-000000000003';
    let failurePayload: any = null;

    const mockGateway: OutboundDispatchGateway = {
      createDraft: vi.fn(),
      approve: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      listClaimableDispatches: vi.fn().mockResolvedValue([
        { dispatchId, workspaceId: 'w1000000-0000-4000-8000-000000000001' },
      ]),
      claimDispatch: vi.fn().mockResolvedValue({
        dispatchId,
        claimToken,
        textContent: 'Mensagem com timeout',
        channelConnectionId: 'cc100000-0000-4000-8000-000000000001',
        contactId: 'ct100000-0000-4000-8000-000000000001',
        contactPhone: '+5511999998888',
      } as ClaimedOutboundDispatch),
      recordProviderAcceptance: vi.fn(),
      recordProviderFailure: vi.fn().mockImplementation((payload) => {
        failurePayload = payload;
        return Promise.resolve({
          dispatchId,
          status: 'FAILED',
          idempotent: false,
        } as OutboundDispatchMutationResult);
      }),
    };

    const mockAdapter = new WahaOutboundAdapter({
      endpoint: 'http://localhost:3002',
    });

    vi.spyOn(mockAdapter, 'sendText').mockResolvedValue({
      success: false,
      kind: 'AMBIGUOUS',
      failureCode: 'WAHA_TIMEOUT',
      message: 'Request timed out after 30000ms',
    });

    const worker = new WahaOutboundWorker({
      dispatchGateway: mockGateway,
      outboundAdapter: mockAdapter,
      workerId: 'test-worker-01',
    });

    const processed = await worker.processSingleBatch();

    expect(processed).toBe(1);
    expect(failurePayload?.failureCode).toBe('WAHA_TIMEOUT');
  });

  it('OUTBOUND-WORKER-04: gracefully skips when claim fails (e.g. unapproved or unseated claim)', async () => {
    const dispatchId = 'd4000000-0000-4000-8000-000000000004';

    const mockGateway: OutboundDispatchGateway = {
      createDraft: vi.fn(),
      approve: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      listClaimableDispatches: vi.fn().mockResolvedValue([
        { dispatchId, workspaceId: 'w1000000-0000-4000-8000-000000000001' },
      ]),
      claimDispatch: vi.fn().mockResolvedValue(null), // Claim refused by database rules
      recordProviderAcceptance: vi.fn(),
      recordProviderFailure: vi.fn(),
    };

    const mockAdapter = new WahaOutboundAdapter({
      endpoint: 'http://localhost:3002',
    });

    const worker = new WahaOutboundWorker({
      dispatchGateway: mockGateway,
      outboundAdapter: mockAdapter,
      workerId: 'test-worker-01',
    });

    const processed = await worker.processSingleBatch();

    expect(processed).toBe(0);
  });
});
