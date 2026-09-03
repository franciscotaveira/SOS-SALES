import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CockpitReadGateway } from '../../../application/ports/cockpit-read-gateway.js';
import { KnownFactOperationsGateway } from '../../../application/ports/known-fact-operations-gateway.js';
import { dbPool } from '../../../infrastructure/database/pool.js';

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000';
const WAHA_API_KEY = process.env.WAHA_API_KEY || (process.env.NODE_ENV === 'production' ? '' : 'mct_sos_waha_dev_secret_2026');

import { getSessionName } from './whatsapp-channel-routes.js';
import { canonicalUuid } from '../validation.js';

export interface AtlasToolsRouteDependencies {
  cockpitReadGateway?: CockpitReadGateway;
  knownFactOperationsGateway?: KnownFactOperationsGateway;
}

const uuid = canonicalUuid;
const workspaceParamsSchema = z.object({ workspaceId: uuid });

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function unavailable(reply: FastifyReply, service: string): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: `${service} is unavailable` });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
}

async function fetchWahaSessionStatus(sessionName: string): Promise<{ status: string; me?: any } | null> {
  try {
    const listRes = await fetch(`${WAHA_BASE_URL}/api/sessions?all=true`, {
      headers: { 'x-api-key': WAHA_API_KEY },
    });
    if (!listRes.ok) return null;
    const sessions = (await listRes.json()) as Array<{ name: string; status: string; me?: any }>;
    return sessions.find((s) => s.name === sessionName) ?? null;
  } catch {
    return null;
  }
}

export async function atlasToolsRoutes(
  app: FastifyInstance,
  dependencies: AtlasToolsRouteDependencies,
): Promise<void> {
  // GET /api/v1/atlas/tools/read/dossier/:workspaceId
  // Retorna visão consolidada do workspace: prioridades, jornadas, métricas básicas
  app.get('/api/v1/atlas/tools/read/dossier/:workspaceId', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspaceId' });
    if (!dependencies.cockpitReadGateway) return unavailable(reply, 'Cockpit read service');

    try {
      const [priorities, journeysPage] = await Promise.all([
        dependencies.cockpitReadGateway.listPriorities(actor, params.data.workspaceId, 20),
        dependencies.cockpitReadGateway.listJourneys(actor, params.data.workspaceId, { limit: 50, cursor: null }),
      ]);

      const openJourneys = journeysPage?.items?.filter((j) => j.status === 'OPEN') ?? [];
      const wonJourneys = journeysPage?.items?.filter((j) => j.status === 'WON') ?? [];
      const lostJourneys = journeysPage?.items?.filter((j) => j.status === 'LOST') ?? [];

      return {
        workspaceId: params.data.workspaceId,
        summary: {
          totalJourneys: journeysPage?.items?.length ?? 0,
          openJourneys: openJourneys.length,
          wonJourneys: wonJourneys.length,
          lostJourneys: lostJourneys.length,
          overdueSla: priorities?.filter((p) => p.slaState === 'OVERDUE').length ?? 0,
          dueSla: priorities?.filter((p) => p.slaState === 'DUE').length ?? 0,
        },
        priorities: priorities ?? [],
        recentJourneys: journeysPage?.items?.slice(0, 10) ?? [],
      };
    } catch {
      return unavailable(reply, 'Cockpit read service');
    }
  });

  // GET /api/v1/atlas/tools/read/known-facts/:workspaceId
  // Retorna fatos conhecidos consolidados por jornada (append-only, imutáveis)
  app.get('/api/v1/atlas/tools/read/known-facts/:workspaceId', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspaceId' });

    try {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE sos_sales_runtime');
        await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");
        await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);

        const result = await client.query(
          `SELECT kf.id, kf.journey_id, kf.key, kf.value, kf.confidence, kf.confirmed_by_customer, kf.source, kf.observed_at
           FROM public.known_facts kf
           JOIN public.commercial_journeys cj ON cj.id = kf.journey_id
           WHERE cj.workspace_id = $1
           ORDER BY kf.observed_at DESC
           LIMIT 200`,
          [params.data.workspaceId],
        );

        await client.query('COMMIT');

        return {
          workspaceId: params.data.workspaceId,
          facts: result.rows.map((row) => ({
            id: row.id,
            journeyId: row.journey_id,
            key: row.key,
            value: row.value,
            confidence: row.confidence,
            confirmedByCustomer: row.confirmed_by_customer,
            source: row.source,
            observedAt: row.observed_at,
          })),
        };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        await client.query('RESET ROLE').catch(() => undefined);
        client.release();
      }
    } catch {
      return unavailable(reply, 'Known facts service');
    }
  });

  // GET /api/v1/atlas/tools/read/pipeline/:workspaceId
  // Retorna gargalos do pipeline: jornadas por estágio, fricções, recomendações pendentes
  app.get('/api/v1/atlas/tools/read/pipeline/:workspaceId', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspaceId' });
    if (!dependencies.cockpitReadGateway) return unavailable(reply, 'Cockpit read service');

    try {
      const journeysPage = await dependencies.cockpitReadGateway.listJourneys(actor, params.data.workspaceId, { limit: 200, cursor: null });
      const journeys = journeysPage?.items ?? [];

      const byStage = new Map<string, number>();
      let withFriction = 0;
      let withRecommendation = 0;

      // Para cada jornada aberta, buscar cockpit detail para fricção/recomendação
      for (const journey of journeys) {
        if (journey.status !== 'OPEN') continue;
        byStage.set(journey.pipelineStage || 'SEM_ESTAGIO', (byStage.get(journey.pipelineStage || 'SEM_ESTAGIO') ?? 0) + 1);

        const cockpit = await dependencies.cockpitReadGateway.getJourneyCockpit(actor, params.data.workspaceId, journey.id, 0);
        if (cockpit?.decisionState?.primaryFriction) withFriction++;
        if (cockpit?.recommendation) withRecommendation++;
      }

      return {
        workspaceId: params.data.workspaceId,
        pipeline: {
          journeysByStage: Object.fromEntries(byStage),
          openJourneysWithFriction: withFriction,
          openJourneysWithRecommendation: withRecommendation,
          totalOpen: journeys.filter((j) => j.status === 'OPEN').length,
        },
      };
    } catch {
      return unavailable(reply, 'Cockpit read service');
    }
  });

  // GET /api/v1/atlas/tools/read/whatsapp-health/:workspaceId
  // Retorna status da conexão WhatsApp (WAHA) para o workspace
  app.get('/api/v1/atlas/tools/read/whatsapp-health/:workspaceId', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspaceId' });

    const sessionName = getSessionName(params.data.workspaceId);
    if (!sessionName) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Workspace não encontrado' });
    }
    const session = await fetchWahaSessionStatus(sessionName);

    if (!session) {
      return {
        workspaceId: params.data.workspaceId,
        session: sessionName,
        status: 'UNKNOWN',
        connected: false,
        message: 'Não foi possível consultar o WAHA',
      };
    }

    const isConnected = session.status === 'WORKING';
    return {
      workspaceId: params.data.workspaceId,
      session: sessionName,
      status: session.status,
      connected: isConnected,
      phoneNumber: session.me?.id ?? null,
      profileName: session.me?.pushName ?? null,
      message: isConnected
        ? 'WhatsApp conectado e operacional'
        : session.status === 'STARTING'
        ? 'Iniciando WhatsApp... aguarde'
        : session.status === 'SCAN_QR_CODE'
        ? 'QR Code pendente de leitura'
        : 'WhatsApp desconectado',
    };
  });

  // GET /api/v1/atlas/tools/read/historical-diagnosis/:workspaceId
  // Retorna somente métricas calculáveis a partir das mensagens persistidas.
  // O endpoint antigo devolvia um dossiê sintético específico da Haven; isso
  // contaminava qualquer workspace que o consultasse.
  app.get('/api/v1/atlas/tools/read/historical-diagnosis/:workspaceId', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspaceId' });

    try {
      const result = await dbPool.query(
        `SELECT
           COUNT(*)::int AS total_messages,
           COUNT(DISTINCT journey_id)::int AS total_journeys,
           COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound_messages,
           COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outbound_messages,
           COUNT(*) FILTER (
             WHERE EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Sao_Paulo') >= 20
                OR EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Sao_Paulo') < 9
           )::int AS out_of_hours_messages,
           COUNT(*) FILTER (WHERE media_payload IS NOT NULL AND media_payload <> '{}'::jsonb)::int AS media_messages,
           MIN(sent_at) AS first_message_at,
           MAX(sent_at) AS last_message_at
         FROM public.conversation_messages
         WHERE workspace_id = $1`,
        [params.data.workspaceId],
      );
      const row = result.rows[0] || {};
      return {
        workspaceId: params.data.workspaceId,
        source: 'conversation_messages persistidas',
        hasData: Number(row.total_messages || 0) > 0,
        totalChatsAnalyzed: Number(row.total_journeys || 0),
        totalMessages: Number(row.total_messages || 0),
        inboundMessages: Number(row.inbound_messages || 0),
        outboundMessages: Number(row.outbound_messages || 0),
        outOfHoursMessages: Number(row.out_of_hours_messages || 0),
        mediaMessages: Number(row.media_messages || 0),
        firstMessageAt: row.first_message_at || null,
        lastMessageAt: row.last_message_at || null,
        topCustomerIntentions: [],
        historicalBottlenecks: null,
        regionalLinguisticPatterns: null,
        agentGuardrailsDerived: [],
      };
    } catch {
      return unavailable(reply, 'Historical diagnosis service');
    }
  });
}
