import { AuthenticatedActor } from './operator-authenticator.js';

export const OUTBOUND_DISPATCH_STATUSES = ['DRAFT', 'APPROVED', 'CLAIMED', 'ACCEPTED', 'FAILED', 'CANCELLED'] as const;
export type OutboundDispatchStatus = (typeof OUTBOUND_DISPATCH_STATUSES)[number];

export interface CreateOutboundDraftInput {
  workspaceId: string;
  journeyId: string;
  textContent: string;
  idempotencyKey: string;
}

export interface ApproveOutboundDispatchInput {
  workspaceId: string;
  dispatchId: string;
  idempotencyKey: string;
}

export interface CancelOutboundDispatchInput extends ApproveOutboundDispatchInput {
  reason: string;
}

/** A deliberately small, safe read model for the supervised send lifecycle. */
export interface OutboundDispatchRecord {
  dispatchId: string;
  journeyId: string;
  contactId: string;
  channelConnectionId: string;
  messageKind: 'TEXT';
  textContent: string;
  status: OutboundDispatchStatus;
  createdAt: string;
  approvedAt?: string;
  cancelledAt?: string;
  providerAcceptedAt?: string;
  providerFailureCode?: string;
  providerFailureAt?: string;
}

export interface OutboundDispatchMutationResult {
  dispatchId: string;
  status: OutboundDispatchStatus;
  idempotent: boolean;
}

/** Safe semantic error: request is malformed or invalid for the current state. */
export class OutboundDispatchRuleViolationError extends Error {}

/** Safe state error: a competing operation has already changed the dispatch. */
export class OutboundDispatchConflictError extends Error {}

/** Internal sentinel that keeps absent and cross-workspace resources indistinguishable. */
export class OutboundDispatchNotFoundError extends Error {}

export interface ClaimedOutboundDispatch {
  dispatchId: string;
  claimToken: string;
  textContent: string;
  channelConnectionId: string;
  contactId: string;
  contactPhone?: string;
  session?: string;
}

/**
 * Supervised outbound boundary.
 */
export interface OutboundDispatchGateway {
  createDraft(actor: AuthenticatedActor, input: CreateOutboundDraftInput): Promise<OutboundDispatchMutationResult | null>;
  approve(actor: AuthenticatedActor, input: ApproveOutboundDispatchInput): Promise<OutboundDispatchMutationResult | null>;
  cancel(actor: AuthenticatedActor, input: CancelOutboundDispatchInput): Promise<OutboundDispatchMutationResult | null>;
  get(actor: AuthenticatedActor, workspaceId: string, dispatchId: string): Promise<OutboundDispatchRecord | null>;

  // Worker / service-role operations
  listClaimableDispatches(params: { limit: number }): Promise<Array<{ dispatchId: string; workspaceId: string }>>;
  claimDispatch(params: { dispatchId: string; workerId: string; leaseSeconds?: number }): Promise<ClaimedOutboundDispatch | null>;
  recordProviderAcceptance(params: { dispatchId: string; claimToken: string; workerId: string; providerMessageId: string }): Promise<OutboundDispatchMutationResult | null>;
  recordProviderFailure(params: { dispatchId: string; claimToken: string; workerId: string; failureCode: string }): Promise<OutboundDispatchMutationResult | null>;
}

