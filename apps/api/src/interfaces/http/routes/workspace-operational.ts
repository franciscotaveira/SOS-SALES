import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WorkspaceOperationalGateway } from '../../../application/ports/workspace-operational-gateway.js';
import { canonicalUuid } from '../validation.js';

export interface WorkspaceOperationalRouteDependencies {
  workspaceOperationalGateway?: WorkspaceOperationalGateway;
}

const workspaceParamsSchema = z.object({ workspaceId: canonicalUuid });
const contactParamsSchema = z.object({ workspaceId: canonicalUuid, contactId: canonicalUuid });

const commercialConfigSchema = z.object({
  businessName: z.string().trim().max(255).optional(),
  businessType: z.enum(['hair_salon', 'clinic', 'consulting', 'b2b_sales', 'auto_film', 'general']).optional(),
  agendaProviderType: z.enum(['google_calendar', 'trinks', 'calendly', 'avec', 'simples_agenda', 'custom']).optional(),
  agendaProviderName: z.string().trim().max(255).optional(),
  agendaUrl: z.string().trim().max(2048).optional(),
  pixKey: z.string().trim().max(255).optional(),
  pixReceiverName: z.string().trim().max(255).optional(),
  businessAddress: z.string().trim().max(512).optional(),
  customMacros: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(255),
    template: z.string().trim().min(1).max(4096),
  }).strict()).max(50).optional(),
}).strict();

const loyaltyOverridesSchema = z.record(
  z.string().trim().min(1).max(128),
  z.enum(['NEW', 'RECURRING']),
).refine((value) => Object.keys(value).length <= 1000, 'Too many loyalty overrides');

const updateSettingsSchema = z.object({
  commercialConfig: commercialConfigSchema.optional(),
  loyaltyOverrides: loyaltyOverridesSchema.optional(),
  dailyTargetRevenueMinor: z.number().int().min(0).max(1_000_000_000_000).optional(),
  slaPolicy: z.object({
    firstResponseMinutes: z.number().int().min(1).max(1440),
  }).strict().optional(),
}).strict();

const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(255),
}).strict();

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid operational settings request' });
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace operational data is unavailable' });
}

export async function workspaceOperationalRoutes(
  app: FastifyInstance,
  dependencies: WorkspaceOperationalRouteDependencies,
): Promise<void> {
  app.get('/workspaces/:workspaceId/operational-settings', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    if (!dependencies.workspaceOperationalGateway) return unavailable(reply);

    try {
      const data = await dependencies.workspaceOperationalGateway.getSettings(actor, params.data.workspaceId);
      return { data };
    } catch (error) {
      request.log.warn({ error, workspaceId: params.data.workspaceId }, 'Unable to read workspace operational settings');
      return unavailable(reply);
    }
  });

  app.patch('/workspaces/:workspaceId/operational-settings', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    const body = updateSettingsSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply);
    if (!dependencies.workspaceOperationalGateway) return unavailable(reply);

    try {
      const data = await dependencies.workspaceOperationalGateway.updateSettings(
        actor,
        params.data.workspaceId,
        body.data,
      );
      return { data };
    } catch (error) {
      request.log.warn({ error, workspaceId: params.data.workspaceId }, 'Unable to update workspace operational settings');
      return unavailable(reply);
    }
  });

  app.patch('/workspaces/:workspaceId/contacts/:contactId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = contactParamsSchema.safeParse(request.params);
    const body = updateContactSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply);
    if (!dependencies.workspaceOperationalGateway) return unavailable(reply);

    try {
      const data = await dependencies.workspaceOperationalGateway.updateContactName(
        actor,
        params.data.workspaceId,
        params.data.contactId,
        body.data.name,
      );
      return data ? { data } : reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Contact not found' });
    } catch (error) {
      request.log.warn({ error, workspaceId: params.data.workspaceId, contactId: params.data.contactId }, 'Unable to update contact');
      return unavailable(reply);
    }
  });
}
