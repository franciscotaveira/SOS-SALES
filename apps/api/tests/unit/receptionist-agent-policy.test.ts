import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getReceptionistActionPolicy,
  parseReceptionistDecision,
  ReceptionistAgent,
} from '../../src/application/agents/receptionist-agent.js';

describe('ReceptionistAgent untrusted-model safety policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

    it('overlays the persisted intelligence bundle and ready knowledge into the runtime prompt config', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('FROM public.workspace_agent_config')) {
          return {
            rows: [{
              workspace_name: 'Studio Publicado',
              agent_name: 'Assistente Base',
              business_type: 'Serviços',
              services_json: [{ name: 'Serviço legado' }],
              working_hours: 'Seg a Sex 09h-18h',
              phone: '+5549999999999',
              city: 'Chapecó',
              booking_url: 'https://agenda.studio.com',
              booking_flow_enabled: false,
              extra_context: 'Contexto base',
              behavior_config: {},
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('workspace_intelligence_bundles')) {
          return {
            rows: [{
              bundle: {
                companyProfile: {
                  tradeName: 'Studio Publicado Pro',
                  segment: 'Estética premium',
                  phone: '+554888887777',
                  address: { city: 'Florianópolis', state: 'SC' },
                  businessHours: {
                    seg: { open: '08:00', close: '18:00', isOpen: true },
                    ter: { open: '08:00', close: '18:00', isOpen: true },
                  },
                  valueProposition: 'Atendimento cuidadoso e pontual',
                },
                agentConfig: {
                  name: 'Nina',
                  persona: 'Consultora breve e acolhedora',
                  toneOfVoice: 'acolhedor_empatico',
                  creativityTemperature: 0.1,
                  maxDiscountPercent: 5,
                  installmentLimitWithoutInterest: 3,
                  allowedPaymentMethods: ['PIX'],
                  safetyGuardrails: ['Não inventar disponibilidade'],
                  escalationTriggers: ['Pedido de atendente humano'],
                },
                catalog: [{
                  name: 'Avaliação facial',
                  basePrice: 120,
                  durationOrExecutionTime: '30 min',
                  inStock: true,
                }],
                documents: [{
                  name: 'FAQ oficial',
                  summary: 'Perguntas frequentes',
                  rawContentSnippet: 'A avaliação inclui análise personalizada.',
                }],
              },
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('workspace_knowledge_documents')) {
          return {
            rows: [{ title: 'Política publicada', content: 'Cancelamentos devem ser avisados com antecedência.', status: 'ready' }],
            rowCount: 1,
          };
        }
        throw new Error(`Unexpected test SQL: ${sql}`);
      }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

      const agent = new ReceptionistAgent({ query }) as unknown as {
        loadWorkspaceConfig(workspaceId: string): Promise<import('../../src/infrastructure/ai/receptionist-system-prompt.js').WorkspaceConfig>;
      };

      const cfg = await agent.loadWorkspaceConfig('published-workspace');
      expect(cfg.name).toBe('Studio Publicado Pro');
      expect(cfg.agentName).toBe('Nina');
      expect(cfg.businessType).toBe('Estética premium');
      expect(cfg.city).toBe('Florianópolis, SC');
      expect(cfg.workingHours).toContain('Segunda 08:00-18:00');
      expect(cfg.services).toEqual([{ name: 'Avaliação facial', price: '120,00', duration: '30 min' }]);
      expect(cfg.behavior?.tone).toBe('empatico_cuidadoso');
      expect(cfg.behavior?.maxDiscountPercent).toBe(5);
      expect(cfg.temperature).toBe(0.1);
      expect(cfg.extraContext).toContain('A avaliação inclui análise personalizada.');
      expect(cfg.extraContext).toContain('Cancelamentos devem ser avisados com antecedência.');
    });
  });

  describe('Durable worker retry and ambiguous WABA delivery safety', () => {
    const input = {
      workspaceId: '10000000-0000-4000-8000-000000000001',
      journeyId: '20000000-0000-4000-8000-000000000002',
      contactId: '30000000-0000-4000-8000-000000000003',
      fromPhone: '+5549999999999',
      pushName: 'Cliente Teste',
      textContent: 'Olá',
      messageType: 'text',
      channelConnectionId: '40000000-0000-4000-8000-000000000004',
      phoneNumberId: 'phone-number-id',
    };

    function runtimeQuery() {
      return vi.fn(async (sql: string) => {
        if (sql.includes('SELECT') && sql.includes('j.bot_enabled')) {
          return {
            rows: [{
              bot_enabled: true,
              bot_paused_at: null,
              runtime_enabled: true,
              autonomy_mode: 'autonomous_24_7',
              published_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM public.workspace_agent_config')) {
          return {
            rows: [{
              workspace_name: 'Empresa Teste',
              agent_name: 'Assistente',
              business_type: 'Serviços',
              services_json: [{ name: 'Serviço conhecido' }],
              working_hours: 'Seg a Sex 09h-18h',
              phone: '+5549999999999',
              city: 'Chapecó',
              booking_url: null,
              booking_flow_enabled: false,
              extra_context: null,
              behavior_config: {},
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM public.conversation_messages')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM public.channel_connections cc')) {
          return {
            rows: [{
              provider: 'meta_cloud',
              status: 'CONNECTED',
              public_config: { phoneNumberId: 'phone-number-id' },
              secret_payload: { accessToken: 'redacted-test-token' },
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('pause_receptionist_and_open_handoff')) {
          return { rows: [{ handoff_id: 'handoff-id' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO public.conversation_messages')) {
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected test SQL: ${sql}`);
      }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    }

    it('throws before any provider effect when NVIDIA inference is unavailable so the outbox can retry', async () => {
      vi.stubEnv('RECEPTIONIST_ENABLED', 'true');
      const query = runtimeQuery();
      const nim = {
        isConfigured: () => true,
        generateChatCompletion: vi.fn().mockRejectedValue(new Error('provider timeout')),
      };
      const waba = { sendText: vi.fn(), sendFlow: vi.fn() };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const agent = new ReceptionistAgent({ nim: nim as any, waba: waba as any, query });

      await expect(agent.handleInbound(input)).rejects.toThrow('RECEPTIONIST_NIM_UNAVAILABLE');
      expect(waba.sendText).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('pauses the journey and does not fabricate success when WABA delivery is unconfirmed', async () => {
      vi.stubEnv('RECEPTIONIST_ENABLED', 'true');
      const query = runtimeQuery();
      const nim = {
        isConfigured: () => true,
        generateChatCompletion: vi.fn().mockResolvedValue({
          content: '{"intent":"greeting","escalate":false,"sendBookingFlow":false}\nOlá! Como posso ajudar?',
          model: 'test-model',
          latencyMs: 12,
        }),
      };
      const waba = {
        sendText: vi.fn().mockRejectedValue(new Error('ambiguous timeout')),
        sendFlow: vi.fn(),
      };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const agent = new ReceptionistAgent({ nim: nim as any, waba: waba as any, query });

      const result = await agent.handleInbound(input);

      expect(result).toMatchObject({
        reply: '',
        escalated: true,
        bookingFlowSent: false,
        skipped: 'waba_delivery_unconfirmed_handoff_required',
      });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('pause_receptionist_and_open_handoff'),
        expect.arrayContaining([input.journeyId, input.workspaceId])
      );
      expect(errorSpy).toHaveBeenCalled();
    });

    it('treats a missing provider message id as unconfirmed delivery', async () => {
      vi.stubEnv('RECEPTIONIST_ENABLED', 'true');
      const query = runtimeQuery();
      const nim = {
        isConfigured: () => true,
        generateChatCompletion: vi.fn().mockResolvedValue({
          content: '{"intent":"greeting","escalate":false,"sendBookingFlow":false}\nOlá!',
          model: 'test-model',
          latencyMs: 8,
        }),
      };
      const waba = {
        sendText: vi.fn().mockResolvedValue({ messageId: '' }),
        sendFlow: vi.fn(),
      };
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const agent = new ReceptionistAgent({ nim: nim as any, waba: waba as any, query });

      const result = await agent.handleInbound(input);

      expect(result.skipped).toBe('waba_delivery_unconfirmed_handoff_required');
      expect(result.reply).toBe('');
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.conversation_messages'),
        expect.anything()
      );
    });

    it('routes an autonomous WAHA journey through its bound session, never through WABA', async () => {
      vi.stubEnv('RECEPTIONIST_ENABLED', 'true');
      const input = { ...thisInputForWaha() };
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('j.bot_enabled')) {
          return {
            rows: [{
              bot_enabled: true,
              bot_paused_at: null,
              responder_owner: 'sos_sales',
              responder_mode: 'sos_sales',
              runtime_enabled: true,
              autonomy_mode: 'autonomous_24_7',
              published_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM public.workspace_agent_config')) {
          return {
            rows: [{
              workspace_name: 'Empresa WAHA',
              agent_name: 'Assistente',
              business_type: 'Serviços',
              services_json: [{ name: 'Serviço conhecido' }],
              working_hours: 'Seg a Sex 09h-18h',
              phone: '+5549999999999',
              city: 'Chapecó',
              booking_url: null,
              booking_flow_enabled: false,
              extra_context: null,
              behavior_config: {},
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('workspace_intelligence_bundles')) return { rows: [], rowCount: 0 };
        if (sql.includes('workspace_knowledge_documents')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM public.conversation_messages')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM public.channel_connections cc')) {
          return {
            rows: [{
              provider: 'waha',
              status: 'CONNECTED',
              public_config: { sessionName: 'sos-sales' },
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO public.conversation_messages')) return { rows: [], rowCount: 1 };
        throw new Error(`Unexpected test SQL: ${sql}`);
      }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
      const nim = {
        isConfigured: () => true,
        generateChatCompletion: vi.fn().mockResolvedValue({
          content: '{"intent":"greeting","escalate":false,"sendBookingFlow":false}\nOlá pelo WhatsApp!',
          model: 'test-model',
          latencyMs: 10,
        }),
      };
      const waba = { sendText: vi.fn(), sendFlow: vi.fn() };
      const waha = {
        sendText: vi.fn().mockResolvedValue({
          success: true,
          providerMessageId: 'waha-message-1',
          rawResponse: { id: 'waha-message-1' },
        }),
      };
      const agent = new ReceptionistAgent({ nim: nim as any, waba: waba as any, waha: waha as any, query });

      const result = await agent.handleInbound(input);

      expect(result).toMatchObject({ reply: 'Olá pelo WhatsApp!', escalated: false, bookingFlowSent: false });
      expect(waha.sendText).toHaveBeenCalledWith({
        session: 'sos-sales',
        chatId: '5549999999999@c.us',
        text: 'Olá pelo WhatsApp!',
      });
      expect(waba.sendText).not.toHaveBeenCalled();
    });

    it('reserves a keyed outbound before WAHA and never replays a sent reply', async () => {
      vi.stubEnv('RECEPTIONIST_ENABLED', 'true');
      const input = {
        ...thisInputForWaha(),
        conversationMessageId: '50000000-0000-4000-8000-000000000005',
      };
      let reservationReads = 0;
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('j.bot_enabled')) {
          return {
            rows: [{
              bot_enabled: true,
              bot_paused_at: null,
              responder_owner: 'sos_sales',
              responder_mode: 'sos_sales',
              runtime_enabled: true,
              autonomy_mode: 'autonomous_24_7',
              published_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM public.workspace_agent_config')) {
          return {
            rows: [{
              workspace_name: 'Empresa WAHA',
              agent_name: 'Assistente',
              business_type: 'Serviços',
              services_json: [{ name: 'Serviço conhecido' }],
              working_hours: 'Seg a Sex 09h-18h',
              phone: '+5549999999999',
              city: 'Chapecó',
              booking_url: null,
              booking_flow_enabled: false,
              extra_context: null,
              behavior_config: {},
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('workspace_intelligence_bundles')) return { rows: [], rowCount: 0 };
        if (sql.includes('workspace_knowledge_documents')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM public.conversation_messages')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM public.channel_connections cc')) {
          return {
            rows: [{ provider: 'waha', status: 'CONNECTED', public_config: { sessionName: 'sos-sales' } }],
            rowCount: 1,
          };
        }
        if (sql.includes('reserve_receptionist_outbound')) {
          reservationReads += 1;
          return {
            rows: [{ reservation: reservationReads === 1
              ? { reservationId: 'reservation-1', status: 'SENDING', shouldSend: true }
              : { reservationId: 'reservation-1', status: 'SENT', shouldSend: false, providerMessageId: 'waha-reply-1' } }],
            rowCount: 1,
          };
        }
        if (sql.includes('complete_receptionist_outbound')) return { rows: [{ ok: true }], rowCount: 1 };
        throw new Error(`Unexpected test SQL: ${sql}`);
      }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
      const nim = {
        isConfigured: () => true,
        generateChatCompletion: vi.fn().mockResolvedValue({
          content: '{"intent":"greeting","escalate":false,"sendBookingFlow":false}\nOlá pelo WhatsApp!',
          model: 'test-model',
          latencyMs: 10,
        }),
      };
      const waha = {
        sendText: vi.fn().mockResolvedValue({
          success: true,
          providerMessageId: 'waha-reply-1',
          rawResponse: { id: 'waha-reply-1' },
        }),
      };
      const agent = new ReceptionistAgent({ nim: nim as any, waha: waha as any, query });

      const first = await agent.handleInbound(input);
      const second = await agent.handleInbound(input);

      expect(first.reply).toBe('Olá pelo WhatsApp!');
      expect(second).toMatchObject({ reply: '', skipped: 'outbound_already_sent' });
      expect(waha.sendText).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('reserve_receptionist_outbound'),
        expect.arrayContaining([input.conversationMessageId]),
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('complete_receptionist_outbound'),
        expect.arrayContaining(['reservation-1', 'waha-reply-1']),
      );
    });
  });
});

function thisInputForWaha() {
  return {
    workspaceId: '10000000-0000-4000-8000-000000000001',
    journeyId: '20000000-0000-4000-8000-000000000002',
    contactId: '30000000-0000-4000-8000-000000000003',
    fromPhone: '+5549999999999',
    pushName: 'Cliente WAHA',
    textContent: 'Olá',
    messageType: 'text',
    channelConnectionId: '40000000-0000-4000-8000-000000000004',
    phoneNumberId: null,
  };
}

describe('receptionist responder ownership policy', () => {
  const freshMetaCheck = new Date().toISOString();
  const base = {
    responderMode: 'auto_fallback' as const,
    responderOwner: 'sos_sales' as const,
    metaAgentEnabled: false,
    metaAgentId: null,
    metaAgentEligibilityStatus: 'UNKNOWN' as const,
  };

  it('uses SOS Sales when fallback mode has no ready Meta agent', async () => {
    const { shouldSosSalesRespond } = await import('../../src/application/agents/receptionist-agent.js');
    expect(shouldSosSalesRespond(base)).toBe(true);
  });

  it('does not let SOS Sales answer while a ready Meta agent owns the default', async () => {
    const { shouldSosSalesRespond } = await import('../../src/application/agents/receptionist-agent.js');
    expect(shouldSosSalesRespond({
      ...base,
      responderOwner: 'meta_business_agent',
      metaAgentEnabled: true,
      metaAgentId: 'agent-1',
      metaAgentEligibilityStatus: 'ELIGIBLE',
      metaAgentCheckedAt: freshMetaCheck,
      metaAgentActivationStatus: 'READY',
    })).toBe(false);
    expect(shouldSosSalesRespond({
      ...base,
      metaAgentEnabled: true,
      metaAgentId: 'agent-1',
      metaAgentEligibilityStatus: 'ELIGIBLE',
      metaAgentCheckedAt: freshMetaCheck,
      metaAgentActivationStatus: 'READY',
    })).toBe(false);
  });

  it('does not switch a Meta-owned thread while provider state is unknown', async () => {
    const { shouldSosSalesRespond } = await import('../../src/application/agents/receptionist-agent.js');
    expect(shouldSosSalesRespond({
      ...base,
      responderOwner: 'meta_business_agent',
      metaAgentEnabled: true,
      metaAgentId: 'agent-1',
      metaAgentEligibilityStatus: 'UNKNOWN',
    })).toBe(false);
    expect(shouldSosSalesRespond({
      ...base,
      metaAgentEnabled: true,
      metaAgentId: 'agent-1',
      metaAgentEligibilityStatus: 'INELIGIBLE',
    })).toBe(true);
  });

  it('falls back to SOS Sales for a stale Meta owner after an ineligible result', async () => {
    const { shouldSosSalesRespond } = await import('../../src/application/agents/receptionist-agent.js');
    expect(shouldSosSalesRespond({
      ...base,
      responderOwner: 'meta_business_agent',
      metaAgentEnabled: true,
      metaAgentId: 'agent-1',
      metaAgentEligibilityStatus: 'INELIGIBLE',
    })).toBe(true);
  });

  it('allows an explicit SOS takeover while workspace default is Meta', async () => {
    const { shouldSosSalesRespond } = await import('../../src/application/agents/receptionist-agent.js');
    expect(shouldSosSalesRespond({
      responderMode: 'meta_business_agent',
      responderOwner: 'sos_sales',
      responderChangedAt: new Date().toISOString(),
      metaAgentEnabled: true,
      metaAgentId: 'agent-1',
      metaAgentEligibilityStatus: 'ELIGIBLE',
      metaAgentCheckedAt: freshMetaCheck,
      responderChangeReason: 'meta_thread_control_take',
    })).toBe(true);
  });

  it('does not switch a Meta-owned thread on an old eligibility result', async () => {
    const { shouldSosSalesRespond } = await import('../../src/application/agents/receptionist-agent.js');
    expect(shouldSosSalesRespond({
      ...base,
      responderOwner: 'meta_business_agent',
      metaAgentEnabled: true,
      metaAgentId: 'agent-1',
      metaAgentEligibilityStatus: 'ELIGIBLE',
      metaAgentCheckedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString(),
      metaAgentActivationStatus: 'READY',
    })).toBe(false);
  });

  it('never answers automatically for a human-owned or manual conversation', async () => {
    const { shouldSosSalesRespond } = await import('../../src/application/agents/receptionist-agent.js');
    expect(shouldSosSalesRespond({ ...base, responderOwner: 'human' })).toBe(false);
    expect(shouldSosSalesRespond({ ...base, responderMode: 'manual', responderOwner: 'sos_sales' })).toBe(false);
  });
});
