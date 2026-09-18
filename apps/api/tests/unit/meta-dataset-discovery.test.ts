import {afterEach, expect, it, vi} from 'vitest';
import Fastify from 'fastify';
import {whatsappChannelRoutes} from '../../src/interfaces/http/routes/whatsapp-channel-routes.js';
import {dbPool} from '../../src/infrastructure/database/pool.js';

vi.mock('../../src/infrastructure/database/pool.js', () => ({dbPool: {query: vi.fn()}}));
afterEach(() => vi.unstubAllGlobals());

it.each([true, false])('discovers workspace datasets and keeps pixel discovery when WABA access succeeds=%s', async (wabaAccessible) => {
  vi.mocked(dbPool.query).mockResolvedValue({rows: [{public_config: {wabaId: '1749193841879179'}}]} as never);
  const fetch = vi.fn(async (url: string) => ({
    ok: !url.endsWith('/dataset') || wabaAccessible,
    json: async () => url.endsWith('/1749193841879179/dataset')
      ? {data: [{id: 'messaging-dataset'}]}
      : url.includes('debug_token')
      ? {data: {granular_scopes: [{target_ids: ['waba-not-a-dataset']}]}}
      : url.includes('/me/adaccounts')
        ? {data: [{name: 'Haven', pixels: {data: [{id: 'confirmed-pixel', name: 'Haven events'}]}}]}
        : {data: [{name: 'Haven business', owned_pixels: {data: [{id: 'confirmed-pixel', name: 'Haven events'}]}}]},
  }));
  vi.stubGlobal('fetch', fetch);
  const workspace = '11111111-1111-1111-1111-111111111111';
  const app = Fastify();
  await app.register(whatsappChannelRoutes, {
    authenticator: {verifyAccessToken: async () => ({userId: 'owner'})},
    workspaceDirectory: {listForActor: async () => [{id: workspace, name: 'Test', slug: 'test', role: 'owner'}]},
  });
  try {
    const response = await app.inject({method: 'POST', url: `/api/v1/workspaces/${workspace}/tracking/meta/list-datasets`, headers: {authorization: 'Bearer valid.jwt.token'}, payload: {accessToken: 'test-token'}});
    expect(response.statusCode).toBe(200);
    expect(response.json().datasets.map((item: {id: string}) => item.id)).toEqual(wabaAccessible ? ['messaging-dataset', 'confirmed-pixel'] : ['confirmed-pixel']);
    expect(dbPool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE workspace_id=$1'), [workspace]);
    expect(fetch.mock.calls.some(([url]) => url.includes('debug_token'))).toBe(false);
  } finally {
    await app.close();
  }
});
