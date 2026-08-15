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
}
