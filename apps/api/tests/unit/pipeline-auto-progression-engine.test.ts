import { describe, expect, it } from 'vitest';
import {
  PipelineAutoProgressionEngine,
  STAGE_RANK,
} from '../../src/application/services/pipeline-auto-progression-engine.js';

describe('PipelineAutoProgressionEngine', () => {
  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const journeyId = '317b1a8f-e7c1-4da9-ba12-765a12521602';

  it('maintains strict monotonic stage ranks (NEW < QUALIFIED < PROPOSAL < NEGOTIATION < WON)', () => {
    expect(STAGE_RANK.NEW).toBe(1);
    expect(STAGE_RANK.QUALIFIED).toBe(2);
    expect(STAGE_RANK.PROPOSAL).toBe(3);
    expect(STAGE_RANK.NEGOTIATION).toBe(4);
    expect(STAGE_RANK.WON).toBe(5);
  });

  it('advances journey from NEW to QUALIFIED when customer sends active inbound reply', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const mockQuery = async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params });
      if (sql.includes('WITH current_journey AS MATERIALIZED')) {
        return {
          rows: [{ from_stage: 'NEW', to_stage: 'QUALIFIED', advanced: true, audited: true }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM public.commercial_journeys')) {
        return {
          rows: [
            {
              id: journeyId,
              workspace_id: workspaceId,
              status: 'OPEN',
              pipeline_stage: 'NEW',
              primary_service_or_product: null,
              contact_name: 'João',
            },
          ],
        };
      }
      if (sql.includes('FROM public.conversation_messages')) {
        return {
          rows: [
            { direction: 'inbound', sender_type: 'customer', text_content: 'Sos', sent_at: new Date() },
            { direction: 'outbound', sender_type: 'ai', text_content: 'Oi João! Que tipo de produto você vende hoje?', sent_at: new Date() },
            { direction: 'inbound', sender_type: 'customer', text_content: 'Vendo roupas e calçados masculinos', sent_at: new Date() },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    };

    const result = await PipelineAutoProgressionEngine.evaluateAndProgress(
      mockQuery as any,
      workspaceId,
      journeyId,
    );

    expect(result.evaluated).toBe(true);
    expect(result.advanced).toBe(true);
    expect(result.fromStage).toBe('NEW');
    expect(result.toStage).toBe('QUALIFIED');

    const atomicTransitionQuery = executedQueries.find((q) => q.sql.includes('UPDATE public.commercial_journeys') && q.sql.includes('INSERT INTO public.pipeline_stage_events'));
    expect(atomicTransitionQuery).toBeDefined();
    expect(atomicTransitionQuery?.params?.[0]).toBe('QUALIFIED');
    expect(atomicTransitionQuery?.params?.[4]).toBe(journeyId);
    expect(atomicTransitionQuery?.params?.[5]).toBe(workspaceId);
    expect(atomicTransitionQuery?.params?.[7]).toBe(`auto_${workspaceId}_${journeyId}_QUALIFIED`);
    expect(atomicTransitionQuery?.sql).not.toContain('Date.now()');
  });

  it('advances journey from QUALIFIED to PROPOSAL when proposal/pricing is presented', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const mockQuery = async (sql: string, params?: unknown[]) => {
      if (sql.includes('WITH current_journey AS MATERIALIZED')) {
        return {
          rows: [{ from_stage: 'QUALIFIED', to_stage: 'PROPOSAL', advanced: true, audited: true }],
          rowCount: 1,
        };
      }
      executedQueries.push({ sql, params });
      if (sql.includes('FROM public.commercial_journeys')) {
        return {
          rows: [
            {
              id: journeyId,
              workspace_id: workspaceId,
              status: 'OPEN',
              pipeline_stage: 'QUALIFIED',
              primary_service_or_product: 'Roupas',
              contact_name: 'João',
            },
          ],
        };
      }
      if (sql.includes('FROM public.conversation_messages')) {
        return {
          rows: [
            { direction: 'inbound', sender_type: 'customer', text_content: 'Vendo roupas', sent_at: new Date() },
            { direction: 'outbound', sender_type: 'ai', text_content: 'Nosso plano anual no Pix sai por R$ 582 ou mensal de R$ 97/mês', sent_at: new Date() },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    };

    const result = await PipelineAutoProgressionEngine.evaluateAndProgress(
      mockQuery as any,
      workspaceId,
      journeyId,
    );

    expect(result.evaluated).toBe(true);
    expect(result.advanced).toBe(true);
    expect(result.fromStage).toBe('QUALIFIED');
    expect(result.toStage).toBe('PROPOSAL');
  });

  it('fails closed when the atomic stage guard loses a concurrent race', async () => {
    const mockQuery = async (sql: string) => {
      if (sql.includes('WITH current_journey AS MATERIALIZED')) {
        return {
          rows: [{ from_stage: 'QUALIFIED', to_stage: 'QUALIFIED', advanced: false, audited: true }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM public.commercial_journeys')) {
        return {
          rows: [{
            id: journeyId,
            workspace_id: workspaceId,
            status: 'OPEN',
            pipeline_stage: 'NEW',
            primary_service_or_product: null,
            contact_name: 'João',
          }],
        };
      }
      if (sql.includes('FROM public.conversation_messages')) {
        return {
          rows: [
            { direction: 'inbound', sender_type: 'customer', text_content: 'Vendo roupas e calçados masculinos', sent_at: new Date() },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    };

    const result = await PipelineAutoProgressionEngine.evaluateAndProgress(
      mockQuery as any,
      workspaceId,
      journeyId,
    );

    expect(result.advanced).toBe(false);
    expect(result.fromStage).toBe('QUALIFIED');
    expect(result.toStage).toBe('QUALIFIED');
    expect(result.reason).toBe('concurrent_transition_or_target_not_higher');
  });

  it('advances journey from PROPOSAL to NEGOTIATION on scheduling or payment terms discussion', async () => {
    const mockQuery = async (sql: string) => {
      if (sql.includes('WITH current_journey AS MATERIALIZED')) {
        return {
          rows: [{ from_stage: 'PROPOSAL', to_stage: 'NEGOTIATION', advanced: true, audited: true }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM public.commercial_journeys')) {
        return {
          rows: [
            {
              id: journeyId,
              workspace_id: workspaceId,
              status: 'OPEN',
              pipeline_stage: 'PROPOSAL',
              primary_service_or_product: 'Plano Anual',
              contact_name: 'João',
            },
          ],
        };
      }
      if (sql.includes('FROM public.conversation_messages')) {
        return {
          rows: [
            { direction: 'inbound', sender_type: 'customer', text_content: 'Vendo roupas', sent_at: new Date() },
            { direction: 'outbound', sender_type: 'ai', text_content: 'Nosso plano anual no Pix sai por R$ 582', sent_at: new Date() },
            { direction: 'inbound', sender_type: 'customer', text_content: 'Consigo parcelar no cartão em quantas vezes?', sent_at: new Date() },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    };

    const result = await PipelineAutoProgressionEngine.evaluateAndProgress(
      mockQuery as any,
      workspaceId,
      journeyId,
    );

    expect(result.evaluated).toBe(true);
    expect(result.advanced).toBe(true);
    expect(result.fromStage).toBe('PROPOSAL');
    expect(result.toStage).toBe('NEGOTIATION');
  });

  it('NEVER auto-promotes to WON/GANHO even if closure keywords are detected (Truth in Data)', async () => {
    const mockQuery = async (sql: string) => {
      if (sql.includes('WITH current_journey AS MATERIALIZED')) {
        return {
          rows: [{ from_stage: 'PROPOSAL', to_stage: 'NEGOTIATION', advanced: true, audited: true }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM public.commercial_journeys')) {
        return {
          rows: [
            {
              id: journeyId,
              workspace_id: workspaceId,
              status: 'OPEN',
              pipeline_stage: 'PROPOSAL',
              primary_service_or_product: 'Plano Anual',
              contact_name: 'João',
            },
          ],
        };
      }
      if (sql.includes('FROM public.conversation_messages')) {
        return {
          rows: [
            { direction: 'inbound', sender_type: 'customer', text_content: 'Fechado, pode marcar!', sent_at: new Date() },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    };

    const result = await PipelineAutoProgressionEngine.evaluateAndProgress(
      mockQuery as any,
      workspaceId,
      journeyId,
    );

    // Caps at NEGOTIATION (Rank 4), never promotes to WON (Rank 5) without real payment confirmation
    expect(result.toStage).toBe('NEGOTIATION');
  });

  it('NEVER regresses stage backwards (monotonic anti-regression rule)', async () => {
    const mockQuery = async (sql: string) => {
      if (sql.includes('FROM public.commercial_journeys')) {
        return {
          rows: [
            {
              id: journeyId,
              workspace_id: workspaceId,
              status: 'OPEN',
              pipeline_stage: 'NEGOTIATION',
              primary_service_or_product: 'Plano Anual',
              contact_name: 'João',
            },
          ],
        };
      }
      if (sql.includes('FROM public.conversation_messages')) {
        return {
          rows: [
            { direction: 'inbound', sender_type: 'customer', text_content: 'Oi', sent_at: new Date() },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    };

    const result = await PipelineAutoProgressionEngine.evaluateAndProgress(
      mockQuery as any,
      workspaceId,
      journeyId,
    );

    expect(result.advanced).toBe(false);
    expect(result.fromStage).toBe('NEGOTIATION');
    expect(result.reason).toBe('already_at_max_autonomous_stage');
  });
});
