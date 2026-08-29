import { describe, expect, it, vi } from 'vitest';
import { WorkspaceProvisioningGateway } from '../../src/application/ports/workspace-provisioning-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const actorWithWorkspace = {
  userId: 'usr-has-ws',
  email: 'dono@clinica.com.br',
  workspaceIds: ['w1000000-0000-4000-8000-000000000001'],
  globalRole: 'authenticated' as const,
};

const actorWithoutWorkspace = {
  userId: 'usr-no-ws',
  email: 'novo@odontologia.com.br',
  workspaceIds: [],
  globalRole: 'authenticated' as const,
};

function createApp(workspaceProvisioningGateway: WorkspaceProvisioningGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha',
      verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'evt', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED', reason: 'test' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'e', workspaceId: 'w', isDuplicate: false }) },
    authenticator: {
      verifyAccessToken: async (token) => {
        if (token === 'existing.jwt.token') return actorWithWorkspace;
        if (token === 'newuser.jwt.token') return actorWithoutWorkspace;
        throw new Error('Invalid token');
      },
    },
    workspaceProvisioningGateway,
    logger: false,
    rateLimit: false,
  });
}

describe('Workspace Init API — /api/v1/workspaces/init', () => {
  it('WS-INIT-01: initializes a new workspace for a first-time user (201 Created)', async () => {
    const mockGateway: WorkspaceProvisioningGateway = {
      actorHasWorkspace: vi.fn().mockResolvedValue(false),
      initializeForActor: vi.fn().mockResolvedValue({
        workspaceId: 'w2000000-0000-4000-8000-000000000002',
        workspaceName: 'Odonto VIP',
        membershipId: 'm2000000-0000-4000-8000-000000000002',
        role: 'owner',
        channelConnectionId: 'c2000000-0000-4000-8000-000000000002',
        isExisting: false,
      }),
      createClientWorkspace: vi.fn(),
    };

    const server = createApp(mockGateway);
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workspaces/init',
      headers: { authorization: 'Bearer newuser.jwt.token' },
      payload: { workspaceName: 'Odonto VIP' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.workspaceName).toBe('Odonto VIP');
    expect(body.data.role).toBe('owner');
    expect(body.data.isExisting).toBe(false);
  });

  it('WS-INIT-02: returns existing primary workspace idempotently on repeated call (200 OK)', async () => {
    const mockGateway: WorkspaceProvisioningGateway = {
      actorHasWorkspace: vi.fn().mockResolvedValue(true),
      initializeForActor: vi.fn().mockResolvedValue({
        workspaceId: 'w1000000-0000-4000-8000-000000000001',
        workspaceName: 'Clínica Sorriso',
        membershipId: 'm1000000-0000-4000-8000-000000000001',
        role: 'owner',
        channelConnectionId: 'c1000000-0000-4000-8000-000000000001',
        isExisting: true,
      }),
      createClientWorkspace: vi.fn(),
    };

    const server = createApp(mockGateway);
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workspaces/init',
      headers: { authorization: 'Bearer existing.jwt.token' },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.workspaceName).toBe('Clínica Sorriso');
    expect(body.data.isExisting).toBe(true);
  });

  it('WS-INIT-03: rejects unauthenticated requests with 401 Unauthorized', async () => {
    const mockGateway: WorkspaceProvisioningGateway = {
      actorHasWorkspace: vi.fn(),
      initializeForActor: vi.fn(),
      createClientWorkspace: vi.fn(),
    };

    const server = createApp(mockGateway);
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workspaces/init',
      payload: { workspaceName: 'Hack Attempt' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('WS-CLIENT-01: provisions a disconnected client workspace through the backend contract', async () => {
    const createClientWorkspace = vi.fn().mockResolvedValue({
      workspaceId: '20000000-0000-4000-8000-000000000002',
      workspaceName: 'Jacob Adv',
      membershipId: '21000000-0000-4000-8000-000000000002',
      role: 'owner',
      channelConnectionId: '22000000-0000-4000-8000-000000000002',
      slug: 'jacob-adv-a1b2c3d4',
      channelProvider: 'meta_cloud',
      channelStatus: 'DISCONNECTED',
      ownerAccess: 'agency_owner',
    });
    const gateway = {
      actorHasWorkspace: vi.fn(),
      initializeForActor: vi.fn(),
      createClientWorkspace,
    } as WorkspaceProvisioningGateway;
    const server = createApp(gateway);

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/workspaces/10000000-0000-4000-8000-000000000001/client-workspaces',
      headers: { authorization: 'Bearer existing.jwt.token' },
      payload: {
        name: 'Jacob Adv',
        businessType: 'general_services',
        tagline: 'Escritório de advocacia migratória',
        ownerEmail: '',
        whatsappNumber: '+1 (508) 250 1315',
        provider: 'waba',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      workspaceName: 'Jacob Adv',
      channelProvider: 'meta_cloud',
      channelStatus: 'DISCONNECTED',
    });
    expect(createClientWorkspace).toHaveBeenCalledWith(
      actorWithWorkspace,
      expect.objectContaining({ parentWorkspaceId: '10000000-0000-4000-8000-000000000001' }),
    );
  });
});
