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

import { createHash } from 'node:crypto';
import { NVIDIA_MODEL_TIERS, NvidiaNimEngine } from '../../infrastructure/ai/nvidia-nim-engine.js';
import { WabaClient } from '../../infrastructure/channels/meta/waba-client.js';
import { WahaOutboundAdapter } from '../../infrastructure/channels/waha/waha-outbound-adapter.js';
import { dbPool } from '../../infrastructure/database/pool.js';
import { buildSystemPrompt, WorkspaceConfig } from '../../infrastructure/ai/receptionist-system-prompt.js';
import { HumanizerKernel } from '../../infrastructure/ai/humanizer-kernel.js';

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
  /** Meta Cloud phone number id. WAHA inbound events intentionally omit it. */
  phoneNumberId: string | null;
  /**
   * Stable inbound message identity used to reserve irreversible replies.
   * The receptionist worker derives it from the outbox aggregate when older
   * payloads do not carry the explicit field.
   */
  conversationMessageId?: string;
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
  waha?: WahaOutboundAdapter;
}

export type ResponderMode = 'sos_sales' | 'meta_business_agent' | 'auto_fallback' | 'manual';
export type ResponderOwner = 'sos_sales' | 'meta_business_agent' | 'human';

// Meta eligibility is explicitly non-permanent. Keep a bounded freshness
// window so an old READY flag cannot silently suppress SOS Sales after a
// token, account standing, or phone-number eligibility changes.
export const META_AGENT_ELIGIBILITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isMetaAgentEligibilityFresh(
  checkedAt: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  const timestamp = checkedAt instanceof Date
    ? checkedAt.getTime()
    : typeof checkedAt === 'string'
      ? Date.parse(checkedAt)
      : Number.NaN;
  if (!Number.isFinite(timestamp)) return false;

  const age = now - timestamp;
  // Allow a small amount of clock skew while rejecting future timestamps that
  // would otherwise keep an unverifiable Meta state alive indefinitely.
  return age >= -5 * 60 * 1000 && age <= META_AGENT_ELIGIBILITY_MAX_AGE_MS;
}

export interface MetaAgentReadinessInput {
  metaAgentEnabled: boolean;
  metaAgentId?: string | null;
  /** Exact CRM channel bound to the Meta agent. A missing binding is never a wildcard. */
  metaAgentChannelConnectionId?: string | null;
  metaAgentEligibilityStatus: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
  metaAgentCheckedAt?: string | Date | null;
  metaAgentActivationStatus?: 'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED';
}

export function isMetaAgentReady(input: MetaAgentReadinessInput): boolean {
  return input.metaAgentEnabled
    && Boolean(input.metaAgentId)
    && Boolean(input.metaAgentChannelConnectionId)
    && input.metaAgentEligibilityStatus === 'ELIGIBLE'
    // A Meta agent owns a conversation only after the non-billing Meta test
    // completed successfully and the eligibility proof is still fresh.
    && input.metaAgentActivationStatus === 'READY'
    && isMetaAgentEligibilityFresh(input.metaAgentCheckedAt);
}

/**
 * Resolves the automatic responder without consulting browser state.  An
 * explicit per-conversation takeover may override a workspace default. In
 * auto_fallback can select SOS Sales before Meta owns a conversation. Once a
 * thread is explicitly owned by Meta, this policy does not silently switch
 * providers: a takeover must first be confirmed through Meta thread control.
 * This prevents a transient eligibility outage from producing two replies.
 */
export function shouldSosSalesRespond(input: {
  responderMode: ResponderMode;
  responderOwner: ResponderOwner;
  responderChangedAt?: string | Date | null;
  responderChangeReason?: string | null;
  metaAgentEnabled: boolean;
  metaAgentId?: string | null;
  metaAgentChannelConnectionId?: string | null;
  metaAgentEligibilityStatus: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
  metaAgentCheckedAt?: string | Date | null;
  metaAgentActivationStatus?: 'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED';
}): boolean {
  const metaReady = isMetaAgentReady(input);
  const explicitTakeover = Boolean(input.responderChangedAt)
    && /take|operator|human/i.test(input.responderChangeReason || '');

  if (input.responderOwner === 'human') return false;
  if (input.responderOwner === 'meta_business_agent') {
    // Do not infer a provider handoff from a stale/unknown status. The Meta
    // thread remains owned by Meta until a successful `take` transition
    // persists `responder_owner = sos_sales`. A proven INELIGIBLE result is
    // the one safe automatic fallback because Meta can no longer answer this
    // number; transient UNKNOWN/expired ELIGIBLE states stay fail-closed.
    return input.responderMode === 'auto_fallback'
      && input.metaAgentEligibilityStatus === 'INELIGIBLE';
  }
  if (input.responderMode === 'manual') return false;
  if (input.responderMode === 'meta_business_agent') {
    // Selecting Meta-only never silently falls back to SOS Sales. An
    // operator takeover is represented by the persisted SOS owner after Meta
    // confirms the `take` operation.
    return input.responderOwner === 'sos_sales' && explicitTakeover;
  }
  if (input.responderMode === 'auto_fallback' && !explicitTakeover) {
    if (metaReady) return false;
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

const INTENT_SYNONYMS: Record<string, ReceptionistIntent> = {
  greeting: 'greeting',
  saudacao: 'greeting',
  saudação: 'greeting',
  ola: 'greeting',
  oi: 'greeting',
  sos: 'greeting',
  inquiry: 'inquiry',
  duvida: 'inquiry',
  dúvida: 'inquiry',
  informacao: 'inquiry',
  informação: 'inquiry',
  servicos: 'inquiry',
  serviços: 'inquiry',
  preco: 'inquiry',
  preço: 'inquiry',
  booking: 'booking',
  agendamento: 'booking',
  agendar: 'booking',
  objection: 'objection',
  objecao: 'objection',
  objeção: 'objection',
  desconto: 'objection',
  payment: 'payment',
  pagamento: 'payment',
  pix: 'payment',
  oob_hours: 'oob_hours',
  fora_horario: 'oob_hours',
  human_request: 'human_request',
  humano: 'human_request',
  atendente: 'human_request',
  other: 'other',
  outro: 'other',
  outros: 'other',
};

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
  if (!rawResponse || typeof rawResponse !== 'string') return null;

  let cleaned = rawResponse.trim();
  // 1. Remove thinking blocks (<think>...</think>) if present
  if (cleaned.includes('</think>')) {
    cleaned = cleaned.split('</think>').pop()!.trim();
  }

  // 2. Extract JSON envelope from the beginning even if wrapped in markdown code fence
  let header = '';
  let restOfText = '';

  const jsonBlockMatch = cleaned.match(/^```(?:json)?\s*(\{[\s\S]*?\})\s*```([\s\S]*)$/i);
  if (jsonBlockMatch) {
    header = jsonBlockMatch[1].trim();
    restOfText = jsonBlockMatch[2].trim();
  } else {
    const braceMatch = cleaned.match(/^\s*(\{[^}]+\})\s*([\s\S]*)$/);
    if (braceMatch) {
      header = braceMatch[1].trim();
      restOfText = braceMatch[2].trim();
    } else {
      const lines = cleaned.split('\n');
      header = lines.shift()?.trim() || '';
      restOfText = lines.join('\n').trim();
    }
  }

  if (!header.startsWith('{') || !header.endsWith('}')) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(header);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const decision = parsed as Record<string, unknown>;
    const allowedKeys = ['intent', 'escalate', 'sendBookingFlow', 'reason'];
    if (Object.keys(decision).some((key) => !allowedKeys.includes(key))) return null;

    const rawIntent = typeof decision.intent === 'string' ? decision.intent.trim().toLowerCase() : '';
    const normalizedIntent = INTENT_SYNONYMS[rawIntent] || (RECEPTIONIST_INTENTS.has(rawIntent as ReceptionistIntent) ? rawIntent as ReceptionistIntent : null);
    if (!normalizedIntent) return null;
    const intent = normalizedIntent;

    if (typeof decision.escalate !== 'boolean' || typeof decision.sendBookingFlow !== 'boolean') return null;
    if (decision.sendBookingFlow === true && intent !== 'booking') return null;
    if (decision.escalate === true && decision.sendBookingFlow === true) return null;
    if (intent === 'human_request' && decision.escalate !== true) return null;

    let cleanText = restOfText.trim();
    // Limpa qualquer envelope JSON ou bloco de thinking residual
    cleanText = cleanText.replace(/^\s*\{[^}]*\}\s*/g, '').trim();
    cleanText = cleanText.replace(/^(?:Here's a thinking process:[\s\S]*?\n\n|Thinking Process:[\s\S]*?\n\n)/i, '').trim();

    let reply = HumanizerKernel.humanizeReply(cleanText);
    // Blindagem inegociável: NUNCA permitir chaves JSON vazadas na mensagem ao cliente
    reply = reply.replace(/^\s*\{[^}]*\}\s*/g, '').trim();

    if (reply.length > MAX_AUTONOMOUS_REPLY_LENGTH) return null;
    if (!reply && intent !== 'human_request') return null;

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

/**
 * Particiona o texto de resposta em mensagens de WhatsApp (micro-frases de até ~30 caracteres).
 * Se houver uma segunda ideia ou pergunta complementar, separa em:
 * - firstMessage: saudação/apresentação curta
 * - secondMessage: pergunta de avanço ou complemento para envio em segundo balão
 */
export function partitionOutboundMessages(fullText: string): { firstMessage: string; secondMessage: string | null } {
  if (!fullText || typeof fullText !== 'string') {
    return { firstMessage: '', secondMessage: null };
  }

  const trimmed = fullText.trim();

  // 1. Se o modelo separou explicitamente por quebra de linha dupla (\n\n)
  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length >= 2) {
    return {
      firstMessage: paragraphs[0],
      secondMessage: paragraphs.slice(1).join('\n\n'),
    };
  }

  // 2. Se for um bloco com saudação inicial seguida de pergunta
  // Ex: "Oi, João! Tudo bem? Aqui é a Sofia da SOS Vendas. 😊 Me conta: você já vende pelo Whats hoje?"
  const questionIndex = trimmed.indexOf('?');
  if (questionIndex !== -1 && questionIndex < trimmed.length - 1) {
    const rest = trimmed.slice(questionIndex + 1).trim();
    if (rest.length > 3) {
      return {
        firstMessage: trimmed.slice(0, questionIndex + 1).trim(),
        secondMessage: rest,
      };
    }
  }

  // 3. Se houver quebra de linha simples separando blocos
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return {
      firstMessage: lines[0],
      secondMessage: lines.slice(1).join('\n'),
    };
  }

  return { firstMessage: trimmed, secondMessage: null };
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
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || NVIDIA_MODEL_TIERS.NEMOTRON_REASONING;

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {};
    } catch {
      return {};
    }
  }
  return {};
}

function nonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function stringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatPublishedBusinessHours(profile: JsonRecord): string | undefined {
  const rawHours = asJsonRecord(profile.businessHours);
  const labels: Record<string, string> = {
    seg: 'Segunda',
    ter: 'Terça',
    qua: 'Quarta',
    qui: 'Quinta',
    sex: 'Sexta',
    sab: 'Sábado',
    dom: 'Domingo',
  };
  const openDays = Object.entries(labels)
    .map(([key, label]) => {
      const day = asJsonRecord(rawHours[key]);
      if (day.isOpen !== true) return null;
      const open = nonEmptyString(day.open);
      const close = nonEmptyString(day.close);
      return open && close ? `${label} ${open}-${close}` : label;
    })
    .filter((value): value is string => Boolean(value));
  return openDays.length > 0 ? openDays.join(', ') : undefined;
}

function parsePublishedPrice(baseVal: unknown, fallbackVal: unknown): number | undefined {
  const direct = finiteNumber(baseVal);
  if (direct !== undefined && direct > 0) return direct;
  if (typeof fallbackVal === 'number' && Number.isFinite(fallbackVal) && fallbackVal > 0) return fallbackVal;
  if (typeof fallbackVal === 'string') {
    const cleaned = fallbackVal.replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return undefined;
}

function mapPublishedCatalog(catalog: unknown): WorkspaceConfig['services'] {
  if (!Array.isArray(catalog)) return [];
  return catalog
    .map((item) => asJsonRecord(item))
    .filter((item) => item.inStock !== false)
    .map((item) => {
      const name = nonEmptyString(item.name);
      if (!name) return null;
      const price = parsePublishedPrice(item.basePrice, item.price ?? item.value);
      const duration = nonEmptyString(item.durationOrExecutionTime, item.duration);
      return {
        name,
        ...(price !== undefined && price > 0
          ? { price: price.toFixed(2).replace('.', ',') }
          : {}),
        ...(duration ? { duration } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function isSyntheticKnowledgeText(value: string): boolean {
  return /processado e vetorizado no vector store|conteúdo extraído do arquivo .*indexados no banco de inteligência/i.test(value);
}

function collectPublishedKnowledge(
  bundleDocuments: unknown,
  databaseDocuments: Array<{ title?: unknown; content?: unknown; status?: unknown }>,
): string[] {
  const snippets: string[] = [];
  const add = (title: unknown, content: unknown) => {
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text || isSyntheticKnowledgeText(text)) return;
    const label = nonEmptyString(title);
    snippets.push(`${label ? `${label}: ` : ''}${text.slice(0, 1400)}`);
  };

  if (Array.isArray(bundleDocuments)) {
    for (const rawDocument of bundleDocuments.slice(0, 30)) {
      const document = asJsonRecord(rawDocument);
      add(document.name || document.title, document.rawContentSnippet || document.summary);
    }
  }
  for (const document of databaseDocuments.slice(0, 30)) {
    if (document.status && document.status !== 'ready') continue;
    add(document.title, document.content);
  }
  return Array.from(new Set(snippets)).slice(0, 12);
}

function mapPublishedBehavior(
  current: WorkspaceConfig['behavior'],
  agentConfig: JsonRecord,
): WorkspaceConfig['behavior'] {
  const behavior = { ...(current || {}) };
  const tone = agentConfig.toneOfVoice;
  const toneMap: Record<string, NonNullable<WorkspaceConfig['behavior']>['tone']> = {
    consultivo_premium: 'elegante_acolhedor',
    energetico_direto: 'direto_objetivo',
    acolhedor_empatico: 'empatico_cuidadoso',
    tecnico_especialista: 'tecnico_formal',
    comercial_fechador: 'comercial_fechador',
    elegante_acolhedor: 'elegante_acolhedor',
    direto_objetivo: 'direto_objetivo',
    tecnico_formal: 'tecnico_formal',
    empatico_cuidadoso: 'empatico_cuidadoso',
  };
  const mappedTone = typeof tone === 'string' ? toneMap[tone] : undefined;
  if (mappedTone) behavior.tone = mappedTone;
  const maxDiscount = finiteNumber(agentConfig.maxDiscountPercent);
  if (maxDiscount !== undefined) behavior.maxDiscountPercent = Math.max(0, Math.min(100, Math.round(maxDiscount)));
  const triggers = stringArray(agentConfig.escalationTriggers, 20).join(' ').toLowerCase();
  if (triggers) {
    behavior.humanHandoffTriggers = {
      ...(behavior.humanHandoffTriggers || {
        quimicaSensivel: false,
        reclamacoes: false,
        pedidoHumano: false,
        descontoAlto: false,
      }),
      reclamacoes: behavior.humanHandoffTriggers?.reclamacoes === true || /reclama|insatisfa|urg[êe]ncia/.test(triggers),
      pedidoHumano: behavior.humanHandoffTriggers?.pedidoHumano === true || /humano|atendente|operador/.test(triggers),
      descontoAlto: behavior.humanHandoffTriggers?.descontoAlto === true || /desconto|condi[cç][aã]o/.test(triggers),
    };
  }
  return behavior;
}

function applyPublishedIntelligence(
  base: WorkspaceConfig,
  bundleValue: unknown,
  databaseDocuments: Array<{ title?: unknown; content?: unknown; status?: unknown }>,
): WorkspaceConfig {
  const bundle = asJsonRecord(bundleValue);
  const profile = asJsonRecord(bundle.companyProfile);
  const agentConfig = asJsonRecord(bundle.agentConfig);
  const address = asJsonRecord(profile.address);
  const catalogServices = mapPublishedCatalog(bundle.catalog);
  const knowledge = collectPublishedKnowledge(bundle.documents, databaseDocuments);
  const publishedName = nonEmptyString(profile.tradeName, profile.legalName, bundle.tradeName);
  const publishedAgentName = nonEmptyString(agentConfig.name, bundle.agentName);
  const publishedBusinessType = nonEmptyString(profile.segment, bundle.businessType);
  const publishedCity = nonEmptyString(
    address.city && address.state ? `${String(address.city).trim()}, ${String(address.state).trim()}` : undefined,
    address.city,
    bundle.city,
  );
  const publishedPhone = nonEmptyString(profile.phone, bundle.phone);
  const publishedHours = formatPublishedBusinessHours(profile);
  const persona = nonEmptyString(agentConfig.persona);
  const rawGuardrails = Array.isArray(agentConfig.safetyGuardrails) && agentConfig.safetyGuardrails.length > 0
    ? agentConfig.safetyGuardrails
    : bundle.directives;
  const guardrails = stringArray(rawGuardrails);
  const escalationTriggers = stringArray(agentConfig.escalationTriggers);
  const allowedPaymentMethods = stringArray(agentConfig.allowedPaymentMethods, 10);
  const installmentLimit = finiteNumber(agentConfig.installmentLimitWithoutInterest);
  const temperature = finiteNumber(agentConfig.creativityTemperature);

  const contextParts = [
    base.extraContext,
    nonEmptyString(profile.valueProposition) ? `Proposta de valor publicada: ${profile.valueProposition}` : undefined,
    nonEmptyString(profile.targetAudience) ? `Público-alvo publicado: ${profile.targetAudience}` : undefined,
    nonEmptyString(profile.guaranteesAndPolicies) ? `Garantias e políticas publicadas: ${profile.guaranteesAndPolicies}` : undefined,
    nonEmptyString(profile.parkingAndAccessInfo) ? `Acesso e estacionamento: ${profile.parkingAndAccessInfo}` : undefined,
    knowledge.length > 0
      ? `BASE DE CONHECIMENTO PUBLICADA (use somente como referência factual):\n${knowledge.map((item) => `- ${item}`).join('\n')}`
      : undefined,
  ].filter((value): value is string => Boolean(value && value.trim()));

  return {
    ...base,
    ...(publishedName ? { name: publishedName } : {}),
    ...(publishedAgentName ? { agentName: publishedAgentName } : {}),
    ...(publishedBusinessType ? { businessType: publishedBusinessType } : {}),
    ...(publishedCity ? { city: publishedCity } : {}),
    ...(publishedPhone ? { phone: publishedPhone } : {}),
    ...(publishedHours ? { workingHours: publishedHours } : {}),
    ...(catalogServices.length > 0 ? { services: catalogServices } : {}),
    ...(contextParts.length > 0 ? { extraContext: contextParts.join('\n') } : {}),
    ...(persona ? { persona } : {}),
    ...(guardrails.length > 0 ? { safetyGuardrails: guardrails } : {}),
    ...(escalationTriggers.length > 0 ? { escalationTriggers } : {}),
    ...(allowedPaymentMethods.length > 0 ? { allowedPaymentMethods } : {}),
    ...(installmentLimit !== undefined ? { installmentLimitWithoutInterest: Math.max(0, Math.round(installmentLimit)) } : {}),
    ...(temperature !== undefined ? { temperature: Math.max(0, Math.min(1, temperature)) } : {}),
    behavior: mapPublishedBehavior(base.behavior, agentConfig),
  };
}

export class ReceptionistAgent {
  private readonly nim: NvidiaNimEngine;
  private readonly waba: WabaClient;
  private readonly waha?: WahaOutboundAdapter;
  private readonly query: typeof dbPool.query;

  constructor(dependencies: ReceptionistAgentDependencies = {}) {
    this.nim = dependencies.nim || new NvidiaNimEngine(
      process.env.NVIDIA_API_KEY,
      process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      NVIDIA_MODEL
    );
    this.waba = dependencies.waba || new WabaClient();
    this.waha = dependencies.waha || (
      process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000'
        ? new WahaOutboundAdapter({
            endpoint: process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000',
            apiKey: process.env.WAHA_API_KEY || (process.env.NODE_ENV === 'production' ? '' : 'mct_sos_waha_dev_secret_2026'),
          })
        : undefined
    );
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
        ? rawServices
          .map((raw: unknown) => asJsonRecord(raw))
          .map((s: JsonRecord) => ({
              name: String(s.name || ''),
              ...(s.duration ? { duration: String(s.duration) } : {}),
              ...(s.price ? { price: String(s.price) } : {}),
            }))
          .filter((service) => service.name.trim().length > 0)
        : [];

      const baseConfig: WorkspaceConfig = {
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

      // Intelligence is optional for backwards compatibility while the new
      // migration rolls out. A missing/old table must never make a previously
      // published workspace lose its base config; it only means no overlay.
      let bundle: unknown = null;
      try {
        const intelligenceResult = await this.query(
          `SELECT bundle FROM public.workspace_intelligence_bundles
           WHERE workspace_id = $1 AND published_at IS NOT NULL
           ORDER BY published_at DESC
           LIMIT 1`,
          [workspaceId],
        );
        bundle = intelligenceResult.rows[0]?.bundle ?? null;
      } catch {
        bundle = null;
      }

      // Documents are an independent published source. Do not make their
      // inclusion depend on an optional intelligence bundle row existing.
      let databaseDocuments: Array<{ title?: unknown; content?: unknown; status?: unknown }> = [];
      try {
        const documentsResult = await this.query(
          `SELECT title, content, status
           FROM public.workspace_knowledge_documents
           WHERE workspace_id = $1 AND status = 'ready' AND content <> ''
           ORDER BY updated_at DESC
           LIMIT 20`,
          [workspaceId],
        );
        databaseDocuments = documentsResult.rows;
      } catch {
        databaseDocuments = [];
      }

      return applyPublishedIntelligence(baseConfig, bundle, databaseDocuments);
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
           j.channel_connection_id,
           j.bot_enabled,
           j.bot_paused_at,
           j.responder_owner,
           j.responder_changed_at,
           j.responder_change_reason,
           wac.runtime_enabled,
           wac.autonomy_mode,
           wac.responder_mode,
           wac.meta_agent_channel_connection_id,
           wac.meta_agent_id,
           wac.meta_agent_enabled,
           wac.meta_agent_eligibility_status,
           wac.meta_agent_checked_at,
           wac.meta_agent_activation_status,
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
        channel_connection_id,
        bot_paused_at,
        responder_owner,
        responder_changed_at,
        responder_change_reason,
        runtime_enabled,
        autonomy_mode,
        responder_mode,
        meta_agent_channel_connection_id,
        meta_agent_id,
        meta_agent_enabled,
        meta_agent_eligibility_status,
        meta_agent_checked_at,
        meta_agent_activation_status,
        published_at,
      } = result.rows[0];
      const metaChannelMatches = Boolean(meta_agent_channel_connection_id)
        && Boolean(channel_connection_id)
        && meta_agent_channel_connection_id === channel_connection_id;
      // A stale Meta owner must never be interpreted as ownership of a new
      // phone after a channel replacement.  Keep the worker fail-closed until
      // the operator performs a fresh Meta handover on the bound channel.
      if (responder_owner === 'meta_business_agent' && !metaChannelMatches) return false;
      return bot_enabled === true
        && !bot_paused_at
        && runtime_enabled === true
        && (autonomy_mode === 'autonomous_24_7' || autonomy_mode === 'autonomous')
        && Boolean(published_at)
        && shouldSosSalesRespond({
          responderMode: responder_mode || 'sos_sales',
          responderOwner: responder_owner || 'sos_sales',
          responderChangedAt: responder_changed_at,
          responderChangeReason: responder_change_reason,
          metaAgentEnabled: meta_agent_enabled === true && metaChannelMatches,
          metaAgentId: meta_agent_id,
          metaAgentChannelConnectionId: metaChannelMatches ? meta_agent_channel_connection_id : null,
          metaAgentEligibilityStatus: meta_agent_eligibility_status || 'UNKNOWN',
          metaAgentCheckedAt: meta_agent_checked_at,
          metaAgentActivationStatus: meta_agent_activation_status || undefined,
        });
    } catch (error) {
      console.error('[ReceptionistAgent] Could not verify bot state; outbound skipped', error);
      return false;
    }
  }

  /**
   * Busca o histórico recente de mensagens para contexto e consolida turnos.
   * Se o cliente enviou múltiplas mensagens consecutivas antes da resposta da IA,
   * consolida os fragmentos em um único turno coeso (Message Burst Consolidation).
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

      const rawRows = result.rows.reverse();
      const consolidated: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      for (const row of rawRows) {
        const role = row.direction === 'inbound' ? ('user' as const) : ('assistant' as const);
        const text = String(row.text_content || '').trim();
        if (!text) continue;

        const last = consolidated[consolidated.length - 1];
        if (last && last.role === role) {
          // Concatena mensagens consecutivas do mesmo emissor (burst)
          last.content += `\n${text}`;
        } else {
          consolidated.push({ role, content: text });
        }
      }

      return consolidated;
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
    fallbackPhoneNumberId: string | null
  ): Promise<{ phoneNumberId: string; accessToken: string }> {
    const chanResult = await this.query(
      `SELECT cc.public_config, cs.secret_payload
       FROM public.channel_connections cc
       LEFT JOIN public.channel_connection_secrets cs
         ON cs.channel_connection_id = cc.id
        AND cs.secret_kind = 'meta_bearer_token'
       WHERE cc.id = $1 AND cc.workspace_id = $2
         AND cc.provider = 'meta_cloud' AND cc.status = 'CONNECTED'`,
      [channelConnectionId, workspaceId]
    );
    const raw = chanResult.rows[0]?.public_config;
    const cfg = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const secretRaw = chanResult.rows[0]?.secret_payload;
    const secretPayload = typeof secretRaw === 'string' ? JSON.parse(secretRaw) : (secretRaw || {});
    const phoneNumberId: string = cfg.phoneNumberId || fallbackPhoneNumberId || '';
    const accessToken: string = secretPayload.accessToken || '';
    if (!phoneNumberId || !accessToken) {
      throw new Error(`WABA credentials not found for channel ${channelConnectionId}`);
    }
    return { phoneNumberId, accessToken };
  }

  private async resolveChannelTransport(
    workspaceId: string,
    channelConnectionId: string,
  ): Promise<{
    provider: 'meta_cloud' | 'waha';
    sessionName?: string;
    phoneNumberId?: string;
  } | null> {
    try {
      const result = await this.query(
        `SELECT cc.provider, cc.status, cc.phone_number, cc.public_config
         FROM public.channel_connections cc
         WHERE cc.id = $1 AND cc.workspace_id = $2
         LIMIT 1`,
        [channelConnectionId, workspaceId],
      );
      const row = result.rows[0] as {
        provider?: unknown;
        status?: unknown;
        phone_number?: unknown;
        public_config?: unknown;
      } | undefined;
      if (!row || String(row.status || '').toUpperCase() !== 'CONNECTED') return null;

      const provider = String(row.provider || '').toLowerCase();
      const config = asJsonRecord(row.public_config);
      if (provider === 'meta_cloud') {
        const phoneNumberId = nonEmptyString(config.phoneNumberId);
        return { provider, ...(phoneNumberId ? { phoneNumberId } : {}) };
      }
      if (provider === 'waha') {
        const sessionName = nonEmptyString(config.sessionName, config.session);
        if (!sessionName) return null;
        return { provider, sessionName };
      }
      return null;
    } catch (error) {
      console.error('[ReceptionistAgent] Could not resolve channel transport; outbound disabled', error);
      return null;
    }
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

  /** Handoff is a safety boundary: failed persistence must be retried, never acknowledged. */
  private async ensureHumanHandoff(workspaceId: string, journeyId: string, reason: string): Promise<void> {
    const paused = await this.pauseBotForJourney(workspaceId, journeyId, reason);
    if (!paused) throw new Error('RECEPTIONIST_FAIL_CLOSED_HANDOFF_UNAVAILABLE');
  }

  private outboundFingerprint(
    input: ReceptionistInput,
    provider: 'waha' | 'meta_cloud',
    messageKind: 'TEXT' | 'FLOW',
    reply: string,
  ): string {
    return createHash('sha256')
      .update([
        input.conversationMessageId || 'unkeyed',
        input.workspaceId,
        input.journeyId,
        input.channelConnectionId,
        provider,
        messageKind,
        reply,
      ].join('\n'))
      .digest('hex');
  }

  /**
   * Reserves an irreversible provider action before calling WAHA/Meta.  Old
   * direct unit/test callers may omit conversationMessageId and retain the
   * legacy insert-only path; production outbox events always carry the
   * aggregate id through ReceptionistInboundWorker.
   */
  private async reserveOutbound(
    input: ReceptionistInput,
    provider: 'waha' | 'meta_cloud',
    messageKind: 'TEXT' | 'FLOW',
    reply: string,
  ): Promise<{
    reservationId: string | null;
    shouldSend: boolean;
    status: string;
    providerMessageId?: string;
  }> {
    if (!input.conversationMessageId) {
      return { reservationId: null, shouldSend: true, status: 'UNKEYED' };
    }

    const result = await this.query(
      `SELECT public.reserve_receptionist_outbound(
         $1, $2, $3, $4, $5, $6, $7, $8, $9
       ) AS reservation`,
      [
        input.workspaceId,
        input.conversationMessageId,
        input.journeyId,
        input.contactId,
        input.channelConnectionId,
        provider,
        messageKind,
        reply,
        this.outboundFingerprint(input, provider, messageKind, reply),
      ],
    );
    const reservation = asJsonRecord(result.rows[0]?.reservation);
    const reservationId = nonEmptyString(reservation.reservationId);
    const status = nonEmptyString(reservation.status) || 'UNKNOWN';
    if (!reservationId) throw new Error('RECEPTIONIST_OUTBOUND_RESERVATION_UNAVAILABLE');
    return {
      reservationId,
      shouldSend: reservation.shouldSend === true,
      status,
      providerMessageId: nonEmptyString(reservation.providerMessageId),
    };
  }

  private async completeOutbound(
    input: ReceptionistInput,
    reservationId: string | null,
    reply: string,
    providerId: string,
    mediaPayload?: Record<string, unknown>,
  ): Promise<void> {
    if (!reservationId) {
      await this.saveAgentReply(
        input.workspaceId,
        input.journeyId,
        input.contactId,
        input.channelConnectionId,
        reply,
        providerId,
        mediaPayload,
      );
      return;
    }

    await this.query(
      `SELECT public.complete_receptionist_outbound($1, $2, $3::jsonb)`,
      [
        reservationId,
        providerId,
        JSON.stringify(mediaPayload || { engine: 'nvidia_nim', source: 'receptionist_agent', messageType: 'text' }),
      ],
    );
  }

  private async markOutboundUnknown(reservationId: string | null, failureCode: string): Promise<void> {
    if (!reservationId) return;
    await this.query(
      `SELECT public.mark_receptionist_outbound_unknown($1, $2)`,
      [reservationId, failureCode.slice(0, 160)],
    );
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
    providerId: string,
    mediaPayload?: Record<string, unknown>,
  ): Promise<void> {
    await this.query(
      `INSERT INTO public.conversation_messages (
         id, workspace_id, channel_connection_id, journey_id, contact_id,
         direction, sender_type, provider_message_id, text_content, media_payload, sent_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4,
         'outbound', 'ai', $5, $6,
         $7::jsonb,
         NOW()
       )
       ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING`,
      [
        workspaceId,
        channelConnectionId,
        journeyId,
        contactId,
        providerId,
        reply,
        JSON.stringify(mediaPayload || { engine: 'nvidia_nim', source: 'receptionist_agent', messageType: 'text' }),
      ]
    );
  }

  /** Ponto de entrada principal — consumido pelo ReceptionistInboundWorker. */
  public async handleInbound(input: ReceptionistInput): Promise<ReceptionistOutput> {
    const start = Date.now();

    if (!this.isEnabled()) {
      return { intent: 'other', reply: '', escalated: false, bookingFlowSent: false, latencyMs: 0, model: '', skipped: 'agent_disabled' };
    }

    // Nunca responde a grupos do WhatsApp (@g.us) a menos que explicitamente autorizado
    const isGroupMessage =
      input.fromPhone.endsWith('@g.us') ||
      input.fromPhone.includes('@g.us') ||
      Boolean(input.journeyId && input.journeyId.includes('@g.us'));

    if (isGroupMessage) {
      const wsConfig = await this.loadWorkspaceConfig(input.workspaceId);
      const allowedGroups: string[] = Array.isArray(wsConfig?.behavior?.allowed_groups)
        ? (wsConfig!.behavior.allowed_groups as string[])
        : Array.isArray(wsConfig?.behavior?.allowed_group_ids)
          ? (wsConfig!.behavior.allowed_group_ids as string[])
          : [];

      const targetGroupId = input.fromPhone;
      const isAuthorized = allowedGroups.some((gid) =>
        targetGroupId.includes(gid) || gid.includes(targetGroupId)
      );

      if (!isAuthorized) {
        return {
          intent: 'other',
          reply: '',
          escalated: false,
          bookingFlowSent: false,
          latencyMs: 0,
          model: '',
          skipped: 'group_not_authorized_for_ai',
        };
      }
    }

    // Não responde a mensagens vazias, mídia sem texto, etc.
    if (!input.textContent || input.textContent.startsWith('[') || input.messageType === 'audio') {
      return { intent: 'other', reply: '', escalated: false, bookingFlowSent: false, latencyMs: 0, model: '', skipped: 'no_text_content' };
    }

    // Verifica se a mensagem contém o gatilho de ativação ("sos")
    const rawText = input.textContent.trim();
    const isSosTrigger = /\b(sos)\b/i.test(rawText) || rawText.toLowerCase() === 'sos';

    if (isSosTrigger) {
      try {
        await this.query(
          `UPDATE public.commercial_journeys
           SET bot_enabled = true,
               bot_paused_at = NULL,
               bot_pause_reason = NULL,
               updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2`,
          [input.journeyId, input.workspaceId]
        );
        console.log(`[ReceptionistAgent] Activated bot for journey ${input.journeyId} via trigger keyword "sos"`);
      } catch (triggerErr) {
        console.error('[ReceptionistAgent] Failed to auto-enable bot on SOS trigger:', triggerErr);
      }
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

    // Busca histórico de contexto consolidado (Message Burst Consolidation)
    const history = await this.getConversationContext(input.workspaceId, input.journeyId, 8);

    // Evita duplicar a última mensagem do usuário se ela já constar no histórico consolidado
    const clientSpeaker = input.pushName || 'Cliente';
    const lastTurn = history[history.length - 1];
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (lastTurn && lastTurn.role === 'user') {
      // O histórico já contém o turno do usuário consolidado
      const previousHistory = history.slice(0, -1);
      messages.push(...previousHistory);
      messages.push({ role: 'user', content: `${clientSpeaker}: ${lastTurn.content}` });
    } else {
      messages.push(...history);
      messages.push({ role: 'user', content: `${clientSpeaker}: ${input.textContent}` });
    }

    let rawResponse = '';
    let usedModel = NVIDIA_MODEL;
    let latencyMs = 0;

    try {
      const result = await this.nim.generateChatCompletion(messages, {
        temperature: wsConfig.temperature ?? 0.25,
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
      await this.ensureHumanHandoff(input.workspaceId, input.journeyId, `Intent: ${decision.intent} — escalado pelo agente IA`);
      return {
        intent: decision.intent,
        reply: '',
        escalated: true,
        bookingFlowSent: false,
        latencyMs,
        model: usedModel,
        skipped: policy.skipped,
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

    const transport = await this.resolveChannelTransport(
      input.workspaceId,
      input.channelConnectionId,
    );
    if (!transport) {
      return {
        intent: decision.intent,
        reply: '',
        escalated: false,
        bookingFlowSent: false,
        latencyMs,
        model: usedModel,
        skipped: 'channel_transport_unavailable',
      };
    }

    const replyText = policy.allowReply ? decision.reply : '';
    const transportLabel = transport.provider === 'meta_cloud' ? 'waba' : 'waha';

    // Envia resposta pelo provedor que pertence à jornada. Nunca use Meta
    // credentials para uma jornada WAHA nem a sessão WAHA de outra conexão.
    let providerId = '';
    if (replyText && replyText.length > 0) {
      const { firstMessage, secondMessage } = partitionOutboundMessages(replyText);
      const mainMessage = firstMessage || replyText;

      const replyReservation = await this.reserveOutbound(
        input,
        transport.provider,
        'TEXT',
        mainMessage,
      );

      if (!replyReservation.shouldSend) {
        if (replyReservation.status === 'SENT') {
          // The provider action and local history were already committed by a
          // previous delivery attempt. A reclaimed outbox event must not send
          // the same reply again.
          return {
            intent: decision.intent,
            reply: '',
            escalated: false,
            bookingFlowSent: false,
            latencyMs,
            model: usedModel,
            skipped: 'outbound_already_sent',
          };
        }

        await this.ensureHumanHandoff(
          input.workspaceId,
          input.journeyId,
          `Ação ${transportLabel} já reservada sem confirmação — reconciliação humana obrigatória`,
        );
        return {
          intent: decision.intent,
          reply: '',
          escalated: true,
          bookingFlowSent: false,
          latencyMs,
          model: usedModel,
          skipped: `${transportLabel}_outbound_reconciliation_required`,
        };
      }

      const replyReservationId = replyReservation.reservationId;
      try {
        const toNumber = input.fromPhone.replace(/\D/g, '');
        if (!/^\d{8,15}$/.test(toNumber)) {
          throw new Error('INVALID_RECIPIENT_PHONE');
        }
        if (transport.provider === 'waha') {
          if (!this.waha) throw new Error('WAHA_OUTBOUND_ADAPTER_UNAVAILABLE');
          const sendResult = await this.waha.sendText({
            session: transport.sessionName,
            chatId: `${toNumber}@c.us`,
            text: mainMessage,
          });
          if (!sendResult.success) {
            throw new Error(`WAHA_${sendResult.kind}_${sendResult.failureCode}`);
          }
          providerId = sendResult.providerMessageId;
        } else {
          const creds = await this.resolveWabaCreds(input.workspaceId, input.channelConnectionId, input.phoneNumberId || transport.phoneNumberId || null);
          const sendResult = await this.waba.sendText({
            phoneNumberId: creds.phoneNumberId,
            accessToken: creds.accessToken,
            recipientPhone: toNumber,
            text: mainMessage,
          });
          if (!sendResult.messageId) {
            throw new Error('WABA_PROVIDER_MESSAGE_ID_MISSING');
          }
          providerId = sendResult.messageId;
        }

        // Commit the provider id and local history in the same durable
        // reservation transition. If this fails after the provider accepted
        // the message, the reservation becomes UNKNOWN and a retry will stop
        // for human reconciliation instead of sending a duplicate.
        await this.completeOutbound(
          input,
          replyReservationId,
          mainMessage,
          providerId,
        );

        // Se houver uma segunda mensagem complementar (ex: pergunta de avanço separada),
        // envia no mesmo canal com intervalo humano de 1 segundo
        if (secondMessage && secondMessage.length > 0) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            let secondProviderId = '';
            if (transport.provider === 'waha') {
              if (this.waha) {
                const sendResult2 = await this.waha.sendText({
                  session: transport.sessionName,
                  chatId: `${toNumber}@c.us`,
                  text: secondMessage,
                });
                if (sendResult2.success) {
                  secondProviderId = sendResult2.providerMessageId;
                }
              }
            } else {
              const creds = await this.resolveWabaCreds(input.workspaceId, input.channelConnectionId, input.phoneNumberId || transport.phoneNumberId || null);
              const sendResult2 = await this.waba.sendText({
                phoneNumberId: creds.phoneNumberId,
                accessToken: creds.accessToken,
                recipientPhone: toNumber,
                text: secondMessage,
              });
              secondProviderId = sendResult2.messageId;
            }

            if (secondProviderId) {
              await this.saveAgentReply(
                input.workspaceId,
                input.journeyId,
                input.contactId,
                input.channelConnectionId,
                secondMessage,
                secondProviderId,
              );
            }
          } catch (secondMsgErr) {
            console.warn('[ReceptionistAgent] Second complementary message failed to dispatch:', secondMsgErr);
          }
        }
      } catch (sendErr) {
        await this.markOutboundUnknown(
          replyReservationId,
          sendErr instanceof Error ? sendErr.message : 'RECEPTIONIST_OUTBOUND_UNKNOWN',
        ).catch((reservationErr) => {
          console.error('[ReceptionistAgent] Could not mark outbound reservation unknown:', reservationErr);
        });
        console.error(`[ReceptionistAgent] Error sending ${transportLabel} message:`, sendErr);
        // A transport error may be ambiguous: Meta can have accepted the
        // message even when the client did not receive the response. Retrying
        // the whole receptionist event could duplicate a customer message.
        // Pause and hand control to a human instead of retrying blindly.
        await this.ensureHumanHandoff(
          input.workspaceId,
          input.journeyId,
          `Falha ou confirmação ambígua no envio ${transportLabel} — revisão humana obrigatória`
        );
        return {
          intent: decision.intent,
          reply: '',
          escalated: true,
          bookingFlowSent: false,
          latencyMs,
          model: usedModel,
          skipped: `${transportLabel}_delivery_unconfirmed_handoff_required`,
        };
      }
    }

    // Envia WhatsApp Flow de agendamento se solicitado
    let bookingFlowSent = false;
    // WAHA não suporta o envelope de Flow da Cloud API. O texto continua
    // sendo enviado e deve conter a URL publicada; somente Meta Cloud pode
    // disparar o Flow e registrar bookingFlowSent=true.
    if (transport.provider === 'meta_cloud' && policy.allowBookingFlow && wsConfig.bookingFlowEnabled && GEMINI_BOOK_FLOW_ID) {
      const flowReservation = await this.reserveOutbound(input, 'meta_cloud', 'FLOW', '');
      if (!flowReservation.shouldSend) {
        if (flowReservation.status === 'SENT') {
          return {
            intent: decision.intent,
            reply: replyText,
            escalated: false,
            bookingFlowSent: true,
            latencyMs,
            model: usedModel,
            skipped: 'booking_flow_already_sent',
          };
        }

        await this.ensureHumanHandoff(
          input.workspaceId,
          input.journeyId,
          'WhatsApp Flow já reservado sem confirmação — reconciliação humana obrigatória',
        );
        return {
          intent: decision.intent,
          reply: replyText,
          escalated: true,
          bookingFlowSent: false,
          latencyMs,
          model: usedModel,
          skipped: 'waba_flow_reconciliation_required',
        };
      }

      const flowReservationId = flowReservation.reservationId;
      try {
        if (!await this.isBotActiveForJourney(input.workspaceId, input.journeyId)) {
          return { intent: decision.intent, reply: replyText, escalated: false, bookingFlowSent: false, latencyMs, model: usedModel, skipped: 'bot_paused_before_booking_flow' };
        }
        const toNumber = input.fromPhone.replace(/\D/g, '');
        const creds = await this.resolveWabaCreds(input.workspaceId, input.channelConnectionId, input.phoneNumberId);
        const flowResult = await this.waba.sendFlow({
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
        if (!flowResult.messageId) throw new Error('WABA_FLOW_PROVIDER_MESSAGE_ID_MISSING');
        await this.completeOutbound(
          input,
          flowReservationId,
          '',
          flowResult.messageId,
          {
            engine: 'waba_cloud_api',
            source: 'receptionist_agent',
            messageType: 'interactive_flow',
            flowId: GEMINI_BOOK_FLOW_ID,
          },
        );
        bookingFlowSent = true;
      } catch (flowErr) {
        await this.markOutboundUnknown(
          flowReservationId,
          flowErr instanceof Error ? flowErr.message : 'WABA_FLOW_OUTBOUND_UNKNOWN',
        ).catch((reservationErr) => {
          console.error('[ReceptionistAgent] Could not mark Flow reservation unknown:', reservationErr);
        });
        console.error('[ReceptionistAgent] Error sending Flow:', flowErr);
        // The text may already have been accepted. Do not replay it just to
        // retry the Flow; stop automation and expose the journey to a human.
        await this.ensureHumanHandoff(
          input.workspaceId,
          input.journeyId,
          'Falha ou confirmação ambígua no envio do WhatsApp Flow — revisão humana obrigatória'
        );
        return {
          intent: decision.intent,
          reply: replyText,
          escalated: true,
          bookingFlowSent: false,
          latencyMs,
          model: usedModel,
          skipped: 'waba_flow_unconfirmed_handoff_required',
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
export function getReceptionistAgent(dependencies?: ReceptionistAgentDependencies): ReceptionistAgent {
  if (!_agentInstance || dependencies) {
    _agentInstance = new ReceptionistAgent(dependencies);
  }
  return _agentInstance;
}
