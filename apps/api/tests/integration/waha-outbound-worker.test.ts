import { describe, expect, it, vi } from 'vitest';
import {
  ClaimedOutboundDispatch,
  OutboundDispatchGateway,
  OutboundDispatchMutationResult,
} from '../../src/application/ports/outbound-dispatch-gateway.js';
import { WahaOutboundAdapter } from '../../src/infrastructure/channels/waha/waha-outbound-adapter.js';
import { WahaOutboundWorker } from '../../src/infrastructure/workers/waha-outbound-worker.js';

describe('WAHA Outbound Worker — Supervised Message Sending', () => {
  it('OUTBOUND-WORKER-WABA-01: routes a Meta channel through WABA and never through WAHA', async () => {
    const dispatchId = 'd0000000-0000-4000-8000-000000000010';
    const gateway = {
      createDraft: vi.fn(), approve: vi.fn(), cancel: vi.fn(), get: vi.fn(),
      listClaimableDispatches: vi.fn().mockResolvedValue([{ dispatchId, workspaceId: 'w' }]),
      claimDispatch: vi.fn().mockResolvedValue({
        dispatchId,
        claimToken: 'c0000000-0000-4000-8000-000000000010',
        textContent: 'Mensagem oficial',
        channelConnectionId: 'cc000000-0000-4000-8000-000000000010',
        contactId: 'ct000000-0000-4000-8000-000000000010',
        contactPhone: '+1 (508) 250-1315',
        provider: 'meta_cloud',
        wabaPhoneNumberId: 'meta-phone-id',
        wabaAccessToken: 'meta-token',
      }),
      recordProviderAcceptance: vi.fn().mockResolvedValue({ dispatchId, status: 'ACCEPTED', idempotent: false }),
      recordProviderFailure: vi.fn(),
    } as unknown as OutboundDispatchGateway;
    const waha = new WahaOutboundAdapter({ endpoint: 'http://localhost:3002' });
    const wahaSend = vi.spyOn(waha, 'sendText');
    const waba = { sendText: vi.fn().mockResolvedValue({ messageId: 'wamid.meta-1' }) };
    const worker = new WahaOutboundWorker({
      dispatchGateway: gateway,
      outboundAdapter: waha,
      wabaClient: waba as any,
      workerId: 'provider-router-test',
    });

    await expect(worker.processSingleBatch()).resolves.toBe(1);
    expect(waba.sendText).toHaveBeenCalledWith({
      phoneNumberId: 'meta-phone-id',
      accessToken: 'meta-token',
      recipientPhone: '+1 (508) 250-1315',
      text: 'Mensagem oficial',
    });
    expect(wahaSend).not.toHaveBeenCalled();
    expect(gateway.recordProviderAcceptance).toHaveBeenCalledWith(expect.objectContaining({
      providerMessageId: 'wamid.meta-1',
    }));
  });

  it('OUTBOUND-WORKER-WABA-INTERACTIVE-01: sends typed WABA buttons only through Meta', async () => {
    const dispatchId = 'd0000000-0000-4000-8000-000000000011';
    const gateway = {
      createDraft: vi.fn(), approve: vi.fn(), cancel: vi.fn(), get: vi.fn(),
      listClaimableDispatches: vi.fn().mockResolvedValue([{ dispatchId, workspaceId: 'w' }]),
      claimDispatch: vi.fn().mockResolvedValue({ dispatchId, claimToken: 'c0000000-0000-4000-8000-000000000011', textContent: 'Escolha uma opção', messageKind: 'WABA_BUTTONS', messagePayload: { bodyText: 'Escolha uma opção', buttons: [{ id: 'book', title: 'Agendar' }] }, channelConnectionId: 'cc', contactId: 'ct', contactPhone: '+5511999998888', provider: 'meta_cloud', wabaPhoneNumberId: 'meta-phone-id', wabaAccessToken: 'meta-token' }),
      recordProviderAcceptance: vi.fn().mockResolvedValue({ dispatchId, status: 'ACCEPTED', idempotent: false }), recordProviderFailure: vi.fn(),
    } as unknown as OutboundDispatchGateway;
    const waha = new WahaOutboundAdapter({ endpoint: 'http://localhost:3002' });
    const wahaSend = vi.spyOn(waha, 'sendText');
    const waba = { sendInteractiveButtons: vi.fn().mockResolvedValue({ messageId: 'wamid.interactive-1' }) };
    const worker = new WahaOutboundWorker({ dispatchGateway: gateway, outboundAdapter: waha, wabaClient: waba as any, workerId: 'waba-interactive-test' });

    await expect(worker.processSingleBatch()).resolves.toBe(1);
    expect(waba.sendInteractiveButtons).toHaveBeenCalledWith({ phoneNumberId: 'meta-phone-id', accessToken: 'meta-token', recipientPhone: '+5511999998888', bodyText: 'Escolha uma opção', headerText: undefined, footerText: undefined, buttons: [{ id: 'book', title: 'Agendar' }] });
    expect(wahaSend).not.toHaveBeenCalled();
    expect(gateway.recordProviderAcceptance).toHaveBeenCalledWith(expect.objectContaining({ providerMessageId: 'wamid.interactive-1' }));
  });

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
