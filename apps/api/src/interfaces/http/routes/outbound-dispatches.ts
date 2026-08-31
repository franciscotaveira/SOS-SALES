import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  OutboundDispatchConflictError,
  OutboundDispatchGateway,
  OutboundDispatchRuleViolationError,
} from '../../../application/ports/outbound-dispatch-gateway.js';

export interface OutboundDispatchRouteDependencies {
  outboundDispatchGateway?: OutboundDispatchGateway;
}

const uuid = z.string().uuid();
const journeyParamsSchema = z.object({ workspaceId: uuid, journeyId: uuid });
const dispatchParamsSchema = z.object({ workspaceId: uuid, dispatchId: uuid });
const idempotencySchema = z.object({ 'idempotency-key': uuid });
const draftSchema = z.object({ textContent: z.string().trim().min(1).max(4096) }).strict();
const wabaDraftSchema = z.discriminatedUnion('messageKind', [
  z.object({ messageKind: z.literal('WABA_TEMPLATE'), templateName: z.string().trim().min(1).max(512), languageCode: z.string().trim().min(1).max(32).default('pt_BR'), headerMediaUrl: z.string().url().optional(), bodyParameters: z.array(z.string().max(1024)).max(20).default([]) }).strict(),
  z.object({ messageKind: z.literal('WABA_BUTTONS'), bodyText: z.string().trim().min(1).max(1024), headerText: z.string().trim().max(60).optional(), footerText: z.string().trim().max(60).optional(), buttons: z.array(z.object({ id: z.string().trim().min(1).max(256), title: z.string().trim().min(1).max(20) }).strict()).min(1).max(3) }).strict(),
  z.object({ messageKind: z.literal('WABA_LIST'), bodyText: z.string().trim().min(1).max(1024), buttonLabel: z.string().trim().min(1).max(20), headerText: z.string().trim().max(60).optional(), footerText: z.string().trim().max(60).optional(), sections: z.array(z.object({ title: z.string().trim().min(1).max(24), rows: z.array(z.object({ id: z.string().trim().min(1).max(200), title: z.string().trim().min(1).max(24), description: z.string().trim().max(72).optional() }).strict()).min(1).max(10) }).strict()).min(1).max(10) }).strict(),
  z.object({ messageKind: z.literal('WABA_FLOW'), flowId: z.string().trim().min(1).max(256), flowCta: z.string().trim().min(1).max(20), bodyText: z.string().trim().min(1).max(1024), headerText: z.string().trim().max(60).optional(), footerText: z.string().trim().max(60).optional(), screenId: z.string().trim().max(256).optional(), flowData: z.record(z.string(), z.unknown()).optional() }).strict(),
  z.object({ messageKind: z.literal('WABA_MEDIA'), mediaType: z.enum(['image', 'audio', 'video', 'document']), mediaUrl: z.string().url(), caption: z.string().trim().max(1024).optional(), filename: z.string().trim().max(256).optional() }).strict(),
]);
const approveSchema = z.object({}).strict();
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid outbound dispatch request' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Outbound dispatch service is unavailable' });
}

export async function outboundDispatchRoutes(
  app: FastifyInstance,
  dependencies: OutboundDispatchRouteDependencies,
): Promise<void> {
  app.post('/workspaces/:workspaceId/journeys/:journeyId/waba-outbound-drafts', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = journeyParamsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = wabaDraftSchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success || !dependencies.outboundDispatchGateway?.createWabaDraft) return invalid(reply);
    const input = body.data;
    const textContent = input.messageKind === 'WABA_TEMPLATE' ? `Template: ${input.templateName}`
      : input.messageKind === 'WABA_MEDIA' ? `[Mídia: ${input.mediaType}]${input.caption ? ` ${input.caption}` : ''}`
      : input.bodyText;
    try {
      const data = await dependencies.outboundDispatchGateway.createWabaDraft(actor, { workspaceId: params.data.workspaceId, journeyId: params.data.journeyId, messageKind: input.messageKind, textContent, messagePayload: input, idempotencyKey: headers.data['idempotency-key'] });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof OutboundDispatchRuleViolationError) return invalid(reply);
      if (error instanceof OutboundDispatchConflictError) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Outbound dispatch state has changed' });
      return unavailable(reply);
    }
  });

  app.post('/workspaces/:workspaceId/journeys/:journeyId/outbound-drafts', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = journeyParamsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = draftSchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) return invalid(reply);
    if (!dependencies.outboundDispatchGateway) return unavailable(reply);
    try {
      const data = await dependencies.outboundDispatchGateway.createDraft(actor, {
        workspaceId: params.data.workspaceId,
        journeyId: params.data.journeyId,
        textContent: body.data.textContent,
        idempotencyKey: headers.data['idempotency-key'],
      });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof OutboundDispatchRuleViolationError) return invalid(reply);
      if (error instanceof OutboundDispatchConflictError) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Outbound dispatch state has changed' });
      return unavailable(reply);
    }
  });

  app.post('/workspaces/:workspaceId/outbound-dispatches/:dispatchId/approve', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = dispatchParamsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = approveSchema.safeParse(request.body ?? {});
    if (!params.success || !headers.success || !body.success) return invalid(reply);
    if (!dependencies.outboundDispatchGateway) return unavailable(reply);
    try {
      const data = await dependencies.outboundDispatchGateway.approve(actor, {
        workspaceId: params.data.workspaceId,
        dispatchId: params.data.dispatchId,
        idempotencyKey: headers.data['idempotency-key'],
      });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof OutboundDispatchRuleViolationError) return invalid(reply);
      if (error instanceof OutboundDispatchConflictError) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Outbound dispatch state has changed' });
      return unavailable(reply);
    }
  });

  app.post('/workspaces/:workspaceId/outbound-dispatches/:dispatchId/cancel', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = dispatchParamsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = cancelSchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) return invalid(reply);
    if (!dependencies.outboundDispatchGateway) return unavailable(reply);
    try {
      const data = await dependencies.outboundDispatchGateway.cancel(actor, {
        workspaceId: params.data.workspaceId,
        dispatchId: params.data.dispatchId,
        reason: body.data.reason,
        idempotencyKey: headers.data['idempotency-key'],
      });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof OutboundDispatchRuleViolationError) return invalid(reply);
      if (error instanceof OutboundDispatchConflictError) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Outbound dispatch state has changed' });
      return unavailable(reply);
    }
  });

  app.get('/workspaces/:workspaceId/outbound-dispatches/:dispatchId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = dispatchParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    if (!dependencies.outboundDispatchGateway) return unavailable(reply);
    try {
      const data = await dependencies.outboundDispatchGateway.get(actor, params.data.workspaceId, params.data.dispatchId);
      return data === null ? notFound(reply) : { data };
    } catch {
      return unavailable(reply);
    }
  });
}
