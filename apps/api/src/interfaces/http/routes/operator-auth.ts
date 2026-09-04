import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OperatorAuthenticator, AuthenticatedActor } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { CockpitReadGateway } from '../../../application/ports/cockpit-read-gateway.js';
import { HandoffOperationsGateway } from '../../../application/ports/handoff-operations-gateway.js';
import { JourneyOperationsGateway } from '../../../application/ports/journey-operations-gateway.js';
import { CommercialOutcomeGateway } from '../../../application/ports/commercial-outcome-gateway.js';
import { OutboundDispatchGateway } from '../../../application/ports/outbound-dispatch-gateway.js';
import { TrafficProofGateway } from '../../../application/ports/traffic-proof-gateway.js';
import { KnownFactOperationsGateway } from '../../../application/ports/known-fact-operations-gateway.js';
import { AppointmentGateway } from '../../../application/ports/appointment-gateway.js';
import { NotesGateway } from '../../../application/ports/notes-gateway.js';
import { WorkspaceProvisioningGateway } from '../../../application/ports/workspace-provisioning-gateway.js';
import { WorkspaceOperationalGateway } from '../../../application/ports/workspace-operational-gateway.js';
import { WorkspaceMembershipGateway } from '../../../application/ports/workspace-membership-gateway.js';
import { cockpitReadRoutes } from './cockpit-read.js';
import { handoffOperationRoutes } from './handoff-operations.js';
import { journeyOperationRoutes } from './journey-operations.js';
import { commercialOutcomeRoutes } from './commercial-outcomes.js';
import { outboundDispatchRoutes } from './outbound-dispatches.js';
import { trafficProofRoutes } from './traffic-proof.js';
import { knownFactOperationRoutes } from './known-fact-operations.js';
import { appointmentRoutes } from './appointments.js';
import { notesRoutes } from './notes.js';
import { workspaceInitRoutes } from './workspace-init.js';
import { atlasToolsRoutes } from './atlas-tools.js';
import { autonomousRevenueRoutes } from './autonomous-revenue-routes.js';
import { workspaceOperationalRoutes } from './workspace-operational.js';
import { normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';
import { canonicalUuid } from '../validation.js';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifyRequest {
    operatorActor?: AuthenticatedActor;
  }
}

export interface OperatorAuthRouteDependencies {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  cockpitReadGateway?: CockpitReadGateway;
  handoffOperationsGateway?: HandoffOperationsGateway;
  journeyOperationsGateway?: JourneyOperationsGateway;
  commercialOutcomeGateway?: CommercialOutcomeGateway;
  outboundDispatchGateway?: OutboundDispatchGateway;
  trafficProofGateway?: TrafficProofGateway;
  knownFactOperationsGateway?: KnownFactOperationsGateway;
  appointmentGateway?: AppointmentGateway;
  notesGateway?: NotesGateway;
  workspaceProvisioningGateway?: WorkspaceProvisioningGateway;
  workspaceOperationalGateway?: WorkspaceOperationalGateway;
  workspaceMembershipGateway?: WorkspaceMembershipGateway;
}

const workspaceMemberBodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(['operator', 'viewer']),
}).strict();

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  // Supabase access tokens are compact JWTs (three base64url segments). Reject
  // malformed schemes before invoking any verifier or downstream dependency.
  const match = /^Bearer ([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2})$/.exec(authorization);
  return match?.[1] ?? null;
}

function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({
    statusCode: 401,
    error: 'Unauthorized',
    message: 'Invalid or missing bearer token',
  });
}

export async function operatorAuthRoutes(
  app: FastifyInstance,
  dependencies: OperatorAuthRouteDependencies,
): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token || !dependencies.authenticator) {
      return unauthorized(reply);
    }

    try {
      const actor = await dependencies.authenticator.verifyAccessToken(token);
      if (!actor || !actor.userId || !actor.userId.trim()) {
        return unauthorized(reply);
      }
      request.operatorActor = actor;
    } catch {
      // Verification failures, including invalid signatures or JWKS outages,
      // intentionally use the same response to avoid leaking auth internals.
      return unauthorized(reply);
    }
  });

  app.get('/me', async (request, reply) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply);
    return {
      id: actor.userId,
      ...(actor.email ? { email: actor.email } : {}),
    };
  });

  app.get('/workspaces', async (request, reply) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply);
    if (!dependencies.workspaceDirectory) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Workspace directory is not configured',
      });
    }

    try {
      const workspaces = await dependencies.workspaceDirectory.listForActor(actor);
      return { data: workspaces };
    } catch {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Workspace directory is unavailable',
      });
    }
  });

  app.get('/workspaces/:workspaceId/members', async (request, reply) => {
    const actor = request.operatorActor;
    const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId?: string }).workspaceId || '');
    if (!actor) return unauthorized(reply);
    if (!workspaceId) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid workspace identifier' });
    }
    if (!dependencies.workspaceMembershipGateway) {
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is not configured' });
    }

    try {
      const members = await dependencies.workspaceMembershipGateway.listMembers(actor, workspaceId);
      return { data: members.map((member) => ({ ...member, isCurrentActor: member.userId === actor.userId })) };
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKSPACE_MEMBERSHIP_FORBIDDEN') {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access to this workspace is forbidden for this user' });
      }
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is unavailable' });
    }
  });

  app.post('/workspaces/:workspaceId/member-invitations', async (request, reply) => {
    const actor = request.operatorActor;
    const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId?: string }).workspaceId || '');
    const body = workspaceMemberBodySchema.safeParse(request.body);
    if (!actor) return unauthorized(reply);
    if (!workspaceId || !body.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid member request' });
    if (!dependencies.workspaceMembershipGateway) return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is not configured' });
    try {
      const invitation = await dependencies.workspaceMembershipGateway.createInvitation(actor, workspaceId, body.data);
      return reply.code(201).send({ data: invitation });
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKSPACE_MEMBERSHIP_FORBIDDEN') return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Owner role is required for this operation' });
      request.log.warn({ error, workspaceId }, 'Unable to create workspace member invitation');
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is unavailable' });
    }
  });

  app.post('/workspace-member-invitations/accept', async (request, reply) => {
    const actor = request.operatorActor;
    const body = z.object({ code: z.string().trim().min(20).max(256) }).strict().safeParse(request.body);
    if (!actor) return unauthorized(reply);
    if (!body.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid invitation code' });
    if (!dependencies.workspaceMembershipGateway) return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is not configured' });
    try {
      const access = await dependencies.workspaceMembershipGateway.acceptInvitation(actor, body.data.code);
      return { data: access };
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKSPACE_MEMBER_EMAIL_REQUIRED') return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Your account must have a verified email to accept an invitation' });
      if (error instanceof Error && ['WORKSPACE_MEMBER_INVITATION_INVALID', 'WORKSPACE_MEMBER_INVITATION_EMAIL_MISMATCH'].includes(error.message)) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Invitation code is invalid, expired, already used, or belongs to a different email' });
      request.log.warn({ error }, 'Unable to accept workspace member invitation');
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is unavailable' });
    }
  });

  app.delete('/workspaces/:workspaceId/members/:membershipId', async (request, reply) => {
    const actor = request.operatorActor;
    const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId?: string }).workspaceId || '');
    const membershipId = canonicalUuid.safeParse((request.params as { membershipId?: string }).membershipId);
    if (!actor) return unauthorized(reply);
    if (!workspaceId || !membershipId.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid member request' });
    if (!dependencies.workspaceMembershipGateway) return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is not configured' });
    try {
      await dependencies.workspaceMembershipGateway.removeMember(actor, workspaceId, membershipId.data);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKSPACE_MEMBERSHIP_FORBIDDEN') return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Owner role is required for this operation' });
      if (error instanceof Error && error.message === 'WORKSPACE_MEMBER_NOT_REMOVABLE_OR_NOT_FOUND') return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Only existing operator or viewer memberships can be removed' });
      request.log.warn({ error, workspaceId }, 'Unable to remove workspace member');
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace membership directory is unavailable' });
    }
  });

  // Nested in this plugin so the verified JWT boundary is inherited by every
  // cockpit route. No route is allowed to select an actor from request input.
  app.register(cockpitReadRoutes, {
    cockpitReadGateway: dependencies.cockpitReadGateway,
  });
  app.register(handoffOperationRoutes, {
    handoffOperationsGateway: dependencies.handoffOperationsGateway,
  });
  app.register(journeyOperationRoutes, {
    journeyOperationsGateway: dependencies.journeyOperationsGateway,
  });
  app.register(commercialOutcomeRoutes, {
    commercialOutcomeGateway: dependencies.commercialOutcomeGateway,
  });
  app.register(outboundDispatchRoutes, {
    outboundDispatchGateway: dependencies.outboundDispatchGateway,
  });
  app.register(trafficProofRoutes, {
    trafficProofGateway: dependencies.trafficProofGateway,
  });
  app.register(knownFactOperationRoutes, {
    knownFactOperationsGateway: dependencies.knownFactOperationsGateway,
  });
  app.register(appointmentRoutes, {
    appointmentGateway: dependencies.appointmentGateway,
  });
  app.register(notesRoutes, {
    notesGateway: dependencies.notesGateway,
  });
  app.register(workspaceInitRoutes, {
    workspaceProvisioningGateway: dependencies.workspaceProvisioningGateway,
  });
  app.register(workspaceOperationalRoutes, {
    workspaceOperationalGateway: dependencies.workspaceOperationalGateway,
  });
  app.register(atlasToolsRoutes, {
    cockpitReadGateway: dependencies.cockpitReadGateway,
    knownFactOperationsGateway: dependencies.knownFactOperationsGateway,
  });
  app.register(autonomousRevenueRoutes, {
    workspaceDirectory: dependencies.workspaceDirectory,
  });
}
