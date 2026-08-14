/**
 * TX COMMERCIAL CORE — DOMAIN TYPES V2 & CONTRACT SPECIFICATION
 * 
 * Regra Arquitetural do Sovereign Kernel:
 * - Fatos são imutáveis e auditáveis (com proteção no PostgreSQL contra UPDATE/DELETE).
 * - Inferências carregam nível de confiança (0.0 a 1.0) e proveniência auditável.
 * - Decisões operacionais passam por validação de política antes da execução.
 * - ConversationDecisionContext é uma PROJEÇÃO MATERIALIZADA, não a fonte primária.
 * - Valores monetários são expressos em unidades menores (minor units / centavos).
 */

// ==========================================
// 1. IDENTIDADE, TENANCY & CANAIS
// ==========================================

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceRole = 'owner' | 'operator' | 'viewer';

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string; // Supabase Auth UID
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
}

export type ChannelProvider = 'waha' | 'meta_cloud' | 'evolution' | 'other';
export type ChannelStatus = 'CONNECTED' | 'DISCONNECTED' | 'QR_REQUIRED';

export interface ChannelConnection {
  id: string;
  workspaceId: string;
  provider: ChannelProvider;
  phoneNumber: string;
  name: string;
  publicConfig: Record<string, unknown>;
  status: ChannelStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelConnectionSecrets {
  channelConnectionId: string;
  workspaceId: string;
  apiKeyVaultSecretId?: string;
  webhookVaultSecretId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  workspaceId: string;
  phone: string; // Formato E.164 (+5549999999999) ou token de pseudonimização
  whatsappId?: string;
  name?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// 2. INGESTÃO & MENSAGENS BRUTAS
// ==========================================

export interface InboundChannelEvent {
  id: string;
  workspaceId: string;
  channelConnectionId?: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  rawPayload: Record<string, unknown>;
  receivedAt: Date;
}

export type MessageDirection = 'inbound' | 'outbound';
export type MessageSenderType = 'customer' | 'ai' | 'operator' | 'system';

export interface ConversationMessage {
  id: string;
  workspaceId: string;
  channelConnectionId: string;
  journeyId: string;
  contactId: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  providerMessageId: string;
  textContent?: string;
  mediaPayload?: Record<string, unknown>;
  sentAt: Date;
}

export type MessageDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'REVOKED';

export interface ConversationMessageEvent {
  id: string;
  workspaceId: string;
  channelConnectionId: string;
  messageId: string;
  providerEventId: string;
  status: MessageDeliveryStatus;
  providerTimestamp: Date;
  errorCode?: string;
  errorMessage?: string;
  rawPayload: Record<string, unknown>;
  createdAt: Date;
}

// ==========================================
// 3. UNIDADE DE NEGÓCIO: JORNADA COMERCIAL
// ==========================================

export type JourneyStatus = 'OPEN' | 'WON' | 'LOST' | 'ABANDONED';

export interface CommercialJourney {
  id: string;
  workspaceId: string;
  contactId: string;
  status: JourneyStatus;
  primaryServiceOrProduct?: string;
  startedAt: Date;
  closedAt?: Date;
  totalRevenueMinor: number; // Centavos inteiros (ex: R$ 59,00 = 5900)
  currency: string;          // Padrão: 'BRL'
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// 4. FATOS DE AQUISIÇÃO (EVIDENCE-BASED ATTRIBUTION)
// ==========================================

export type AttributionConfidenceLevel =
  | 'HIGH_CTWA'
  | 'HIGH_TRACKING_LINK'
  | 'MEDIUM_TEXT_CODE'
  | 'LOW_TIME_WINDOW'
  | 'MANUAL_DECLARED';

export interface AcquisitionContext {
  id: string;
  workspaceId: string;
  journeyId: string;
  source: 'meta_ads' | 'google_ads' | 'instagram_organic' | 'google_business' | 'referral' | 'other';
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adId?: string;
  creativeCode?: string;
  offerHook?: string;         // Ex: "Escova lisa sem hora marcada por R$ 59"
  entryMessage?: string;       // Mensagem pré-preenchida do anúncio
  clickIds?: {
    fbclid?: string;
    gclid?: string;
    ctwaClid?: string;
  };
  trackingCode?: string;      // Ex: "trk_abc123"
  confidence: AttributionConfidenceLevel;
  occurredAt: Date;
}

// ==========================================
// 5. FATOS CONHECIDOS COM PROVENIÊNCIA (NAMESPACE EXTENSÍVEL)
// ==========================================

export type FactSource = 
  | 'ad_payload' 
  | 'customer_explicit_text' 
  | 'ai_inference' 
  | 'human_operator' 
  | 'system_action';

export interface KnownFact<T = unknown> {
  id: string;
  workspaceId: string;
  journeyId: string;
  key: string; // Namespace: profile.*, offer.*, service.*, schedule.*, vehicle.*
  value: T;
  source: FactSource;
  evidenceMessageId?: string;
  confidence: number; // 0.0 a 1.0 (calculado explicitamente)
  confirmedByCustomer: boolean;
  observedAt: Date;
  supersededBy?: string; // ID do fato mais recente que substituiu este
}

// ==========================================
// 6. ESTADO COGNITIVO & FRICÇÃO (INFERÊNCIAS)
// ==========================================

export type DecisionStateStage = 
  | 'DESCONHECIMENTO'     // Não conhece a solução
  | 'INTERESSE_INICIAL'   // Viu o gancho, curioso
  | 'BUSCA_OBJETIVA'      // Quer preço, prazo ou disponibilidade imediata
  | 'COMPARACAO'          // Avaliando opções / objeções
  | 'DECISAO_PRONTA'      // Pronto para comprar/agendar, removendo atritos finais
  | 'POS_VENDA';          // Já comprou, suporte ou recorrência

export type FrictionType = 
  | 'price'           // Achou caro / comparando preço
  | 'availability'    // Sem data/horário compatível
  | 'trust'           // Medo de errar / insegurança técnica
  | 'choice'          // Dúvida entre duas opções
  | 'payment'         // Forma de pagamento ou parcelamento
  | 'deadline'        // Urgência ou prazo distante
  | 'approval'        // Precisa falar com cônjuge/sócio
  | 'uncertainty';    // Dúvida genérica não verbalizada

export interface FrictionAssessment {
  primary?: FrictionType;
  secondary: FrictionType[];
  evidenceText?: string;
  confidence: number;
  resolved: boolean;
}

// ==========================================
// 7. EVENTOS DE DECISÃO (HISTÓRICO IMUTÁVEL AUDITÁVEL)
// ==========================================

export interface DecisionEvent {
  id: string;
  workspaceId: string;
  journeyId: string;
  actor: 'ai' | 'operator' | 'customer' | 'system';
  actorId?: string;
  fromState?: DecisionStateStage;
  toState: DecisionStateStage;
  reason: string;
  inferredFriction?: FrictionType;
  evidenceSnippet?: string;
  confidence: number;
  correlationId?: string;
  projectionVersion: number;
  idempotencyKey?: string;
  createdAt: Date;
}

// ==========================================
// 8. AÇÕES RECOMENDADAS VS EXECUTADAS (POLÍTICAS)
// ==========================================

export type CommercialActionType = 
  | 'ANSWER_PRICE' 
  | 'OFFER_TIME_SLOTS' 
  | 'REQUEST_PREFERENCE' 
  | 'SHOW_PROOF' 
  | 'HANDLE_OBJECTION' 
  | 'SEND_PAYMENT' 
  | 'CONFIRM_BOOKING' 
  | 'REQUEST_HUMAN_HANDOFF' 
  | 'WAIT_CUSTOMER';

export interface RecommendedAction {
  id: string;
  workspaceId: string;
  journeyId: string;
  suggestedAction: CommercialActionType;
  suggestedDraftText?: string;
  microCommitmentGoal: string; // Ex: "Confirmar se prefere manhã ou tarde"
  confidence: number;
  policyStatus: 'ALLOWED' | 'REQUIRES_HUMAN_APPROVAL' | 'BLOCKED_BY_POLICY';
  policyReason?: string;
  createdAt: Date;
}

export interface ExecutedAction {
  id: string;
  workspaceId: string;
  journeyId: string;
  recommendedActionId?: string;
  executedAction: CommercialActionType;
  executedBy: 'ai' | 'operator' | 'system';
  messageId?: string;
  idempotencyKey?: string;
  requestFingerprint: string;
  approvedByUserId?: string;
  executedAt: Date;
}

// ==========================================
// 9. HANDOFF ESTRUTURADO (DOSSIÊ OPERACIONAL)
// ==========================================

export interface HandoffCase {
  id: string;
  workspaceId: string;
  journeyId: string;
  status: 'PENDING' | 'ACCEPTED' | 'RETURNED_TO_AI' | 'RESOLVED';
  assignedToUserId?: string;
  briefing: {
    customerName: string;
    originChannel: string;
    hookAndOffer: string;
    currentIntent: string;
    resolvedData: Array<{ label: string; value: string }>;
    activeFrictions: FrictionType[];
    lastCustomerDecision: string;
    recommendedNextStep: string;
  };
  triggerReason: string;
  openedAt: Date;
  acceptedAt?: Date;
  resolvedAt?: Date;
}

// ==========================================
// 10. REPROCESSAMENTO & OUTBOX TRANSACTIONAL
// ==========================================

export interface ProjectionCheckpoint {
  journeyId: string;
  workspaceId: string;
  lastEventId?: string;
  lastMessageId?: string;
  projectionVersion: number;
  updatedAt: Date;
}

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED' | 'DEAD_LETTER';

export interface OutboxEvent {
  id: string;
  workspaceId: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  lockedAt?: Date;
  lockedBy?: string;
  claimToken?: string; // Fencing token
  scheduledFor: Date;
  createdAt: Date;
  publishedAt?: Date;
}

export interface ComplianceRedactionEvent {
  id: string;
  workspaceId: string;
  contactId: string;
  reason: string;
  requestedByUserId?: string;
  requestedByActor: 'user' | 'service_role';
  executedAt: Date;
}

// ==========================================
// 11. RESULTADOS & APRENDIZADO COMERCIAL
// ==========================================

export type CapiSyncStatus = 'PENDING' | 'QUEUED' | 'DISPATCHED' | 'FAILED' | 'NOT_APPLICABLE';

export interface CommercialOutcome {
  id: string;
  workspaceId: string;
  journeyId: string;
  result: 'WON' | 'LOST' | 'UNRESPONSIVE';
  finalRevenueMinor?: number; // Centavos inteiros
  currency: string;
  closedReason?: string;
  feedbackLearning?: {
    wasAttributionAccurate: boolean;
    mainFrictionThatClosedOrLost: FrictionType;
    successfulActions: CommercialActionType[];
  };
  capiStatus: CapiSyncStatus;
  capiEventId?: string;
  idempotencyKey?: string;
  requestFingerprint: string;
  occurredAt: Date;
}

// ==========================================
// 12. PROJEÇÃO MATERIALIZADA (CONTEXTO DE DECISÃO)
// ==========================================

export interface ConversationDecisionContext {
  journeyId: string;
  contactId: string;
  workspaceId: string;
  
  // Projeção de Origem
  origin: {
    source: string;
    campaignName?: string;
    offerHook?: string;
    attributionConfidence: AttributionConfidenceLevel;
  };

  // Projeção de Estado Cognitivo
  decisionState: DecisionStateStage;
  decisionConfidence: number;

  // Projeção de Fatos Conhecidos
  knownFacts: Record<string, { value: unknown; confidence: number; confirmed: boolean }>;

  // Projeção de Fricção
  friction: FrictionAssessment;

  // Projeção de Próxima Ação
  nextAction: {
    recommended: CommercialActionType;
    suggestedText?: string;
    microCommitment: string;
    requiresApproval: boolean;
  };

  // Controle de Atendimento
  currentOwner: 'ai' | 'human';
  activeHandoffId?: string;

  lastUpdatedAt: Date;
}
