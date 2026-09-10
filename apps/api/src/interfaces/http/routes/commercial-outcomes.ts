import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CommercialOutcomeConflictError,
  CommercialOutcomeGateway,
  CommercialOutcomeRuleViolationError,
  COMMERCIAL_OUTCOME_RESULTS,
} from '../../../application/ports/commercial-outcome-gateway.js';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { PlaybookEvolutionEngine } from '../../../application/services/playbook-evolution-engine.js';
import { canonicalUuid } from '../validation.js';

export interface CommercialOutcomeRouteDependencies {
  commercialOutcomeGateway?: CommercialOutcomeGateway;
}

const uuid = canonicalUuid;
const paramsSchema = z.object({ workspaceId: uuid, journeyId: uuid });
const idempotencySchema = z.object({ 'idempotency-key': uuid });
const bodySchema = z.object({
  result: z.enum(COMMERCIAL_OUTCOME_RESULTS),
  revenueMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  // Currency is not caller-selectable in v1; all commercial values are BRL.
  currency: z.literal('BRL').optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
});

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid commercial outcome request' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
}

export async function commercialOutcomeRoutes(
  app: FastifyInstance,
  dependencies: CommercialOutcomeRouteDependencies,
): Promise<void> {
  app.post('/workspaces/:workspaceId/journeys/:journeyId/outcomes', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = paramsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) {
      request.log.warn({
        paramsError: params.error?.issues,
        headersError: headers.error?.issues,
        bodyError: body.error?.issues,
      }, 'Validation failure on commercial outcome request');
      return invalid(reply);
    }
    if (!dependencies.commercialOutcomeGateway) {
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Commercial outcome service is unavailable' });
    }

    try {
      const data = await dependencies.commercialOutcomeGateway.record(actor, {
        workspaceId: params.data.workspaceId,
        journeyId: params.data.journeyId,
        result: body.data.result,
        revenueMinor: body.data.revenueMinor,
        currency: 'BRL',
        ...(body.data.reason ? { reason: body.data.reason } : {}),
        idempotencyKey: headers.data['idempotency-key'],
      });

      // record_commercial_outcome atomically persists the sale and its outbox event.
      // Only the CAPI worker sends conversions; never mutate immutable outcomes here.
      if (data && body.data.result === 'WON') {
        // Level 5: Hive-Mind Playbook Evolution (Clonador de Melhores Práticas)
        void (async () => {
          try {
            const learningClaim = await dbPool.query(
              `INSERT INTO public.commercial_effect_claims(outcome_id,effect)
               SELECT id,'playbook_learning' FROM public.commercial_outcomes
               WHERE id=$1 AND workspace_id=$2
               ON CONFLICT DO NOTHING RETURNING outcome_id`,
              [data.outcomeId, params.data.workspaceId],
            );
            if (!learningClaim.rowCount) return;
            const msgRes = await dbPool.query(
              `SELECT id, direction, sender_type, text_content, sent_at
               FROM public.conversation_messages
               WHERE journey_id = $1 AND workspace_id = $2
               ORDER BY sent_at ASC`,
              [params.data.journeyId, params.data.workspaceId]
            );
            if (msgRes.rows.length >= 4) {
              const evolution = new PlaybookEvolutionEngine();
              await evolution.distillAndEvolve(
                params.data.workspaceId,
                params.data.journeyId,
                body.data.revenueMinor,
                msgRes.rows
              );
            }
          } catch (playbookErr) {
            console.warn('[Playbook Evolution Error]:', playbookErr);
          }
        })();
      }

      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof CommercialOutcomeConflictError) {
        return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'A final outcome has already been recorded' });
      }
      if (error instanceof CommercialOutcomeRuleViolationError) return invalid(reply);
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Commercial outcome service is unavailable' });
    }
  });
}
