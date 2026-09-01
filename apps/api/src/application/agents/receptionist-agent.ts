/**
 * TX COMMERCIAL CORE — AI RECEPTIONIST AGENT
 * 
 * Agente autônomo 24/7 que processa mensagens inbound do WABA (Meta Cloud API),
 * classifica intenções e responde usando NVIDIA NIM (Nemotron 70B).
 * 
 * Design:
 * - Consumido por worker/outbox durável após a persistência do inbound
 * - Fail-closed: verifica o estado publicado e a pausa da jornada antes do envio
 * - Escalável: pausa automaticamente quando humano é solicitado ou o envio fica incerto
 */

import { NvidiaNimEngine } from '../../infrastructure/ai/nvidia-nim-engine.js';
import { WabaClient } from '../../infrastructure/channels/meta/waba-client.js';
import { dbPool } from '../../infrastructure/database/pool.js';
import { buildSystemPrompt, WorkspaceConfig } from '../../infrastructure/ai/receptionist-system-prompt.js';

export type ReceptionistIntent =
  | 'greeting'
  | 'inquiry'
  | 'booking'
  | 'objection'
  | 'payment'
  | 'oob_hours'
  | 'human_request'
  | 'other';

export interface ReceptionistInput {
  workspaceId: string;
  journeyId: string;
  contactId: string;
  fromPhone: string;
  pushName: string;
  textContent: string;
  messageType: string;
  channelConnectionId: string;
  phoneNumberId: string;
}

export interface ReceptionistOutput {
  intent: ReceptionistIntent;
  reply: string;
  escalated: boolean;
  bookingFlowSent: boolean;
  latencyMs: number;
  model: string;
  skipped?: string;
}

export interface ReceptionistDecision {
  intent: ReceptionistIntent;
  escalate: boolean;
  sendBookingFlow: boolean;
  reply: string;
}

export interface ReceptionistActionPolicy {
  shouldEscalate: boolean;
  allowReply: boolean;
  allowBookingFlow: boolean;
  skipped?: string;
}

export interface ReceptionistAgentDependencies {
  query?: typeof dbPool.query;
  nim?: NvidiaNimEngine;
  waba?: WabaClient;
}

export type ResponderMode = 'sos_sales' | 'meta_business_agent' | 'auto_fallback' | 'manual';
export type ResponderOwner = 'sos_sales' | 'meta_business_agent' | 'human';

/**
 * Resolves the automatic responder without consulting browser state.  An
 * explicit per-conversation takeover may override a workspace default; a
 * default Meta owner falls back to SOS only in auto_fallback mode after an
 * explicit INELIGIBLE result (an UNKNOWN provider state stays fail-closed).
 */
export function shouldSosSalesRespond(input: {
  responderMode: ResponderMode;
  responderOwner: ResponderOwner;
  responderChangedAt?: string | Date | null;
  metaAgentEnabled: boolean;
  metaAgentId?: string | null;
  metaAgentEligibilityStatus: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
}): boolean {
  const metaReady = input.metaAgentEnabled
    && Boolean(input.metaAgentId)
    && input.metaAgentEligibilityStatus === 'ELIGIBLE';
  const explicitTakeover = Boolean(input.responderChangedAt);
  const metaActivationUnknown = input.metaAgentEnabled
    && input.metaAgentEligibilityStatus === 'UNKNOWN';

  if (input.responderOwner === 'human') return false;
  if (input.responderOwner === 'meta_business_agent') {
    // A previous Meta owner is allowed to fall back only after an explicit
    // INELIGIBLE result. UNKNOWN means the provider could still be live; both
    // automatic responders stay quiet until the state is reconciled.
    return input.responderMode === 'auto_fallback'
      && !metaReady
      && !metaActivationUnknown
      && (input.metaAgentEligibilityStatus === 'INELIGIBLE'
        || (!input.metaAgentEnabled && !input.metaAgentId));
  }
  if (input.responderMode === 'manual') return false;
  if (input.responderMode === 'meta_business_agent' && !explicitTakeover) return false;
  if (input.responderMode === 'auto_fallback' && !explicitTakeover) {
    if (metaReady || metaActivationUnknown) return false;
  }
  return true;
}

const RECEPTIONIST_INTENTS = new Set<ReceptionistIntent>([
  'greeting',
  'inquiry',
  'booking',
  'objection',
  'payment',
  'oob_hours',
  'human_request',
  'other',
]);

const AUTONOMOUS_REPLY_INTENTS = new Set<ReceptionistIntent>([
  'greeting',
  'inquiry',
  'booking',
  'oob_hours',
]);

const MAX_AUTONOMOUS_REPLY_LENGTH = 2000;

/**
 * Parses the model protocol strictly. A model response is untrusted input: it
 * cannot select arbitrary actions, omit the classification envelope, or send a
 * booking flow for a different intent.
 */
export function parseReceptionistDecision(rawResponse: string): ReceptionistDecision | null {
  const lines = rawResponse.trim().split('\n');
  const header = lines.shift()?.trim();
  if (!header?.startsWith('{') || !header.endsWith('}')) return null;

  try {
    const parsed: unknown = JSON.parse(header);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const decision = parsed as Record<string, unknown>;
    const allowedKeys = ['intent', 'escalate', 'sendBookingFlow'];
    if (Object.keys(decision).some((key) => !allowedKeys.includes(key))) return null;
    if (typeof decision.intent !== 'string' || !RECEPTIONIST_INTENTS.has(decision.intent as ReceptionistIntent)) return null;
    if (typeof decision.escalate !== 'boolean' || typeof decision.sendBookingFlow !== 'boolean') return null;

    const intent = decision.intent as ReceptionistIntent;
    const reply = lines.join('\n').trim();
    if (reply.length > MAX_AUTONOMOUS_REPLY_LENGTH) return null;
    if (!reply && intent !== 'human_request') return null;
    if (intent === 'human_request' && decision.escalate !== true) return null;
    if (decision.sendBookingFlow === true && intent !== 'booking') return null;
    if (decision.escalate === true && decision.sendBookingFlow === true) return null;

    return {
      intent,
      escalate: decision.escalate,
      sendBookingFlow: decision.sendBookingFlow,
      reply,
    };
  } catch {
    return null;
  }
}

/** Applies the deterministic outbound policy; the model never chooses it. */
export function getReceptionistActionPolicy(decision: ReceptionistDecision): ReceptionistActionPolicy {
  const mustEscalate = decision.escalate
    || decision.intent === 'human_request'
    || decision.intent === 'objection'
    || decision.intent === 'payment';

  if (mustEscalate) {
    return { shouldEscalate: true, allowReply: false, allowBookingFlow: false, skipped: 'human_handoff_required' };
  }

  if (!AUTONOMOUS_REPLY_INTENTS.has(decision.intent)) {
    return { shouldEscalate: false, allowReply: false, allowBookingFlow: false, skipped: 'intent_not_allowed_for_autonomous_outbound' };
  }

  return {
    shouldEscalate: false,
    allowReply: Boolean(decision.reply),
    allowBookingFlow: decision.intent === 'booking' && decision.sendBookingFlow,
  };
}

const GEMINI_BOOK_FLOW_ID = process.env.WABA_BOOKING_FLOW_ID || '';
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct';

export class ReceptionistAgent {
  private readonly nim: NvidiaNimEngine;
  private readonly waba: WabaClient;
  private readonly query: typeof dbPool.query;

  constructor(dependencies: ReceptionistAgentDependencies = {}) {
    this.nim = dependencies.nim || new NvidiaNimEngine(
      process.env.NVIDIA_API_KEY,
      process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      NVIDIA_MODEL
    );
    this.waba = dependencies.waba || new WabaClient();
    this.query = dependencies.query || dbPool.query.bind(dbPool);
  }

  /**
   * Carrega a configuração do agente para o workspace a partir da tabela
   * workspace_agent_config. Ausência, schema incompleto ou erro de banco são
   * falhas fechadas: configuração hardcoded nunca autoriza outbound autônomo.
   */
  private async loadWorkspaceConfig(workspaceId: string): Promise<WorkspaceConfig | null> {
    try {
      const result = await this.query(
        `SELECT
           wac.agent_name,
           wac.business_type,
           wac.services_json,
           wac.working_hours,
           wac.phone,
           wac.city,
           wac.booking_url,
           wac.booking_flow_enabled,
           wac.extra_context,
           wac.behavior_config,
           w.name AS workspace_name
         FROM public.workspace_agent_config wac
         JOIN public.workspaces w ON w.id = wac.workspace_id
         WHERE wac.workspace_id = $1`,
        [workspaceId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const rawServices = row.services_json;
      const services: WorkspaceConfig['services'] = Array.isArray(rawServices)
        ? rawServices.map((s: Record<string, unknown>) => ({
            name: String(s.name || ''),
            ...(s.duration ? { duration: String(s.duration) } : {}),
            ...(s.price ? { price: String(s.price) } : {}),
          }))
        : [];

      return {
        name: String(row.workspace_name || row.agent_name || 'Empresa'),
        agentName: String(row.agent_name || 'Assistente'),
        businessType: String(row.business_type || 'Prestação de serviços'),
        services,
        workingHours: String(row.working_hours || 'Segunda a Sexta, das 9h às 18h'),
        phone: String(row.phone || ''),
        city: String(row.city || 'Brasil'),
        bookingUrl: row.booking_url ? String(row.booking_url) : undefined,
        bookingFlowEnabled: Boolean(row.booking_flow_enabled),
        extraContext: row.extra_context ? String(row.extra_context) : undefined,
        behavior: row.behavior_config && typeof row.behavior_config === 'object'
          ? row.behavior_config
          : {},
      };
    } catch (err) {
      console.error('[ReceptionistAgent] Could not load published workspace config; outbound disabled', err);
      return null;
    }
  }

  public isEnabled(): boolean {
    return process.env.RECEPTIONIST_ENABLED === 'true' && this.nim.isConfigured();
  }

  /**
   * Verifica se o bot está habilitado E não pausado para esta jornada específica.
   *
   * Lógica em duas camadas (fail-closed):
   * 1. bot_enabled = true  → operador ativou explicitamente o bot para esta jornada
   * 2. bot_paused_at IS NULL → nenhum humano assumiu o atendimento no momento
   *
   * Ambas as condições devem ser verdadeiras para permitir outbound automático.
   * Erros de banco ou schema nunca habilitam mensagens.
   */
  private async isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean> {
    try {
      const result = await this.query(
        `SELECT
           j.bot_enabled,
           j.bot_paused_at,
           j.responder_owner,
           j.responder_changed_at,
           wac.runtime_enabled,
           wac.autonomy_mode,
           wac.responder_mode,
           wac.meta_agent_id,
           wac.meta_agent_enabled,
           wac.meta_agent_eligibility_status,
           wac.published_at
         FROM public.commercial_journeys j
         LEFT JOIN public.workspace_agent_config wac
           ON wac.workspace_id = j.workspace_id
         WHERE j.id = $1 AND j.workspace_id = $2`,
        [journeyId, workspaceId]
      );
      if (result.rows.length !== 1) return false;
      const {
        bot_enabled,
        bot_paused_at,
        responder_owner,
        responder_changed_at,
        runtime_enabled,
        autonomy_mode,
        responder_mode,
        meta_agent_id,
        meta_agent_enabled,
        meta_agent_eligibility_status,
        published_at,
      } = result.rows[0];
      return bot_enabled === true
        && !bot_paused_at
        && runtime_enabled === true
        && autonomy_mode === 'autonomous_24_7'
        && Boolean(published_at)
        && shouldSosSalesRespond({
          responderMode: responder_mode || 'sos_sales',
          responderOwner: responder_owner || 'sos_sales',
          responderChangedAt: responder_changed_at,
          metaAgentEnabled: meta_agent_enabled === true,
          metaAgentId: meta_agent_id,
          metaAgentEligibilityStatus: meta_agent_eligibility_status || 'UNKNOWN',
        });
    } catch (error) {
      console.error('[ReceptionistAgent] Could not verify bot state; outbound skipped', error);
      return false;
    }
  }

  /**
   * Busca o histórico recente de mensagens para contexto
   */
  private async getConversationContext(
    workspaceId: string,
    journeyId: string,
    limit = 10
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    try {
      const result = await this.query(
        `SELECT direction, text_content, sent_at
         FROM public.conversation_messages
         WHERE workspace_id = $1 AND journey_id = $2
           AND text_content IS NOT NULL AND text_content != ''
         ORDER BY sent_at DESC
         LIMIT $3`,
        [workspaceId, journeyId, limit]
      );

      return result.rows
        .reverse()
        .map((row: { direction: string; text_content: string }) => ({
          role: row.direction === 'inbound' ? 'user' as const : 'assistant' as const,
          content: row.text_content,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Pausa o bot para a jornada e registra quem pausou
   */
  /**
   * Resolve WABA credentials for outbound sends.
   * Token lives only in channel_connection_secrets and is scoped by both
   * connection and workspace to preserve tenant isolation.
   */
  private async resolveWabaCreds(
    workspaceId: string,
    channelConnectionId: string,
    fallbackPhoneNumberId: string
  ): Promise<{ phoneNumberId: string; accessToken: string }> {
    const chanResult = await this.query(
      `SELECT cc.public_config, cs.secret_payload
       FROM public.channel_connections cc
       LEFT JOIN public.channel_connection_secrets cs
         ON cs.channel_connection_id = cc.id
        AND cs.secret_kind = 'meta_bearer_token'
       WHERE cc.id = $1 AND cc.workspace_id = $2`,
      [channelConnectionId, workspaceId]
    );
    const raw = chanResult.rows[0]?.public_config;
    const cfg = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const secretRaw = chanResult.rows[0]?.secret_payload;
    const secretPayload = typeof secretRaw === 'string' ? JSON.parse(secretRaw) : (secretRaw || {});
    const phoneNumberId: string = cfg.phoneNumberId || fallbackPhoneNumberId;
    const accessToken: string = secretPayload.accessToken || '';
    if (!accessToken) {
      throw new Error(`WABA access token not found for channel ${channelConnectionId}`);
    }
    return { phoneNumberId, accessToken };
  }

  private async pauseBotForJourney(workspaceId: string, journeyId: string, reason: string): Promise<boolean> {
    try {
      const result = await this.query(
        `SELECT public.pause_receptionist_and_open_handoff($2, $1, $3) AS handoff_id`,
        [journeyId, workspaceId, reason]
      );
      return result.rowCount === 1 && Boolean(result.rows[0]?.handoff_id);
    } catch {
      return false;
    }
  }

  /**
   * Registra a resposta do agente no banco de conversas
   */
  private async saveAgentReply(
    workspaceId: string,
    journeyId: string,
    contactId: string,
    channelConnectionId: string,
    reply: string,
    providerId: string
  ): Promise<void> {
    await this.query(
      `INSERT INTO public.conversation_messages (
         id, workspace_id, channel_connection_id, journey_id, contact_id,
         direction, sender_type, provider_message_id, text_content, media_payload, sent_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4,
         'outbound', 'bot', $5, $6,
         '{"engine":"nvidia_nim_nemotron","source":"receptionist_agent"}'::jsonb,
         NOW()
       )
       ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING`,
      [workspaceId, channelConnectionId, journeyId, contactId, providerId, reply]
    );
  }

  /** Ponto de entrada principal — consumido pelo ReceptionistInboundWorker. */
  public async handleInbound(input: ReceptionistInput): Promise<ReceptionistOutput> {
    const start = Date.now();

    if (!this.isEnabled()) {
      return { intent: 'other', reply: '', escalated: false, bookingFlowSent: false, latencyMs: 0, model: '', skipped: 'agent_disabled' };
    }

    // Não responde a mensagens vazias, mídia sem texto, etc.
    if (!input.textContent || input.textContent.startsWith('[') || input.messageType === 'audio') {
      return { intent: 'other', reply: '', escalated: false, bookingFlowSent: false, latencyMs: 0, model: '', skipped: 'no_text_content' };
    }

    // Verifica se bot está ativo para esta jornada
    const botActive = await this.isBotActiveForJourney(input.workspaceId, input.journeyId);
    if (!botActive) {
      return { intent: 'other', reply: '', escalated: false, bookingFlowSent: false, latencyMs: 0, model: '', skipped: 'bot_paused_for_journey' };
    }

    // Busca somente a configuração publicada do workspace; ausência bloqueia outbound.
    const wsConfig = await this.loadWorkspaceConfig(input.workspaceId);
    if (!wsConfig) {
      return {
        intent: 'other',
        reply: '',
        escalated: false,
        bookingFlowSent: false,
        latencyMs: Date.now() - start,
        model: '',
        skipped: 'workspace_config_unavailable',
      };
    }
    const systemPrompt = buildSystemPrompt(wsConfig);

    // Busca histórico de contexto
    const history = await this.getConversationContext(input.workspaceId, input.journeyId, 8);

    // Monta mensagens para o NIM
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history,
      { role: 'user' as const, content: `${input.pushName || 'Cliente'}: ${input.textContent}` },
    ];

    let rawResponse = '';
    let usedModel = NVIDIA_MODEL;
    let latencyMs = 0;

    try {
      const result = await this.nim.generateChatCompletion(messages, {
        temperature: 0.25,
        maxTokens: 512,
        topP: 0.9,
      });
      rawResponse = result.content;
      usedModel = result.model;
      latencyMs = result.latencyMs;
    } catch (err) {
      console.error('[ReceptionistAgent] NVIDIA NIM error:', err);
      // Inference has not produced any irreversible external effect. Throwing
      // lets the leased outbox worker retry safely instead of acknowledging and
      // losing the customer's message.
      throw new Error('RECEPTIONIST_NIM_UNAVAILABLE');
    }

    const decision = parseReceptionistDecision(rawResponse);
    if (!decision) {
      // Invalid model output is also safe to retry: no provider call happened.
      throw new Error('RECEPTIONIST_INVALID_MODEL_OUTPUT');
    }
    const policy = getReceptionistActionPolicy(decision);
    if (policy.shouldEscalate) {
      const paused = await this.pauseBotForJourney(input.workspaceId, input.journeyId, `Intent: ${decision.intent} — escalado pelo agente IA`);
      return {
        intent: decision.intent,
        reply: '',
        escalated: paused,
        bookingFlowSent: false,
        latencyMs,
        model: usedModel,
        skipped: paused ? policy.skipped : 'escalation_state_update_failed',
      };
    }

    if (!policy.allowReply && !policy.allowBookingFlow) {
      return { intent: decision.intent, reply: '', escalated: false, bookingFlowSent: false, latencyMs, model: usedModel, skipped: policy.skipped };
    }

    // A human may have paused the journey while the model was processing. Check
    // again immediately before any irreversible provider call.
    if (!await this.isBotActiveForJourney(input.workspaceId, input.journeyId)) {
      return { intent: decision.intent, reply: '', escalated: false, bookingFlowSent: false, latencyMs, model: usedModel, skipped: 'bot_paused_before_outbound' };
    }

    const replyText = policy.allowReply ? decision.reply : '';

    // Envia resposta via WABA se houver texto
    let providerId = '';
    if (replyText && replyText.length > 0) {
      try {
        const creds = await this.resolveWabaCreds(input.workspaceId, input.channelConnectionId, input.phoneNumberId);
        const toNumber = input.fromPhone.replace(/\D/g, '');
        const sendResult = await this.waba.sendText({
          phoneNumberId: creds.phoneNumberId,
          accessToken: creds.accessToken,
          recipientPhone: toNumber,
          text: replyText,
        });
        if (!sendResult.messageId) {
          throw new Error('WABA_PROVIDER_MESSAGE_ID_MISSING');
        }
        providerId = sendResult.messageId;

        // Salva no banco
        await this.saveAgentReply(
          input.workspaceId,
          input.journeyId,
          input.contactId,
          input.channelConnectionId,
          replyText,
          providerId
        );
      } catch (sendErr) {
        console.error('[ReceptionistAgent] Error sending WABA message:', sendErr);
        // A transport error may be ambiguous: Meta can have accepted the
        // message even when the client did not receive the response. Retrying
        // the whole receptionist event could duplicate a customer message.
        // Pause and hand control to a human instead of retrying blindly.
        const paused = await this.pauseBotForJourney(
          input.workspaceId,
          input.journeyId,
          'Falha ou confirmação ambígua no envio WABA — revisão humana obrigatória'
        );
        return {
          intent: decision.intent,
          reply: '',
          escalated: paused,
          bookingFlowSent: false,
          latencyMs,
          model: usedModel,
          skipped: paused
            ? 'waba_delivery_unconfirmed_handoff_required'
            : 'waba_delivery_unconfirmed_pause_failed',
        };
      }
    }

    // Envia WhatsApp Flow de agendamento se solicitado
    let bookingFlowSent = false;
    if (policy.allowBookingFlow && wsConfig.bookingFlowEnabled && GEMINI_BOOK_FLOW_ID) {
      try {
        if (!await this.isBotActiveForJourney(input.workspaceId, input.journeyId)) {
          return { intent: decision.intent, reply: replyText, escalated: false, bookingFlowSent: false, latencyMs, model: usedModel, skipped: 'bot_paused_before_booking_flow' };
        }
        const toNumber = input.fromPhone.replace(/\D/g, '');
        const creds = await this.resolveWabaCreds(input.workspaceId, input.channelConnectionId, input.phoneNumberId);
        await this.waba.sendFlow({
          phoneNumberId: creds.phoneNumberId,
          accessToken: creds.accessToken,
          recipientPhone: toNumber,
          flowId: GEMINI_BOOK_FLOW_ID,
          flowCta: 'Agendar horário',
          bodyText: `${input.pushName ? `${input.pushName}, ` : ''}escolha o melhor horário para você na ${wsConfig.name}.`,
          flowData: {
            workspace_name: wsConfig.name,
            customer_name: input.pushName,
          },
        });
        bookingFlowSent = true;
      } catch (flowErr) {
        console.error('[ReceptionistAgent] Error sending Flow:', flowErr);
        // The text may already have been accepted. Do not replay it just to
        // retry the Flow; stop automation and expose the journey to a human.
        const paused = await this.pauseBotForJourney(
          input.workspaceId,
          input.journeyId,
          'Falha ou confirmação ambígua no envio do WhatsApp Flow — revisão humana obrigatória'
        );
        return {
          intent: decision.intent,
          reply: replyText,
          escalated: paused,
          bookingFlowSent: false,
          latencyMs,
          model: usedModel,
          skipped: paused
            ? 'waba_flow_unconfirmed_handoff_required'
            : 'waba_flow_unconfirmed_pause_failed',
        };
      }
    }

    return {
      intent: decision.intent,
      reply: replyText,
      escalated: false,
      bookingFlowSent,
      latencyMs,
      model: usedModel,
    };
  }
}

// Singleton para reuso — evita criação repetida de clientes
let _agentInstance: ReceptionistAgent | null = null;
export function getReceptionistAgent(): ReceptionistAgent {
  if (!_agentInstance) {
    _agentInstance = new ReceptionistAgent();
  }
  return _agentInstance;
}
