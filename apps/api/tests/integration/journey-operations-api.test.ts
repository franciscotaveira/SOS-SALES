import { describe, expect, it } from 'vitest';
import {
  CreateFollowUpInput,
  FollowUpResult,
  JourneyOperationsGateway,
  JourneyStageResult,
  SetJourneyStageInput,
} from '../../src/application/ports/journey-operations-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const verifiedActor = { userId: '91000000-0000-4000-8000-000000000001' };
const workspaceA = '92000000-0000-4000-8000-000000000001';
const workspaceB = '92000000-0000-4000-8000-000000000002';
const journeyA = '93000000-0000-4000-8000-000000000001';
const journeyB = '93000000-0000-4000-8000-000000000002';
const stageKey = '94000000-0000-4000-8000-000000000001';
const followUpKey = '94000000-0000-4000-8000-000000000002';
const authorization = 'Bearer verified.jwt.token';

function testGateway(
  onStage?: (actor: typeof verifiedActor, input: SetJourneyStageInput) => unknown,
  onFollowUp?: (actor: typeof verifiedActor, input: CreateFollowUpInput) => unknown,
): JourneyOperationsGateway {
  return {
    setStage: async (actor, input) => {
      const result = onStage?.(actor, input);
      if (result instanceof Error) throw result;
      if (result === null) return null;
      return (result as JourneyStageResult | undefined) ?? {
        journeyId: input.journeyId,
        stage: input.stage,
        idempotent: false,
      };
    },
    createFollowUp: async (actor, input) => {
      const result = onFollowUp?.(actor, input);
      if (result instanceof Error) throw result;
      if (result === null) return null;
      return (result as FollowUpResult | undefined) ?? {
        followUpTaskId: '95000000-0000-4000-8000-000000000001',
        status: 'PENDING',
        idempotent: false,
      };
    },
  };
}

function app(gateway: JourneyOperationsGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha', verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }) },
    authenticator: { verifyAccessToken: async () => verifiedActor },
    journeyOperationsGateway: gateway,
    logger: false,
    rateLimit: false,
  });
}

describe('Journey operation API — authenticated stage and follow-up mutations', () => {
  it('JRN-API-01: derives the actor from JWT and forwards only validated stage input', async () => {
    let received: { actor: typeof verifiedActor; input: SetJourneyStageInput } | undefined;
    const server = app(testGateway((actor, input) => {
      received = { actor, input };
      return undefined;
    }));
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/stage`,
      headers: { authorization, 'idempotency-key': stageKey },
      payload: { stage: 'CONTACTED', reason: 'Operador iniciou o contato', actorUserId: workspaceB },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { journeyId: journeyA, stage: 'CONTACTED', idempotent: false } });
    expect(received).toEqual({ actor: verifiedActor, input: {
      workspaceId: workspaceA,
      journeyId: journeyA,
      stage: 'CONTACTED',
      reason: 'Operador iniciou o contato',
      idempotencyKey: stageKey,
    } });
    await server.close();
  });

  it('JRN-API-02: creates a bounded future follow-up and preserves idempotent retries', async () => {
    const dueAt = '2030-06-01T14:30:00.000Z';
    let calls = 0;
    const server = app(testGateway(undefined, (_actor, input) => {
      calls += 1;
      return {
        followUpTaskId: '95000000-0000-4000-8000-000000000001',
        status: 'PENDING',
        idempotent: calls > 1,
      };
    }));
    const request = {
      method: 'POST' as const,
      url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/follow-ups`,
      headers: { authorization, 'idempotency-key': followUpKey },
      payload: { dueAt, reason: 'Confirmar disponibilidade antes do evento' },
    };
    const first = await server.inject(request);
    const retry = await server.inject(request);
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({ status: 'PENDING', idempotent: false });
    expect(retry.json().data).toMatchObject({ status: 'PENDING', idempotent: true });
    await server.close();
  });

  it('JRN-API-03: rejects malformed idempotency, invalid body and missing token before gateway invocation', async () => {
    let invoked = false;
    const server = app(testGateway(() => { invoked = true; return undefined; }));
    const invalidStage = await server.inject({
      method: 'PATCH', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/stage`,
      headers: { authorization, 'idempotency-key': 'not-a-uuid' }, payload: { stage: 'WON' },
    });
    const outcomeAsStage = await server.inject({
      method: 'PATCH', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/stage`,
      headers: { authorization, 'idempotency-key': stageKey }, payload: { stage: 'GANHO' },
    });
    const invalidFollowUp = await server.inject({
      method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/follow-ups`,
      headers: { authorization, 'idempotency-key': followUpKey }, payload: { dueAt: 'tomorrow', reason: 'x' },
    });
    const missingToken = await server.inject({
      method: 'PATCH', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/stage`,
      headers: { 'idempotency-key': stageKey }, payload: { stage: 'CONTACTED' },
    });
    for (const response of [invalidStage, outcomeAsStage, invalidFollowUp]) {
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid journey operation request' });
    }
    expect(missingToken.statusCode).toBe(401);
    expect(invoked).toBe(false);
    await server.close();
  });

  it('JRN-API-04: makes cross-tenant and missing journey results indistinguishable', async () => {
    const server = app(testGateway((_, input) => (
      input.workspaceId === workspaceB || input.journeyId === journeyB ? null : undefined
    ), (_, input) => (
      input.workspaceId === workspaceB || input.journeyId === journeyB ? null : undefined
    )));
    const crossTenant = await server.inject({
      method: 'PATCH', url: `/api/v1/workspaces/${workspaceB}/journeys/${journeyA}/stage`,
      headers: { authorization, 'idempotency-key': stageKey }, payload: { stage: 'CONTACTED' },
    });
    const missing = await server.inject({
      method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyB}/follow-ups`,
      headers: { authorization, 'idempotency-key': followUpKey },
      payload: { dueAt: '2030-06-01T14:30:00.000Z', reason: 'Retornar com informação confirmada' },
    });
    for (const response of [crossTenant, missing]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    }
    await server.close();
  });
});
