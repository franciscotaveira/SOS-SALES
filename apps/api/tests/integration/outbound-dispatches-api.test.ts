import { describe, expect, it } from 'vitest';
import {
  ApproveOutboundDispatchInput,
  CancelOutboundDispatchInput,
  CreateOutboundDraftInput,
  OutboundDispatchConflictError,
  OutboundDispatchGateway,
  OutboundDispatchMutationResult,
  OutboundDispatchRecord,
} from '../../src/application/ports/outbound-dispatch-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const verifiedActor = { userId: 'b1000000-0000-4000-8000-000000000001' };
const workspaceA = 'b2000000-0000-4000-8000-000000000001';
const workspaceB = 'b2000000-0000-4000-8000-000000000002';
const journeyA = 'b3000000-0000-4000-8000-000000000001';
const journeyB = 'b3000000-0000-4000-8000-000000000002';
const dispatchA = 'b4000000-0000-4000-8000-000000000001';
const dispatchB = 'b4000000-0000-4000-8000-000000000002';
const keyA = 'b5000000-0000-4000-8000-000000000001';
const keyB = 'b5000000-0000-4000-8000-000000000002';
const authorization = 'Bearer verified.jwt.token';

function record(status: OutboundDispatchRecord['status'] = 'DRAFT'): OutboundDispatchRecord {
  return {
    dispatchId: dispatchA,
    journeyId: journeyA,
    contactId: 'b6000000-0000-4000-8000-000000000001',
    channelConnectionId: 'b7000000-0000-4000-8000-000000000001',
    messageKind: 'TEXT',
    textContent: 'Posso confirmar sua vaga às 14h15?',
    status,
    createdAt: '2030-01-01T00:00:00.000Z',
  };
}

function gateway(overrides: Partial<OutboundDispatchGateway> = {}): OutboundDispatchGateway {
  const result = (status: OutboundDispatchMutationResult['status']): OutboundDispatchMutationResult => ({ dispatchId: dispatchA, status, idempotent: false });
  return {
    createDraft: async () => result('DRAFT'),
    approve: async () => result('APPROVED'),
    cancel: async () => result('CANCELLED'),
    get: async () => record(),
    ...overrides,
  };
}

function app(outboundDispatchGateway: OutboundDispatchGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha', verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }) },
    authenticator: { verifyAccessToken: async () => verifiedActor },
    outboundDispatchGateway,
    logger: false,
    rateLimit: false,
  });
}

describe('Outbound dispatch API — explicit human supervised outbound lifecycle', () => {
  it('OUTBOUND-API-01: derives the actor from JWT and creates a strictly validated text draft', async () => {
    let received: { actor: typeof verifiedActor; input: CreateOutboundDraftInput } | undefined;
    const server = app(gateway({ createDraft: async (actor, input) => {
      received = { actor, input };
      return { dispatchId: dispatchA, status: 'DRAFT', idempotent: false };
    } }));
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/outbound-drafts`,
      headers: { authorization, 'idempotency-key': keyA },
      payload: { textContent: '  Posso confirmar sua vaga às 14h15?  ', actorUserId: workspaceB },
    });
    expect(response.statusCode).toBe(422);
    expect(received).toBeUndefined();
    const valid = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/outbound-drafts`,
      headers: { authorization, 'idempotency-key': keyA },
      payload: { textContent: '  Posso confirmar sua vaga às 14h15?  ' },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ data: { dispatchId: dispatchA, status: 'DRAFT', idempotent: false } });
    expect(received).toEqual({ actor: verifiedActor, input: {
      workspaceId: workspaceA, journeyId: journeyA, textContent: 'Posso confirmar sua vaga às 14h15?', idempotencyKey: keyA,
    } });
    await server.close();
  });

  it('OUTBOUND-API-02: approves and cancels only with UUID idempotency keys and validated cancellation evidence', async () => {
    let approved: ApproveOutboundDispatchInput | undefined;
    let cancelled: CancelOutboundDispatchInput | undefined;
    const server = app(gateway({
      approve: async (_actor, input) => { approved = input; return { dispatchId: dispatchA, status: 'APPROVED', idempotent: false }; },
      cancel: async (_actor, input) => { cancelled = input; return { dispatchId: dispatchA, status: 'CANCELLED', idempotent: false }; },
    }));
    const approval = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchA}/approve`, headers: { authorization, 'idempotency-key': keyA }, payload: {} });
    const cancellation = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchA}/cancel`, headers: { authorization, 'idempotency-key': keyB }, payload: { reason: 'Cliente pediu para aguardar' } });
    expect(approval.statusCode).toBe(200);
    expect(cancellation.statusCode).toBe(200);
    expect(approved).toEqual({ workspaceId: workspaceA, dispatchId: dispatchA, idempotencyKey: keyA });
    expect(cancelled).toEqual({ workspaceId: workspaceA, dispatchId: dispatchA, idempotencyKey: keyB, reason: 'Cliente pediu para aguardar' });
    const invalid = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchA}/cancel`, headers: { authorization, 'idempotency-key': 'not-a-uuid' }, payload: { reason: 'x' } });
    expect(invalid.statusCode).toBe(422);
    await server.close();
  });

  it('OUTBOUND-API-03: returns indistinguishable 404 for absent and cross-tenant dispatches', async () => {
    const server = app(gateway({
      createDraft: async (_actor, input) => input.workspaceId === workspaceB || input.journeyId === journeyB ? null : { dispatchId: dispatchA, status: 'DRAFT', idempotent: false },
      get: async (_actor, workspaceId, dispatchId) => workspaceId === workspaceB || dispatchId === dispatchB ? null : record(),
    }));
    const crossTenant = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceB}/journeys/${journeyA}/outbound-drafts`, headers: { authorization, 'idempotency-key': keyA }, payload: { textContent: 'Mensagem válida' } });
    const missing = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchB}`, headers: { authorization } });
    for (const response of [crossTenant, missing]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    }
    await server.close();
  });

  it('OUTBOUND-API-04: exposes read state but never has a provider send endpoint', async () => {
    const server = app(gateway({ get: async () => record('APPROVED') }));
    const read = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchA}`, headers: { authorization } });
    expect(read.statusCode).toBe(200);
    expect(read.json().data).toMatchObject({ dispatchId: dispatchA, status: 'APPROVED', textContent: 'Posso confirmar sua vaga às 14h15?' });
    const send = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchA}/send`, headers: { authorization, 'idempotency-key': keyA }, payload: {} });
    expect(send.statusCode).toBe(404);
    await server.close();
  });

  it('OUTBOUND-API-05: turns a raced lifecycle mutation into a safe conflict and authenticates before the gateway', async () => {
    let calls = 0;
    const server = app(gateway({ approve: async () => {
      calls += 1;
      throw new OutboundDispatchConflictError('internal state detail');
    } }));
    const conflict = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchA}/approve`, headers: { authorization, 'idempotency-key': keyA }, payload: {} });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'Outbound dispatch state has changed' });
    const unauthenticated = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/outbound-dispatches/${dispatchA}/approve`, headers: { 'idempotency-key': keyA }, payload: {} });
    expect(unauthenticated.statusCode).toBe(401);
    expect(calls).toBe(1);
    await server.close();
  });
});
