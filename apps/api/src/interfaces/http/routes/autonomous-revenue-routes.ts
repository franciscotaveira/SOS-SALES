/**
 * SOS SALES - ROTAS DE RECEITA AUTÔNOMA (Level 4 Autonomous Commercial Engine)
 * Reanimação preditiva de vácuo comercial e retenção/LTV pós-venda.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GhostingResurrectionEngine } from '../../../application/services/ghosting-resurrection-engine.js';
import { LtvRetentionEngine } from '../../../application/services/ltv-retention-engine.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { assertTenantAccess, unauthorized } from '../helpers/auth-guard.js';

const uuid = z.string().uuid();
const workspaceParamsSchema = z.object({ workspaceId: uuid });
const journeyParamsSchema = z.object({ workspaceId: uuid, journeyId: uuid });

export interface AutonomousRevenueRoutesDependencies {
  workspaceDirectory?: WorkspaceDirectory;
}

export async function autonomousRevenueRoutes(
  app: FastifyInstance,
  dependencies: AutonomousRevenueRoutesDependencies = {}
): Promise<void> {
  const ghostingEngine = new GhostingResurrectionEngine();
  const retentionEngine = new LtvRetentionEngine();

  // 1. Listar leads em vácuo no workspace
  app.get('/workspaces/:workspaceId/ghosting/opportunities', async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply);

    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspace ID' });
    }

    const hasAccess = await assertTenantAccess(request, reply, params.data.workspaceId, actor, dependencies.workspaceDirectory);
    if (!hasAccess) return reply;

    try {
      const opportunities = await ghostingEngine.listGhostingOpportunities(params.data.workspaceId);
      return { data: opportunities };
    } catch (err) {
      request.log.error(err, 'Error fetching ghosting opportunities');
      return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to fetch ghosting opportunities' });
    }
  });

  // 2. Analisar e gerar micro-quebra de vácuo para uma jornada específica
  app.post('/workspaces/:workspaceId/journeys/:journeyId/resurrect', async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply);

    const params = journeyParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid parameters' });
    }

    const hasAccess = await assertTenantAccess(request, reply, params.data.workspaceId, actor, dependencies.workspaceDirectory, 'operator');
    if (!hasAccess) return reply;

    try {
      const analysis = await ghostingEngine.analyzeAndGenerate(params.data.workspaceId, params.data.journeyId);
      if (!analysis) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Journey not eligible for resurrection' });
      }
      return { data: analysis };
    } catch (err) {
      request.log.error(err, 'Error generating resurrection copy');
      return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to generate resurrection' });
    }
  });

  // 3. Listar oportunidades de recompra / LTV pós-venda
  app.get('/workspaces/:workspaceId/retention/opportunities', async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply);

    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspace ID' });
    }

    const hasAccess = await assertTenantAccess(request, reply, params.data.workspaceId, actor, dependencies.workspaceDirectory);
    if (!hasAccess) return reply;

    try {
      const opportunities = await retentionEngine.listRetentionOpportunities(params.data.workspaceId);
      return { data: opportunities };
    } catch (err) {
      request.log.error(err, 'Error fetching retention opportunities');
      return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to fetch retention opportunities' });
    }
  });
}
