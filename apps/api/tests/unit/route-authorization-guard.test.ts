import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import pg from 'pg';
import { whatsappChannelRoutes } from '../../src/interfaces/http/routes/whatsapp-channel-routes.js';
import { aiCopilotRoutes } from '../../src/interfaces/http/routes/ai-copilot-routes.js';
import { agentRoutes } from '../../src/interfaces/http/routes/agent-routes.js';
import { metaPartnerRoutes } from '../../src/interfaces/http/routes/meta-partner-routes.js';
import { autonomousRevenueRoutes } from '../../src/interfaces/http/routes/autonomous-revenue-routes.js';
import { abacatePayRoutes } from '../../src/interfaces/http/routes/abacatepay-routes.js';
import { AbacatePayGateway } from '../../src/infrastructure/billing/abacatepay-gateway.js';
import { OperatorAuthenticator, AuthenticatedActor } from '../../src/application/ports/operator-authenticator.js';
import { WorkspaceDirectory, AccessibleWorkspace } from '../../src/application/ports/workspace-directory.js';
import { OutboundDispatchGateway } from '../../src/application/ports/outbound-dispatch-gateway.js';

describe('Operational Routes JWT Authentication, RBAC & Multi-Tenant Isolation Guards', () => {
  const mockAuthenticator: OperatorAuthenticator = {
    async verifyAccessToken(token: string): Promise<AuthenticatedActor | null> {
      if (token.startsWith('valid_token_tenant_a_owner')) {
        return { userId: 'user_a_owner', email: 'owner@tenant-a.com' };
      }
      if (token.startsWith('valid_token_tenant_a_viewer')) {
        return { userId: 'user_a_viewer', email: 'viewer@tenant-a.com' };
      }
      if (token.startsWith('valid_token_tenant_a_operator')) {
        return { userId: 'user_a_operator', email: 'operator@tenant-a.com' };
      }
      if (token.startsWith('valid_token_tenant_b_owner')) {
        return { userId: 'user_b_owner', email: 'owner@tenant-b.com' };
      }
      return null;
    },
  };

  const mockWorkspaceDirectory: WorkspaceDirectory = {
    async listForActor(actor: AuthenticatedActor): Promise<AccessibleWorkspace[]> {
      if (actor.userId === 'user_a_owner') {
        return [{ id: '11111111-1111-1111-1111-111111111111', name: 'Tenant A', slug: 'tenant-a', role: 'owner' }];
      }
      if (actor.userId === 'user_a_viewer') {
        return [{ id: '11111111-1111-1111-1111-111111111111', name: 'Tenant A', slug: 'tenant-a', role: 'viewer' }];
      }
      if (actor.userId === 'user_a_operator') {
        return [{ id: '11111111-1111-1111-1111-111111111111', name: 'Tenant A', slug: 'tenant-a', role: 'operator' }];
      }
      if (actor.userId === 'user_b_owner') {
        return [{ id: '22222222-2222-2222-2222-222222222222', name: 'Tenant B', slug: 'tenant-b', role: 'owner' }];
      }
      return [];
    },
  };

  beforeEach(() => {
    process.env.WAHA_API_KEY = 'test_waha_api_key_123';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'default', status: 'CONNECTED', me: { id: '5511999999999@s.whatsapp.net', pushName: 'Operador' } }],
    }));
  });

  const outboundDispatchGateway: OutboundDispatchGateway = {
    createDraft: async () => ({ dispatchId: '30000000-0000-4000-8000-000000000001', status: 'DRAFT', idempotent: false }),
    approve: async () => ({ dispatchId: '30000000-0000-4000-8000-000000000001', status: 'APPROVED', idempotent: false }),
    cancel: async () => ({ dispatchId: '30000000-0000-4000-8000-000000000001', status: 'CANCELLED', idempotent: false }),
    get: async () => null,
    listClaimableDispatches: async () => [],
    claimDispatch: async () => null,
    recordProviderAcceptance: async () => null,
    recordProviderFailure: async () => null,
  };

  async function buildTestApp(deps?: {
    authenticator?: OperatorAuthenticator;
    workspaceDirectory?: WorkspaceDirectory;
    outboundDispatchGateway?: OutboundDispatchGateway;
  }) {
    const app = Fastify();
    await app.register(whatsappChannelRoutes, {
      authenticator: deps !== undefined ? deps.authenticator : mockAuthenticator,
      workspaceDirectory: deps !== undefined ? deps.workspaceDirectory : mockWorkspaceDirectory,
      outboundDispatchGateway: deps?.outboundDispatchGateway ?? outboundDispatchGateway,
    });
    await app.register(aiCopilotRoutes, {
      authenticator: deps !== undefined ? deps.authenticator : mockAuthenticator,
    });
    await app.register(agentRoutes, {
      authenticator: deps !== undefined ? deps.authenticator : mockAuthenticator,
      workspaceDirectory: deps !== undefined ? deps.workspaceDirectory : mockWorkspaceDirectory,
    });
    await app.register(metaPartnerRoutes, {
      authenticator: deps !== undefined ? deps.authenticator : mockAuthenticator,
      workspaceDirectory: deps !== undefined ? deps.workspaceDirectory : mockWorkspaceDirectory,
    });
    await app.register(abacatePayRoutes, {
      authenticator: deps !== undefined ? deps.authenticator : mockAuthenticator,
      workspaceDirectory: deps !== undefined ? deps.workspaceDirectory : mockWorkspaceDirectory,
      abacateGateway: new AbacatePayGateway('test-only-key', 'https://billing.invalid'),
      webhookSecret: 'test-only-webhook-secret',
    });
    await app.register(autonomousRevenueRoutes, {
      workspaceDirectory: deps !== undefined ? deps.workspaceDirectory : mockWorkspaceDirectory,
    });
    return app;
  }

  it('AUTH-01: WhatsApp QR route returns 401 without Bearer token', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/qr',
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AUTH-02: AI Vision route returns 401 without Bearer token', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/vision/analyze',
      payload: { imageUrl: 'https://example.com/pix.png' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AUTH-03: Agent Bot Status returns 401 without Bearer token', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/journeys/j123/bot/status',
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AUTH-04: Tenant A token returns 403 Forbidden when accessing Tenant B workspaceId in URL params', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/22222222-2222-2222-2222-222222222222/channels/whatsapp/status',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
    });
    expect(res.statusCode).toBe(403);
    const json = JSON.parse(res.payload);
    expect(json.error).toBe('Forbidden');
    await app.close();
  });

  it('AUTH-05: Route returns 401 fail-closed when authenticator is not configured', async () => {
    const app = await buildTestApp({ authenticator: undefined, workspaceDirectory: undefined });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/qr',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AUTH-06: Tenant A token with access to Tenant A workspace passes tenant guard', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/status',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.status).toBe('CONNECTED');
    await app.close();
  });

  it('AUTH-07: Viewer role attempting mutation (logout) returns 403 Forbidden', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/logout',
      headers: { authorization: 'Bearer valid_token_tenant_a_viewer.part2.part3' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-18: Legacy cockpit send only queues a supervised dispatch and never calls a provider directly', async () => {
    const calls: string[] = [];
    const app = await buildTestApp({
      authenticator: mockAuthenticator,
      workspaceDirectory: mockWorkspaceDirectory,
      outboundDispatchGateway: {
        ...outboundDispatchGateway,
        createDraft: async (_actor, input) => {
          calls.push(`draft:${input.workspaceId}:${input.journeyId}:${input.textContent}`);
          return { dispatchId: '30000000-0000-4000-8000-000000000001', status: 'DRAFT', idempotent: false };
        },
        approve: async (_actor, input) => {
          calls.push(`approve:${input.dispatchId}`);
          return { dispatchId: input.dispatchId, status: 'APPROVED', idempotent: false };
        },
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/journeys/30000000-0000-4000-8000-000000000002/send-message',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
      payload: { text: '  Mensagem segura  ' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ success: true, status: 'APPROVED' });
    expect(calls).toEqual([
      'draft:11111111-1111-1111-1111-111111111111:30000000-0000-4000-8000-000000000002:Mensagem segura',
      'approve:30000000-0000-4000-8000-000000000001',
    ]);
    await app.close();
  });

  it('AUTH-19: Legacy cockpit send is denied before creating a draft for another tenant', async () => {
    let calls = 0;
    const app = await buildTestApp({
      authenticator: mockAuthenticator,
      workspaceDirectory: mockWorkspaceDirectory,
      outboundDispatchGateway: {
        ...outboundDispatchGateway,
        createDraft: async () => { calls += 1; return null; },
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/22222222-2222-2222-2222-222222222222/journeys/30000000-0000-4000-8000-000000000002/send-message',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
      payload: { text: 'Não deve enfileirar' },
    });
    expect(response.statusCode).toBe(403);
    expect(calls).toBe(0);
    await app.close();
  });

  it('AUTH-20: WABA group broadcast is rejected instead of reporting a fabricated send', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/groups/broadcast',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
      payload: { engine: 'waba', message: 'Teste', targetGroupIds: ['120000000000@g.us'] },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'WABA_GROUP_BROADCAST_UNSUPPORTED' });
    await app.close();
  });

  it('AUTH-21: WABA contact broadcast is rejected until a supervised Meta pipeline exists', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/broadcast',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
      payload: { engine: 'waba', message: 'Teste', targets: [{ phone: '+5549999999999' }] },
    });
    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({ code: 'WABA_BROADCAST_NOT_IMPLEMENTED' });
    await app.close();
  });

  it('AUTH-08: Clear history route without x-confirm-destruction returns 400 Bad Request', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/clear-history',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
    });
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.payload);
    expect(json.message).toContain('x-confirm-destruction');
    await app.close();
  });

  it('AUTH-08b: operator cannot delete an individual conversation', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/clear-journey',
      headers: {
        authorization: 'Bearer valid_token_tenant_a_operator.part2.part3',
        'x-confirm-destruction': 'CONFIRM_DATA_DELETION',
      },
      payload: { journeyId: '33333333-3333-3333-3333-333333333333' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-09: Viewer cannot mutate Meta Partner configuration', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/messenger/welcome-screen',
      headers: { authorization: 'Bearer valid_token_tenant_a_viewer.part2.part3' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-10: Viewer cannot pause an agent journey', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/journeys/j123/bot/pause',
      headers: { authorization: 'Bearer valid_token_tenant_a_viewer.part2.part3' },
      payload: { reason: 'attempted privilege escalation' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-10b: Viewer cannot enable an agent journey', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/journeys/j123/bot/enable',
      headers: { authorization: 'Bearer valid_token_tenant_a_viewer.part2.part3' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-10c: Viewer cannot disable an agent journey', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/journeys/j123/bot/disable',
      headers: { authorization: 'Bearer valid_token_tenant_a_viewer.part2.part3' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-10d: Workspace agent config returns 401 without a bearer token', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/agent/config',
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AUTH-10e: Viewer cannot publish workspace agent config', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/agent/config',
      headers: { authorization: 'Bearer valid_token_tenant_a_viewer.part2.part3' },
      payload: { autonomyMode: 'autonomous_24_7', runtimeEnabled: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-11: Billing charge returns 401 without a bearer token', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/abacatepay/charges',
      payload: {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        customerName: 'Test Customer',
        customerPhone: '+5549999999999',
        customerEmail: 'customer@example.test',
        productName: 'Test Product',
        priceInCents: 100,
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('AUTH-12: Viewer cannot create a billing charge', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/abacatepay/charges',
      headers: { authorization: 'Bearer valid_token_tenant_a_viewer.part2.part3' },
      payload: {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        customerName: 'Test Customer',
        customerPhone: '+5549999999999',
        customerEmail: 'customer@example.test',
        productName: 'Test Product',
        priceInCents: 100,
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-13: Tenant A owner cannot create a charge for Tenant B', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/abacatepay/charges',
      headers: { authorization: 'Bearer valid_token_tenant_a_owner.part2.part3' },
      payload: {
        workspaceId: '22222222-2222-2222-2222-222222222222',
        customerName: 'Test Customer',
        customerPhone: '+5549999999999',
        customerEmail: 'customer@example.test',
        productName: 'Test Product',
        priceInCents: 100,
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('AUTH-14: Meta Partner rejects a syntactically valid but unknown token', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/messenger/welcome-screen',
      headers: { authorization: 'Bearer unknown_token.part2.part3' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
