import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getReceptionistActionPolicy,
  parseReceptionistDecision,
  ReceptionistAgent,
} from '../../src/application/agents/receptionist-agent.js';

describe('ReceptionistAgent untrusted-model safety policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts only the documented classification envelope', () => {
    expect(parseReceptionistDecision(
      '{"intent":"booking","escalate":false,"sendBookingFlow":true}\nVamos agendar seu horário.'
    )).toEqual({
      intent: 'booking',
      escalate: false,
      sendBookingFlow: true,
      reply: 'Vamos agendar seu horário.',
    });
  });

  it('rejects missing envelopes, unknown intents, unknown fields, and malformed action combinations', () => {
    expect(parseReceptionistDecision('Resposta sem envelope')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"delete_customer","escalate":false,"sendBookingFlow":false}\nOi')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"greeting","escalate":false,"sendBookingFlow":false,"admin":true}\nOi')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"inquiry","escalate":false,"sendBookingFlow":true}\nOi')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"human_request","escalate":false,"sendBookingFlow":false}\nOi')).toBeNull();
  });

  it('forces high-risk intents to human handoff even when the model does not request escalation', () => {
    for (const intent of ['objection', 'payment', 'human_request'] as const) {
      const policy = getReceptionistActionPolicy({ intent, escalate: false, sendBookingFlow: false, reply: 'texto' });
      expect(policy).toMatchObject({ shouldEscalate: true, allowReply: false, allowBookingFlow: false });
    }
  });

  it('allows booking flow only for an allowed booking response', () => {
    const policy = getReceptionistActionPolicy({
      intent: 'booking',
      escalate: false,
      sendBookingFlow: true,
      reply: 'Vou enviar o agendamento.',
    });
    expect(policy).toEqual({ shouldEscalate: false, allowReply: true, allowBookingFlow: true });
  });

  it('fails closed when the journey does not exist', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(false);
  });

  it('fails closed when bot_enabled is false even if bot_paused_at is null', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ bot_enabled: false, bot_paused_at: null }],
      rowCount: 1,
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(false);
  });

  it('fails closed when bot_enabled is true but bot_paused_at is present (human paused)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ bot_enabled: true, bot_paused_at: new Date() }],
      rowCount: 1,
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(false);
  });

  it('fails closed when the journey is enabled but workspace runtime was not published', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ bot_enabled: true, bot_paused_at: null }],
      rowCount: 1,
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(false);
  });

  it('allows autonomous bot only when journey and published workspace runtime are both enabled', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        bot_enabled: true,
        bot_paused_at: null,
        runtime_enabled: true,
        autonomy_mode: 'autonomous_24_7',
        published_at: new Date(),
      }],
      rowCount: 1,
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(true);
  });

  it('fails closed when the bot state cannot be read', async () => {
    const query = vi.fn().mockRejectedValue(new Error('database unavailable')) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  describe('Workspace configuration & prompt price anti-hallucination', () => {
    it('keeps the Haven fixture only for deterministic prompt tests, not runtime authorization', async () => {
      const { getWorkspaceConfig } = await import('../../src/infrastructure/ai/receptionist-system-prompt.js');

      const realHaven = getWorkspaceConfig('a0000000-0000-0000-0000-000000000001');
      expect(realHaven.name).toBe('Haven Escovaria');
      expect(realHaven.agentName).toBe('Camila');
      expect(realHaven.bookingUrl).toBe('https://www.trinks.com/haven-escovaria');

      const legacyHaven = getWorkspaceConfig('22222222-2222-2222-2222-222222222222');
      expect(legacyHaven.name).toBe('Haven Escovaria');

      const slugHaven = getWorkspaceConfig('haven');
      expect(slugHaven.name).toBe('Haven Escovaria');

      const generic = getWorkspaceConfig('unknown-uuid-1234');
      expect(generic.name).toBe('Empresa');
      expect(generic.agentName).toBe('Assistente');
    });

    it('builds system prompt with strict anti-hallucination price guardrails when prices are not fixed', async () => {
      const { buildSystemPrompt, HAVEN_CONFIG } = await import('../../src/infrastructure/ai/receptionist-system-prompt.js');
      const prompt = buildSystemPrompt(HAVEN_CONFIG);

      expect(prompt).toContain('Camila');
      expect(prompt).toContain('Haven Escovaria');
      expect(prompt).toContain('https://www.trinks.com/haven-escovaria');
      expect(prompt).toContain('REGRA CRÍTICA — PREÇOS (INEGOCIÁVEL, FALHA GRAVE SE VIOLADA)');
      expect(prompt).toContain('NUNCA mencione qualquer valor em Reais (R$)');
    });

    it('loads custom workspace config dynamically from database when present', async () => {
      const query = vi.fn().mockResolvedValue({
        rows: [{
          workspace_name: 'Studio Beleza Total',
          agent_name: 'Bruna',
          business_type: 'Salão e estética',
          services_json: [{ name: 'Corte Feminino', price: '80', duration: '40 min' }],
          working_hours: 'Seg a Sex 08h-18h',
          phone: '+554999998888',
          city: 'Chapecó',
          booking_url: 'https://agenda.studio.com',
          booking_flow_enabled: true,
          extra_context: 'Foco em visagismo',
        }],
        rowCount: 1,
      }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

      const agent = new ReceptionistAgent({ query }) as unknown as {
        loadWorkspaceConfig(workspaceId: string): Promise<import('../../src/infrastructure/ai/receptionist-system-prompt.js').WorkspaceConfig>;
      };

      const cfg = await agent.loadWorkspaceConfig('some-tenant-uuid');
      expect(cfg.name).toBe('Studio Beleza Total');
      expect(cfg.agentName).toBe('Bruna');
      expect(cfg.services[0].name).toBe('Corte Feminino');
      expect(cfg.services[0].price).toBe('80');
      expect(cfg.bookingUrl).toBe('https://agenda.studio.com');
    });
  });
});
