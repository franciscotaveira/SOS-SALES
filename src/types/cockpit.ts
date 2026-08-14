export type OperatorRole = 'operator' | 'viewer' | 'supervisor';

export type HandoffStatus = 'pending_operator' | 'in_progress' | 'bot_handling' | 'resolved';

export type SLAStatus = 'critical' | 'warning' | 'normal' | 'expired';

export type ChannelHealth = 'connected' | 'paused' | 'degraded' | 'disconnected';

export type EvidenceSource =
  | 'CUSTOMER_MESSAGE'
  | 'OPERATOR_RECORD'
  | 'ACQUISITION_CONTEXT'
  | 'SYSTEM_INFERENCE';

export type FactConfidence =
  | 'CONFIRMED'
  | 'PROBABLE'
  | 'TO_CONFIRM'
  | 'STALE';

export type ChannelState =
  | 'HEALTHY'
  | 'PAUSED'
  | 'UNAVAILABLE';

export interface EvidenceReference {
  id: string;
  source: EvidenceSource;
  label: string;
  excerpt?: string;
  occurredAt: string;
}

export interface KnownFact {
  id: string;
  namespace?: string;
  key?: string;
  label: string;
  value: string;
  confidence: FactConfidence;
  evidence: EvidenceReference[];
  updatedAt: string;
  isVerified?: boolean;
}

export interface Priority {
  id: string;
  journeyId: string;
  contactName: string;
  reason: string;
  waitingSince: string;
  slaState: 'ON_TIME' | 'ATTENTION' | 'OVERDUE';
  assignee?: {
    id: string;
    name: string;
  };
  handoffState: 'PENDING' | 'ACCEPTED' | 'RESOLVED';
}

export interface ContinuityStep {
  id: string;
  type: 'ORIGIN' | 'CURRENT_INTENT' | 'NEXT_ACTION';
  title: string;
  description: string;
  state: 'CONFIRMED' | 'INFERRED' | 'BLOCKED';
  evidence: EvidenceReference[];
  blockedReason?: string;
}

export interface LiveDossierData {
  customerObjective: KnownFact[];
  confirmedFacts: KnownFact[];
  activeFriction: KnownFact[];
  lastCommitment: KnownFact[];
  ownershipAndDeadline: KnownFact[];
}

export interface AcquisitionContext {
  source: 'ctwa' | 'organic' | 'direct' | 'qr_code' | 'unknown';
  campaignName?: string;
  adId?: string;
  adHeadline?: string;
  adCreativeUrl?: string;
  referralOffer?: string;
  entryTimestamp: string;
  initialMessageText?: string;
  attributedCostBrl?: number;
}

export interface RecommendationEvidence {
  id: string;
  source: string;
  text: string;
  timestamp: string;
  relevance: 'high' | 'medium';
}

export interface Recommendation {
  id: string;
  suggestedAction: string;
  draftText: string;
  confidence: number;
  policyStatus: 'compliant' | 'warning' | 'needs_approval';
  policyNotes?: string;
  evidences: RecommendationEvidence[];
  suggestedAt: string;
  blockedReason?: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageSender = 'lead' | 'operator' | 'bot' | 'system';

export interface Message {
  id: string;
  journeyId: string;
  sender: MessageSender;
  senderName?: string;
  text: string;
  timestamp: string;
  status: MessageStatus;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'document';
  isInternalNote?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  phoneNumber: string;
  health: ChannelHealth;
  pausedBy?: string;
  pausedAt?: string;
  pauseReason?: string;
  wabaAccountId?: string;
}

export type OutcomeStatus = 'won' | 'lost' | 'scheduled' | 'nurturing' | 'unqualified';

export type CommercialStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'won'
  | 'lost';

export interface MacroShortcut {
  id: string;
  trigger: string;
  label: string;
  template: string;
  description: string;
  category: 'fechamento' | 'agendamento' | 'informacao' | 'retomada';
}

export interface GuardrailValidation {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  suggestedCorrection?: string;
}

export interface FollowUpSchedule {
  dueAt: string;
  label: string;
  reason: string;
  createdAt: string;
}

export interface JourneyOutcome {
  id: string;
  journeyId: string;
  status: OutcomeStatus;
  dealValueBrl?: number;
  serviceOrProduct?: string;
  reason?: string;
  closedAt: string;
  closedBy: string;
}

export interface Journey {
  id: string;
  workspaceId: string;
  leadName: string;
  leadPhone: string;
  leadAvatar?: string;
  leadCity?: string;
  
  // Pipeline & Commercial Stage
  stage?: CommercialStage;
  followUpSchedule?: FollowUpSchedule;
  
  // Handoff & SLA
  handoffStatus: HandoffStatus;
  urgencyReason: string;
  slaDeadline: string; // ISO string
  slaStatus: SLAStatus;
  slaMinutesRemaining: number;
  assignedOperatorId?: string;
  assignedOperatorName?: string;
  
  // Channels & Status
  channelId: string;
  
  // Continuity details
  acquisition: AcquisitionContext;
  lastLeadMessage: string;
  lastActivityAt: string;
  
  // Facts & AI recommendation
  knownFacts: KnownFact[];
  dossier?: LiveDossierData;
  continuitySteps?: ContinuityStep[];
  recommendation?: Recommendation;
  
  // Outcome if closed
  outcome?: JourneyOutcome;
  
  // Unread count for list
  unreadCount: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  businessType: 'hair_salon' | 'auto_film' | 'general_services';
  tagline: string;
  activeOperatorCount: number;
  channels: Channel[];
}

export interface OperatorState {
  currentOperatorId: string;
  currentOperatorName: string;
  role: OperatorRole;
  activeWorkspaceId: string;
}

export interface SendMessagePayload {
  journeyId: string;
  text: string;
  senderId: string;
  senderName: string;
}

