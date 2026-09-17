import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { whatsappChannelRoutes } from '../../src/interfaces/http/routes/whatsapp-channel-routes.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(whatsappChannelRoutes, {
    authenticator: { verifyAccessToken: vi.fn().mockResolvedValue({ userId: '30000000-0000-4000-8000-000000000003' }) },
    workspaceDirectory: { listForActor: vi.fn().mockResolvedValue([{ id: workspaceId, name: 'Workspace', slug: 'workspace', role: 'owner' }]) },
  });
  return app;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('WABA OAuth security boundary', () => {
  it.each(['send-template', 'send-buttons', 'send-list', 'send-media', 'send-flow'])('retires direct WABA endpoint %s in favor of supervised dispatch', async (action) => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/${action}`,
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'WABA_DIRECT_SEND_RETIRED' });
    await app.close();
  });

  it('rejects an OAuth code when the server has no configured OAuth client, even if the browser supplies a secret', async () => {
    vi.stubEnv('META_ID_APP', '');
    vi.stubEnv('META_APP_SECRET', '');
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/oauth-connect`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: { code: 'authorization-code', appId: 'browser-app', appSecret: 'browser-secret' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'META_OAUTH_SERVER_CONFIGURATION_REQUIRED' });
    await app.close();
  });

  it('rejects a browser-selected OAuth app that differs from the server configuration before calling Meta', async () => {
    vi.stubEnv('META_ID_APP', 'server-app');
    vi.stubEnv('META_APP_SECRET', 'server-secret');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/oauth-connect`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: { code: 'authorization-code', appId: 'another-app' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'META_OAUTH_APP_MISMATCH' });
    expect(fetch).not.toHaveBeenCalled();
    await app.close();
  });

  it('uses the server OAuth client for the code exchange and does not expose upstream errors', async () => {
    vi.stubEnv('META_ID_APP', 'server-app');
    vi.stubEnv('META_APP_SECRET', 'server-secret');
    const fetch = vi.fn().mockRejectedValue(new Error('upstream secret detail'));
    vi.stubGlobal('fetch', fetch);
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/oauth-connect`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: { code: 'authorization-code', appId: 'server-app', appSecret: 'browser-secret' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'META_OAUTH_CODE_EXCHANGE_UNAVAILABLE' });
    expect(response.body).not.toContain('upstream secret detail');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('client_id=server-app'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('client_secret=server-secret'));
    expect(fetch.mock.calls[0][0]).not.toContain('browser-secret');
    await app.close();
  });
});
