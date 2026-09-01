import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { operatorAuthRoutes } from '../../src/interfaces/http/routes/operator-auth.js';
import { OperatorAuthenticator } from '../../src/application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../src/application/ports/workspace-directory.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const otherWorkspaceId = '22222222-2222-2222-2222-222222222222';
const actorToken = 'valid-token.part2.part3';
const actor = { userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'owner@example.test' };

async function buildApp(directory: WorkspaceDirectory) {
  const app = Fastify();
  const authenticator: OperatorAuthenticator = {
    verifyAccessToken: vi.fn(async (token) => token === actorToken ? actor : null),
  };
  await app.register(operatorAuthRoutes, { prefix: '/api/v1', authenticator, workspaceDirectory: directory });
  return app;
}

describe('workspace member route', () => {
  const directory: WorkspaceDirectory = {
    listForActor: vi.fn(async () => [{ id: workspaceId, name: 'Workspace A', slug: 'a', role: 'owner' }]),
    listMembers: vi.fn(async () => [{
      membershipId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      userId: actor.userId,
      role: 'owner',
      createdAt: '2026-09-01T00:00:00.000Z',
    }]),
  };

  it('fails closed without authentication', async () => {
    const app = await buildApp(directory);
    const response = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceId}/members` });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns only persisted memberships after workspace access is verified', async () => {
    const app = await buildApp(directory);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: { authorization: `Bearer ${actorToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ userId: actor.userId, role: 'owner', isCurrentActor: true }] });
    await app.close();
  });

  it('rejects a workspace outside the authenticated actor membership', async () => {
    const app = await buildApp(directory);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${otherWorkspaceId}/members`,
      headers: { authorization: `Bearer ${actorToken}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
