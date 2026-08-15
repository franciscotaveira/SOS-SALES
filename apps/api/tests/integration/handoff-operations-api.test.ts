import { describe, expect, it } from 'vitest';
import {
  HandoffOperationInput,
  HandoffOperationResult,
  HandoffOperationsGateway,
  HandoffTransitionConflictError,
} from '../../src/application/ports/handoff-operations-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const verifiedActor = { userId: '81000000-0000-4000-8000-000000000001' };
const workspaceA = '82000000-0000-4000-8000-000000000001';
const workspaceB = '82000000-0000-4000-8000-000000000002';
const handoffA = '83000000-0000-4000-8000-000000000001';
const handoffB = '83000000-0000-4000-8000-000000000002';
const keyA = '84000000-0000-4000-8000-000000000001';
const keyB = '84000000-0000-4000-8000-000000000002';
const headers = { authorization: 'Bearer verified.jwt.token', 'idempotency-key': keyA };

function testGateway(onExecute?: (actor: typeof verifiedActor, input: HandoffOperationInput) => unknown): HandoffOperationsGateway {
  return {
    execute: async (actor, input) => {
      const result = onExecute?.(actor, input);
      if (result instanceof Error) throw result;
      if (result === null) return null;
      return (result as HandoffOperationResult | undefined) ?? {
        handoffCaseId: input.handoffCaseId,
        status: input.operation === 'accept' ? 'ACCEPTED' : input.operation === 'resolve' ? 'RESOLVED' : 'RETURNED_TO_AI',
        assignedToUserId: input.operation === 'accept' ? actor.userId : undefined,
        idempotent: false,
      };
    },
  };
}

function app(gateway: HandoffOperationsGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha', verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }) },
    authenticator: { verifyAccessToken: async () => verifiedActor },
    handoffOperationsGateway: gateway,
    logger: false,
    rateLimit: false,
  });
}

describe('Handoff operation API — authenticated state transitions', () => {
  it('HND-API-01: derives actor identity from the verified token and forwards the exact idempotency key', async () => {
    let received: { actor: typeof verifiedActor; input: HandoffOperationInput } | undefined;
    const server = app(testGateway((actor, input) => {
      received = { actor, input };
      return undefined;
    }));
    const response = await server.inject({
      method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/accept`, headers,
      payload: { actorUserId: 'attacker-controlled-value', workspaceId: workspaceB },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: {
      handoffCaseId: handoffA, status: 'ACCEPTED', assignedToUserId: verifiedActor.userId, idempotent: false,
    } });
    expect(received).toEqual({ actor: verifiedActor, input: {
      workspaceId: workspaceA, handoffCaseId: handoffA, operation: 'accept', idempotencyKey: keyA,
    } });
    await server.close();
  });

  it('HND-API-02: rejects missing or malformed idempotency keys and invalid return reason with a sanitised 422', async () => {
    const server = app(testGateway());
    const missing = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/accept`, headers: { authorization: headers.authorization } });
    const malformed = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/resolve`, headers: { ...headers, 'idempotency-key': 'not-a-uuid' } });
    const noReason = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/return-to-ai`, headers, payload: { reason: 'x' } });
    for (const response of [missing, malformed, noReason]) {
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid handoff operation request' });
    }
    await server.close();
  });

  it('HND-API-03: returns indistinguishable 404 for cross-tenant and missing handoffs', async () => {
    const server = app(testGateway((_actor, input) => input.workspaceId === workspaceB || input.handoffCaseId === handoffB ? null : undefined));
    const crossTenant = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceB}/handoffs/${handoffA}/accept`, headers });
    const missing = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffB}/accept`, headers: { ...headers, 'idempotency-key': keyB } });
    for (const response of [crossTenant, missing]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    }
    await server.close();
  });

  it('HND-API-04: preserves idempotent retries and maps a raced state transition to 409', async () => {
    let calls = 0;
    const server = app(testGateway((_actor, input) => {
      calls += 1;
      if (calls === 2) return new HandoffTransitionConflictError('internal state detail');
      return { handoffCaseId: input.handoffCaseId, status: 'ACCEPTED', assignedToUserId: verifiedActor.userId, idempotent: calls > 2 };
    }));
    const first = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/accept`, headers });
    const race = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/accept`, headers: { ...headers, 'idempotency-key': keyB } });
    const retry = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/accept`, headers });
    expect(first.json().data).toMatchObject({ idempotent: false });
    expect(race.statusCode).toBe(409);
    expect(race.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'Handoff transition is no longer valid' });
    expect(retry.json().data).toMatchObject({ idempotent: true });
    await server.close();
  });

  it('HND-API-05: returns 401 before any handoff dependency is invoked', async () => {
    let invoked = false;
    const server = app(testGateway(() => { invoked = true; return undefined; }));
    const response = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/handoffs/${handoffA}/accept`, headers: { 'idempotency-key': keyA } });
    expect(response.statusCode).toBe(401);
    expect(invoked).toBe(false);
    await server.close();
  });
});
