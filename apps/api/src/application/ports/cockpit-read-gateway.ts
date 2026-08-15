import { AuthenticatedActor } from './operator-authenticator.js';

export interface CockpitPriority {
  journeyId: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  pipelineStage: string | null;
  handoffCaseId: string | null;
  handoffStatus: string | null;
  assignedToUserId: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  followUpDueAt: string | null;
  slaDeadline: string | null;
  slaState: 'OK' | 'DUE' | 'OVERDUE';
  priorityReason: string;
  unreadCount: number;
}

export interface CockpitJourney {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  status: 'OPEN' | 'WON' | 'LOST' | 'ABANDONED';
  pipelineStage: string | null;
  primaryServiceOrProduct: string | null;
  startedAt: string;
  updatedAt: string;
}

/** Deliberately excludes provider IDs, raw envelopes and media URLs. */
export interface CockpitMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  senderType: 'customer' | 'ai' | 'operator' | 'system';
  textContent: string | null;
  sentAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Safe, composed read model for a single operator cockpit. It deliberately
 * exposes normalized commercial facts only: never provider message IDs, raw
 * webhook envelopes, click IDs, media payloads or channel secret references.
 */
export interface CockpitJourneyDetail {
  id: string;
  contactId: string;
  status: 'OPEN' | 'WON' | 'LOST' | 'ABANDONED';
  pipelineStage: string | null;
  primaryServiceOrProduct: string | null;
  totalRevenueMinor: number;
  currency: string;
  startedAt: string;
  closedAt: string | null;
  updatedAt: string;
  contact: {
    id: string;
    name: string | null;
    phone: string;
  };
  channel: {
    id: string;
    provider: string;
    phoneNumber: string;
    name: string;
    status: string;
  } | null;
}

export interface CockpitAcquisitionContext {
  id: string;
  source: string;
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adId: string | null;
  creativeCode: string | null;
  offerHook: string | null;
  entryMessage: string | null;
  confidence: string;
  occurredAt: string;
}

export interface CockpitKnownFact {
  id: string;
  key: string;
  value: unknown;
  source: string;
  confidence: number;
  confirmedByCustomer: boolean;
  observedAt: string;
}

export interface CockpitDecisionState {
  currentStage: string;
  stageConfidence: number;
  primaryFriction: string | null;
  secondaryFrictions: unknown;
  frictionEvidence: string | null;
  frictionConfidence: number;
  frictionResolved: boolean;
  updatedAt: string;
}

export interface CockpitRecommendation {
  id: string;
  suggestedAction: string;
  suggestedDraftText: string | null;
  microCommitmentGoal: string;
  confidence: number;
  policyStatus: string;
  policyReason: string | null;
  createdAt: string;
}

export interface CockpitHandoff {
  id: string;
  status: string;
  assignedToUserId: string | null;
  briefing: unknown;
  triggerReason: string;
  openedAt: string;
  acceptedAt: string | null;
  resolvedAt: string | null;
}

export interface CockpitOutcome {
  id: string;
  result: string;
  finalRevenueMinor: number | null;
  currency: string;
  closedReason: string | null;
  capiStatus: string;
  occurredAt: string;
}

export interface CockpitJourneyView {
  journey: CockpitJourneyDetail;
  acquisitionContexts: CockpitAcquisitionContext[];
  messages: CockpitMessage[];
  knownFacts: CockpitKnownFact[];
  decisionState: CockpitDecisionState | null;
  recommendation: CockpitRecommendation | null;
  handoff: CockpitHandoff | null;
  outcome: CockpitOutcome | null;
}

/**
 * Read model for the operator cockpit. Implementations must establish the
 * database identity from `actor`, never from route parameters or headers.
 */
export interface CockpitReadGateway {
  listPriorities(
    actor: AuthenticatedActor,
    workspaceId: string,
    limit: number,
  ): Promise<CockpitPriority[] | null>;
  listJourneys(
    actor: AuthenticatedActor,
    workspaceId: string,
    options: { limit: number; cursor: string | null },
  ): Promise<CursorPage<CockpitJourney> | null>;
  listMessages(
    actor: AuthenticatedActor,
    journeyId: string,
    options: { limit: number; cursor: string | null },
  ): Promise<CursorPage<CockpitMessage> | null>;
  getJourneyCockpit(
    actor: AuthenticatedActor,
    workspaceId: string,
    journeyId: string,
    messageLimit: number,
  ): Promise<CockpitJourneyView | null>;
}
