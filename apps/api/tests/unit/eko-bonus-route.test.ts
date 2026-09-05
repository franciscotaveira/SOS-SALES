import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { caktoBillingRoutes } from '../../src/interfaces/http/routes/cakto-billing-routes.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';

function buildApp(subscriptionRow: Record<string, unknown> | null) {
  const query = vi.fn().mockResolvedValue({
    rowCount: subscriptionRow ? 1 : 0,
    rows: subscriptionRow ? [subscriptionRow] : [],
  });
  const app = Fastify({ logger: false });
  app.register(caktoBillingRoutes, {
    databasePool: {
      query,
      connect: vi.fn(),
    },
    authenticator: {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId: '30000000-0000-4000-8000-000000000003' }),
    },
    workspaceDirectory: {
      listForActor: vi.fn().mockResolvedValue([
        { id: workspaceId, name: 'Workspace', slug: 'workspace', role: 'owner' },
      ]),
    },
  });
  return { app, query };
}

describe('EKO bonus delivery route', () => {
  it('returns the kit only for a current workspace entitlement', async () => {
    const { app, query } = buildApp({ status: 'active', accessUntil: null, currentPeriodEnd: null });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/bonuses/eko`,
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.eligible).toBe(true);
    expect(body.data.modules).toHaveLength(6);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('workspace_subscriptions'), [workspaceId]);
    await app.close();
  });

  it('keeps the content locked when the subscription is canceled', async () => {
    const { app } = buildApp({ status: 'canceled', accessUntil: new Date(Date.now() + 86_400_000), currentPeriodEnd: null });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/bonuses/eko`,
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.eligible).toBe(false);
    expect(body.data.modules).toEqual([]);
    expect(body.data.claimRequired).toBe(true);
    await app.close();
  });

  it('requires the verified operator session before exposing subscription state', async () => {
    const { app } = buildApp({ status: 'active' });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/bonuses/eko`,
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

