import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { metaBusinessAgentRoutes } from '../../src/interfaces/http/routes/meta-business-agent-routes.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const journeyId = '20000000-0000-4000-8000-000000000002';

function buildRouteApp(overrides: {
  query?: ReturnType<typeof vi.fn>;
  controlThread?: ReturnType<typeof vi.fn>;
} = {}) {
  const app = Fastify({ logger: false });
  const query = overrides.query || vi.fn()
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: journeyId,
        channel_connection_id: '40000000-0000-4000-8000-000000000004',
        provider: 'meta_cloud',
        channel_status: 'CONNECTED',
        contact_phone: '+5549999999999',
      }],
    })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: journeyId, responder_owner: 'sos_sales' }] });
  const controlThread = overrides.controlThread || vi.fn().mockResolvedValue({ messagingProduct: 'whatsapp' });

  app.register(metaBusinessAgentRoutes, {
    authenticator: { verifyAccessToken: vi.fn().mockResolvedValue({ userId: '30000000-0000-4000-8000-000000000003' }) },
    workspaceDirectory: { listForActor: vi.fn().mockResolvedValue([{ id: workspaceId, name: 'Workspace', slug: 'workspace', role: 'operator' }]) },
    metaBusinessAgentGateway: { controlThread },
    query,
  });

  return { app, query, controlThread };
}

describe('Meta Business Agent thread control route', () => {
  it('persists SOS ownership only after Meta accepts a take', async () => {
    const { app, query, controlThread } = buildRouteApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/meta-business-agent/thread-control`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: { action: 'take', to: '+5549999999999', journeyId },
    });

    expect(response.statusCode).toBe(200);
    expect(controlThread).toHaveBeenCalledWith(workspaceId, {
      action: 'take',
      to: '+5549999999999',
      channelConnectionId: '40000000-0000-4000-8000-000000000004',
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE public.commercial_journeys'),
      [journeyId, workspaceId, 'sos_sales', 'meta_thread_control_take'],
    );
    expect(response.json()).toMatchObject({ journeyId, responderOwner: 'sos_sales' });
    await app.close();
  });

  it('does not call Meta for an unknown local journey', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const controlThread = vi.fn();
    const { app } = buildRouteApp({ query, controlThread });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/meta-business-agent/thread-control`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: { action: 'release', to: '+5549999999999', journeyId },
    });

    expect(response.statusCode).toBe(404);
    expect(controlThread).not.toHaveBeenCalled();
    await app.close();
  });
});
