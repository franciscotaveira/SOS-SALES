import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { operatorAuthRoutes } from '../../src/interfaces/http/routes/operator-auth.js';
import { OperatorAuthenticator } from '../../src/application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../src/application/ports/workspace-directory.js';
import { WorkspaceMembershipGateway } from '../../src/application/ports/workspace-membership-gateway.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';
const otherWorkspaceId = '22222222-2222-2222-2222-222222222222';
const actorToken = 'valid-token.part2.part3';
const actor = { userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'owner@example.test' };

async function buildApp(directory: WorkspaceDirectory, members: WorkspaceMembershipGateway) {
  const app = Fastify();
  const authenticator: OperatorAuthenticator = {
    verifyAccessToken: vi.fn(async (token) => token === actorToken ? actor : null),
  };
  await app.register(operatorAuthRoutes, { prefix: '/api/v1', authenticator, workspaceDirectory: directory, workspaceMembershipGateway: members });
  return app;
}

describe('workspace member route', () => {
  const directory: WorkspaceDirectory = {
    listForActor: vi.fn(async () => [{ id: workspaceId, name: 'Workspace A', slug: 'a', role: 'owner' }]),
  };
  const members: WorkspaceMembershipGateway = {
    listMembers: vi.fn(async (_actor, requestedWorkspaceId) => {
      if (requestedWorkspaceId !== workspaceId) throw new Error('WORKSPACE_MEMBERSHIP_FORBIDDEN');
      return [{
      membershipId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      userId: actor.userId,
      email: actor.email,
      role: 'owner',
      createdAt: '2026-09-01T00:00:00.000Z',
      }];
    }),
    createInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
    removeMember: vi.fn(),
  };

  it('fails closed without authentication', async () => {
    const app = await buildApp(directory, members);
    const response = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceId}/members` });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns only persisted memberships after workspace access is verified', async () => {
    const app = await buildApp(directory, members);
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
    const app = await buildApp(directory, members);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${otherWorkspaceId}/members`,
      headers: { authorization: `Bearer ${actorToken}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('allows only an owner to create a one-time invitation', async () => {
    const createInvitation = vi.fn(async () => ({
      code: 'safe-one-time-code-123456789',
      email: 'operator@example.test',
      role: 'operator' as const,
      expiresAt: '2026-09-08T00:00:00.000Z',
    }));
    const app = await buildApp(directory, { ...members, createInvitation });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/member-invitations`,
      headers: { authorization: `Bearer ${actorToken}` },
      payload: { email: 'operator@example.test', role: 'operator' },
    });
    expect(response.statusCode).toBe(201);
    expect(createInvitation).toHaveBeenCalledWith(actor, workspaceId, { email: 'operator@example.test', role: 'operator' });
    await app.close();
  });

  it('accepts a valid invitation only through the authenticated actor', async () => {
    const acceptInvitation = vi.fn(async () => ({ workspaceId, role: 'operator' as const }));
    const app = await buildApp(directory, { ...members, acceptInvitation });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspace-member-invitations/accept',
      headers: { authorization: `Bearer ${actorToken}` },
      payload: { code: 'safe-one-time-code-123456789' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { workspaceId, role: 'operator' } });
    expect(acceptInvitation).toHaveBeenCalledWith(actor, 'safe-one-time-code-123456789');
    await app.close();
  });

  it('does not remove owners through the member endpoint', async () => {
    const removeMember = vi.fn(async () => { throw new Error('WORKSPACE_MEMBER_NOT_REMOVABLE_OR_NOT_FOUND'); });
    const app = await buildApp(directory, { ...members, removeMember });
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspaceId}/members/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`,
      headers: { authorization: `Bearer ${actorToken}` },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
