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
}

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
}
