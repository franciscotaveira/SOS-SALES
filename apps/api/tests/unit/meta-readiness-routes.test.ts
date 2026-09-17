import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { metaReadinessRoutes } from '../../src/interfaces/http/routes/meta-readiness-routes.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';

function buildApp(query: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  app.register(metaReadinessRoutes, {
    authenticator: { verifyAccessToken: vi.fn().mockResolvedValue({ userId: '30000000-0000-4000-8000-000000000003' }) },
    workspaceDirectory: { listForActor: vi.fn().mockResolvedValue([{ id: workspaceId, name: 'Workspace', slug: 'workspace', role: 'viewer' }]) },
    query,
  });
  return app;
}

describe('Meta readiness route', () => {
  it('reports only local evidence and keeps unproven handoff warning', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ provider: 'meta_cloud', id: 'channel-1', status: 'CONNECTED', public_config: { phoneNumberId: 'phone-1', wabaId: 'waba-1', metaPixelId: 'pixel-1', metaCapiEnabled: true }, bearer_token_available: true, capi_token_available: true }] })
      .mockResolvedValueOnce({ rows: [{ runtime_enabled: true, responder_mode: 'sos_sales', meta_agent_eligibility_status: 'ELIGIBLE', meta_agent_activation_status: 'READY', meta_agent_ready_at: new Date() }] });
    const app = buildApp(query);

    const response = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceId}/meta-readiness`, headers: { authorization: 'Bearer valid.jwt.token' } });

    expect(response.statusCode).toBe(200);
    const payload = response.json().data;
    expect(payload.scope).toBe('LOCAL_CONFIGURATION_ONLY');
    expect(payload.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'WABA_BINDING', status: 'HEALTHY' }),
      expect.objectContaining({ key: 'CLOUD_API_CREDENTIAL', status: 'HEALTHY' }),
      expect.objectContaining({ key: 'CAPI_CONFIGURATION', status: 'HEALTHY' }),
      expect.objectContaining({ key: 'BUSINESS_AGENT', status: 'HEALTHY' }),
      expect.objectContaining({ key: 'HUMAN_HANDOFF', status: 'WARNING' }),
    ]));
    await app.close();
  });

  it('fails closed when there is more than one connected Meta channel', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [
        { provider: 'meta_cloud', id: 'channel-1', status: 'CONNECTED', public_config: { phoneNumberId: 'phone-1', wabaId: 'waba-1' }, bearer_token_available: true, capi_token_available: false },
        { provider: 'meta_cloud', id: 'channel-2', status: 'CONNECTED', public_config: { phoneNumberId: 'phone-2', wabaId: 'waba-2' }, bearer_token_available: true, capi_token_available: false },
      ] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp(query);

    const response = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceId}/meta-readiness`, headers: { authorization: 'Bearer valid.jwt.token' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'WABA_BINDING', status: 'BLOCKED' }),
      expect.objectContaining({ key: 'CLOUD_API_CREDENTIAL', status: 'UNKNOWN' }),
    ]));
    await app.close();
  });

  it.each([
    { name: 'disconnected history', provider: 'meta_cloud', pixel: 'pixel', enabled: true, secret: true, old: true, capi: 'HEALTHY', binding: 'HEALTHY' },
    { name: 'WAHA tracking', provider: 'waha', pixel: 'pixel', enabled: true, secret: true, old: false, capi: 'HEALTHY', binding: 'BLOCKED' },
    { name: 'empty identifier', provider: 'meta_cloud', pixel: '', enabled: true, secret: true, old: false, capi: 'WARNING', binding: 'HEALTHY' },
    { name: 'whitespace identifier', provider: 'meta_cloud', pixel: '   ', enabled: true, secret: true, old: false, capi: 'WARNING', binding: 'HEALTHY' },
    { name: 'disabled CAPI', provider: 'meta_cloud', pixel: 'pixel', enabled: false, secret: true, old: false, capi: 'WARNING', binding: 'HEALTHY' },
    { name: 'missing CAPI credential', provider: 'meta_cloud', pixel: 'pixel', enabled: true, secret: false, old: false, capi: 'WARNING', binding: 'HEALTHY' },
  ])('handles $name without a false readiness claim', async (scenario) => {
    const channel = { id: 'active', provider: scenario.provider, status: 'CONNECTED',
      public_config: { phoneNumberId: 'phone', wabaId: 'waba', metaDatasetId: scenario.pixel, metaCapiEnabled: scenario.enabled },
      bearer_token_available: true, capi_token_available: scenario.secret };
    const rows = scenario.old ? [channel, { ...channel, id: 'old', status: 'DISCONNECTED' }] : [channel];
    const query = vi.fn().mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [] });
    const app = buildApp(query);
    const response = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceId}/meta-readiness`, headers: { authorization: 'Bearer valid.jwt.token' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'WABA_BINDING', status: scenario.binding }),
      expect.objectContaining({ key: 'CAPI_CONFIGURATION', status: scenario.capi }),
    ]));
    expect(query.mock.calls[0][0]).toContain("cc.status = 'CONNECTED'");
    expect(query.mock.calls[0][0]).toContain("NULLIF(BTRIM(cs.secret_payload->>'accessToken'), '') IS NOT NULL");
    expect(query.mock.calls[0][1]).toEqual([workspaceId]);
    await app.close();
  });

  it('rejects a caller without workspace access', async () => {
    const app = Fastify({ logger: false });
    app.register(metaReadinessRoutes, {
      authenticator: { verifyAccessToken: vi.fn().mockResolvedValue({ userId: '30000000-0000-4000-8000-000000000003' }) },
      workspaceDirectory: { listForActor: vi.fn().mockResolvedValue([]) },
      query: vi.fn(),
    });
    const response = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceId}/meta-readiness`, headers: { authorization: 'Bearer valid.jwt.token' } });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
