import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { operatorAuthRoutes } from '../../src/interfaces/http/routes/operator-auth.js';
import {
  WorkspaceOperationalGateway,
  WorkspaceOperationalSettings,
} from '../../src/application/ports/workspace-operational-gateway.js';
import { OperatorAuthenticator } from '../../src/application/ports/operator-authenticator.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const contactId = '22222222-2222-2222-2222-222222222222';
const actorToken = 'valid-token.part2.part3';

function settings(overrides: Partial<WorkspaceOperationalSettings> = {}): WorkspaceOperationalSettings {
  return {
    workspaceId,
    commercialConfig: {},
    loyaltyOverrides: {},
    dailyTargetRevenueMinor: 0,
    slaPolicy: { firstResponseMinutes: 15 },
    updatedAt: null,
    ...overrides,
  };
}

async function buildApp(gateway: WorkspaceOperationalGateway) {
  const app = Fastify();
  const authenticator: OperatorAuthenticator = {
    verifyAccessToken: vi.fn(async (token) => token === actorToken
      ? { userId: 'user-a', email: 'owner@example.test' }
      : null),
  };
  await app.register(operatorAuthRoutes, {
    prefix: '/api/v1',
    authenticator,
    workspaceOperationalGateway: gateway,
  });
  return app;
}

describe('workspace operational routes', () => {
  it('fails closed without a bearer token', async () => {
    const gateway: WorkspaceOperationalGateway = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      updateContactName: vi.fn(),
    };
    const app = await buildApp(gateway);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/operational-settings`,
    });

    expect(response.statusCode).toBe(401);
    expect(gateway.getSettings).not.toHaveBeenCalled();
    await app.close();
  });

  it('reads and updates settings through the authenticated gateway', async () => {
    const gateway: WorkspaceOperationalGateway = {
      getSettings: vi.fn(async () => settings()),
      updateSettings: vi.fn(async (_actor, _workspace, input) => settings({
        commercialConfig: input.commercialConfig ?? {},
        loyaltyOverrides: input.loyaltyOverrides ?? {},
        dailyTargetRevenueMinor: input.dailyTargetRevenueMinor ?? 0,
        slaPolicy: input.slaPolicy ?? { firstResponseMinutes: 15 },
        updatedAt: '2026-08-31T00:00:00.000Z',
      })),
      updateContactName: vi.fn(),
    };
    const app = await buildApp(gateway);
    const headers = { authorization: `Bearer ${actorToken}` };

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/operational-settings`,
      headers,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ data: { workspaceId, dailyTargetRevenueMinor: 0 } });

    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceId}/operational-settings`,
      headers,
      payload: {
        commercialConfig: { businessName: 'Cliente real', pixKey: 'pix-real' },
        loyaltyOverrides: { [contactId]: 'RECURRING' },
        dailyTargetRevenueMinor: 125000,
        slaPolicy: { firstResponseMinutes: 10 },
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      data: {
        commercialConfig: { businessName: 'Cliente real', pixKey: 'pix-real' },
        loyaltyOverrides: { [contactId]: 'RECURRING' },
        dailyTargetRevenueMinor: 125000,
        slaPolicy: { firstResponseMinutes: 10 },
      },
    });
    expect(gateway.updateSettings).toHaveBeenCalledTimes(1);
    expect(gateway.updateSettings).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      expect.objectContaining({ slaPolicy: { firstResponseMinutes: 10 } }),
    );

    await app.close();
  });

  it('rejects malformed input before touching the gateway', async () => {
    const gateway: WorkspaceOperationalGateway = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      updateContactName: vi.fn(),
    };
    const app = await buildApp(gateway);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceId}/operational-settings`,
      headers: { authorization: `Bearer ${actorToken}` },
      payload: { dailyTargetRevenueMinor: -1 },
    });

    expect(response.statusCode).toBe(422);
    expect(gateway.updateSettings).not.toHaveBeenCalled();
    await app.close();
  });

  it('updates a contact only through the authenticated workspace-scoped gateway', async () => {
    const gateway: WorkspaceOperationalGateway = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      updateContactName: vi.fn(async () => ({ contactId, name: 'Nome persistido' })),
    };
    const app = await buildApp(gateway);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceId}/contacts/${contactId}`,
      headers: { authorization: `Bearer ${actorToken}` },
      payload: { name: 'Nome persistido' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { contactId, name: 'Nome persistido' } });
    expect(gateway.updateContactName).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
