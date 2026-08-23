import { FastifyReply, FastifyRequest } from 'fastify';
import { OperatorAuthenticator, AuthenticatedActor } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { normalizeWorkspaceUuid } from '../routes/whatsapp-channel-routes.js';

export function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2})$/.exec(authorization);
  return match?.[1] ?? null;
}

export function unauthorized(reply: FastifyReply, message = 'Invalid or missing bearer token'): FastifyReply {
  return reply.code(401).send({
    statusCode: 401,
    error: 'Unauthorized',
    message,
  });
}

export function forbidden(reply: FastifyReply, message = 'Access to this workspace is forbidden for this user'): FastifyReply {
  return reply.code(403).send({
    statusCode: 403,
    error: 'Forbidden',
    message,
  });
}

export async function verifyOperatorAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  authenticator?: OperatorAuthenticator
): Promise<AuthenticatedActor | null> {
  // If already verified by parent hook
  if (request.operatorActor && request.operatorActor.userId) {
    return request.operatorActor;
  }

  const token = readBearerToken(request.headers.authorization);
  if (!token || !authenticator) {
    unauthorized(reply);
    return null;
  }

  try {
    const actor = await authenticator.verifyAccessToken(token);
    if (!actor || !actor.userId || !actor.userId.trim()) {
      unauthorized(reply);
      return null;
    }
    request.operatorActor = actor;
    return actor;
  } catch {
    unauthorized(reply);
    return null;
  }
}

export async function assertTenantAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  rawWorkspaceId: string,
  actor: AuthenticatedActor,
  workspaceDirectory?: WorkspaceDirectory,
  requiredRole?: 'viewer' | 'operator' | 'owner'
): Promise<boolean> {
  const normWs = normalizeWorkspaceUuid(rawWorkspaceId);
  if (!normWs) {
    reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid workspace identifier',
    });
    return false;
  }

  if (!workspaceDirectory) {
    forbidden(reply, 'Workspace directory is required for access verification');
    return false;
  }

  try {
    const allowedWorkspaces = await workspaceDirectory.listForActor(actor);
    const membership = allowedWorkspaces.find((ws) => ws.id === normWs);
    if (!membership) {
      forbidden(reply);
      return false;
    }

    if (requiredRole && requiredRole !== 'viewer') {
      const userRole = membership.role || 'viewer';
      if (requiredRole === 'owner' && userRole !== 'owner') {
        forbidden(reply, 'Owner role is required for this operation');
        return false;
      }
      if (requiredRole === 'operator' && userRole !== 'owner' && userRole !== 'operator') {
        forbidden(reply, 'Operator or Owner role is required for this operation');
        return false;
      }
    }
  } catch {
    // In case of directory error, fail closed
    forbidden(reply);
    return false;
  }

  return true;
}
