import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TrafficProofGateway } from '../../../application/ports/traffic-proof-gateway.js';
import { canonicalUuid } from '../validation.js';

export interface TrafficProofRouteDependencies {
  trafficProofGateway?: TrafficProofGateway;
}

const uuid = canonicalUuid;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));
const querySchema = z.object({
  from: isoDate,
  to: isoDate,
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).superRefine((value, context) => {
  if (value.from > value.to) context.addIssue({ code: z.ZodIssueCode.custom, message: 'from must be before to' });
  const spanDays = (Date.parse(`${value.to}T00:00:00.000Z`) - Date.parse(`${value.from}T00:00:00.000Z`)) / 86_400_000;
  if (spanDays > 366) context.addIssue({ code: z.ZodIssueCode.custom, message: 'date range too large' });
});

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid traffic proof parameters' });
}

export async function trafficProofRoutes(app: FastifyInstance, dependencies: TrafficProofRouteDependencies): Promise<void> {
  app.get('/workspaces/:workspaceId/traffic-proof', async (request: FastifyRequest, reply) => {
    const actor = request.operatorActor;
    if (!actor) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    const params = z.object({ workspaceId: uuid }).safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!params.success || !query.success) return invalid(reply);
    if (!dependencies.trafficProofGateway) {
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Traffic proof service is unavailable' });
    }
    try {
      const data = await dependencies.trafficProofGateway.getTrafficProof(actor, params.data.workspaceId, query.data);
      return data === null
        ? reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' })
        : { data, meta: { from: query.data.from, to: query.data.to, limit: query.data.limit, basis: 'acquisition_cohort' } };
    } catch {
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Traffic proof service is unavailable' });
    }
  });
}
