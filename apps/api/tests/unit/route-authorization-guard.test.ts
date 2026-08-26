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

describe('Operational Routes JWT Authentication, RBAC & Multi-Tenant Isolation Guards', () => {
  const mockAuthenticator: OperatorAuthenticator = {
    async verifyAccessToken(token: string): Promise<AuthenticatedActor | null> {
      if (token.startsWith('valid_token_tenant_a_owner')) {
        return { userId: 'user_a_owner', email: 'owner@tenant-a.com' };
      }
      if (token.startsWith('valid_token_tenant_a_viewer')) {
        return { userId: 'user_a_viewer', email: 'viewer@tenant-a.com' };
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

  async function buildTestApp(deps?: { authenticator?: OperatorAuthenticator; workspaceDirectory?: WorkspaceDirectory }) {
    const app = Fastify();
    await app.register(whatsappChannelRoutes, {
      authenticator: deps !== undefined ? deps.authenticator : mockAuthenticator,
      workspaceDirectory: deps !== undefined ? deps.workspaceDirectory : mockWorkspaceDirectory,
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
