import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppointmentGateway } from '../../../application/ports/appointment-gateway.js';

export interface AppointmentRouteDependencies {
  appointmentGateway?: AppointmentGateway;
}

const uuid = z.string().uuid();
const workspaceParamsSchema = z.object({ workspaceId: uuid });
const appointmentParamsSchema = z.object({ workspaceId: uuid, appointmentId: uuid });

const appointmentStatusSchema = z.enum([
  'confirmed',
  'pending_deposit',
  'rescheduled',
  'completed',
  'cancelled',
]);

const listQuerySchema = z.object({
  status: appointmentStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createAppointmentSchema = z.object({
  journeyId: uuid.optional(),
  leadName: z.string().trim().min(1).max(255),
  leadPhone: z.string().trim().min(8).max(32),
  serviceName: z.string().trim().min(1).max(255),
  serviceValueMinor: z.number().int().min(0),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  status: appointmentStatusSchema.optional(),
  source: z.enum(['bot_ai', 'operator']).optional(),
  operatorName: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(4096).optional(),
  location: z.string().trim().max(255).optional(),
}).strict();

const updateAppointmentSchema = z.object({
  leadName: z.string().trim().min(1).max(255).optional(),
  leadPhone: z.string().trim().min(8).max(32).optional(),
  serviceName: z.string().trim().min(1).max(255).optional(),
  serviceValueMinor: z.number().int().min(0).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  status: appointmentStatusSchema.optional(),
  operatorName: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(4096).optional(),
  location: z.string().trim().max(255).optional(),
}).strict();

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid appointment request payload' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Appointment not found' });
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Appointment service is unavailable' });
}

export async function appointmentRoutes(
  app: FastifyInstance,
  dependencies: AppointmentRouteDependencies,
): Promise<void> {
  // List appointments
  app.get('/workspaces/:workspaceId/appointments', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    const query = listQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return invalid(reply);
    if (!dependencies.appointmentGateway) return unavailable(reply);

    const appointments = await dependencies.appointmentGateway.list(
      actor,
      params.data.workspaceId,
      query.data,
    );
    return { data: appointments };
  });

  // Get single appointment
  app.get('/workspaces/:workspaceId/appointments/:appointmentId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = appointmentParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    if (!dependencies.appointmentGateway) return unavailable(reply);

    const appointment = await dependencies.appointmentGateway.getById(
      actor,
      params.data.workspaceId,
      params.data.appointmentId,
    );
    return appointment === null ? notFound(reply) : { data: appointment };
  });

  // Create appointment
  app.post('/workspaces/:workspaceId/appointments', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    const body = createAppointmentSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply);
    if (!dependencies.appointmentGateway) return unavailable(reply);

    const appointment = await dependencies.appointmentGateway.create(actor, {
      workspaceId: params.data.workspaceId,
      ...body.data,
    });
    reply.code(201);
    return { data: appointment };
  });

  // Update appointment
  app.patch('/workspaces/:workspaceId/appointments/:appointmentId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = appointmentParamsSchema.safeParse(request.params);
    const body = updateAppointmentSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply);
    if (!dependencies.appointmentGateway) return unavailable(reply);

    const appointment = await dependencies.appointmentGateway.update(
      actor,
      params.data.workspaceId,
      params.data.appointmentId,
      body.data,
    );
    return appointment === null ? notFound(reply) : { data: appointment };
  });

  // Delete appointment
  app.delete('/workspaces/:workspaceId/appointments/:appointmentId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = appointmentParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    if (!dependencies.appointmentGateway) return unavailable(reply);

    const deleted = await dependencies.appointmentGateway.delete(
      actor,
      params.data.workspaceId,
      params.data.appointmentId,
    );
    return deleted ? reply.code(204).send() : notFound(reply);
  });
}
