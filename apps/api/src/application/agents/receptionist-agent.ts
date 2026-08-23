/**
 * TX COMMERCIAL CORE — AI RECEPTIONIST AGENT
 * 
 * Agente autônomo 24/7 que processa mensagens inbound do WABA (Meta Cloud API),
 * classifica intenções e responde usando NVIDIA NIM (Nemotron 70B).
 * 
 * Design:
 * - Fire-and-forget: chamado após o 200 OK para a Meta (não bloqueia)
 * - Idempotente: verifica flag bot_active por jornada antes de responder
 * - Escalável: pausa automaticamente quando humano é solicitado
 */

import { NvidiaNimEngine } from '../../infrastructure/ai/nvidia-nim-engine.js';
import { WabaClient } from '../../infrastructure/channels/meta/waba-client.js';
import { dbPool } from '../../infrastructure/database/pool.js';
import { buildSystemPrompt, getWorkspaceConfig } from '../../infrastructure/ai/receptionist-system-prompt.js';

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
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct';

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

  public isEnabled(): boolean {
    return process.env.RECEPTIONIST_ENABLED === 'true' && this.nim.isConfigured();
  }

  /**
   * Verifica se o bot está ativo para esta jornada específica.
   * Fail-closed: a jornada só pode receber saída autônoma quando existe e está
   * explicitamente ativa. Erros de banco ou schema não habilitam mensagens.
   */
  private async isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean> {
    try {
      const result = await this.query(
        `SELECT bot_paused_at FROM public.commercial_journeys WHERE id = $1 AND workspace_id = $2`,
        [journeyId, workspaceId]
      );
      if (result.rows.length !== 1) return false;
      return !result.rows[0].bot_paused_at;
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
        `UPDATE public.commercial_journeys 
         SET bot_paused_at = NOW(), bot_pause_reason = $3
         WHERE id = $1 AND workspace_id = $2`,
        [journeyId, workspaceId, reason]
      );
      return result.rowCount === 1;
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

  /**
   * Ponto de entrada principal — chamado via setImmediate() após salvar mensagem no DB
   */
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

    // Busca configuração do workspace
    const wsConfig = getWorkspaceConfig(input.workspaceId);
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
      return { intent: 'other', reply: '', escalated: false, bookingFlowSent: false, latencyMs: Date.now() - start, model: usedModel, skipped: 'nim_error' };
    }

    const decision = parseReceptionistDecision(rawResponse);
    if (!decision) {
      return { intent: 'other', reply: '', escalated: false, bookingFlowSent: false, latencyMs, model: usedModel, skipped: 'invalid_model_output' };
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
        providerId = sendResult.messageId || `bot_${Date.now()}`;

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
