import { AuthenticatedActor } from './operator-authenticator.js';

export type HandoffOperation = 'accept' | 'resolve' | 'return_to_ai';

export interface HandoffOperationInput {
  workspaceId: string;
  handoffCaseId: string;
  operation: HandoffOperation;
  idempotencyKey: string;
  reason?: string;
}

export interface HandoffOperationResult {
  handoffCaseId: string;
  status: 'ACCEPTED' | 'RESOLVED' | 'RETURNED_TO_AI';
  assignedToUserId?: string;
  idempotent: boolean;
}

/** A safe, client-facing business rule violation. */
export class HandoffRuleViolationError extends Error {}

/** A state-machine conflict; callers may retry only with a refreshed state. */
export class HandoffTransitionConflictError extends Error {}

/**
 * Mutation boundary for the human handoff state machine. Implementations must
 * establish the database identity from `actor`; route input never supplies an
 * operator, role, or trusted workspace identity.
 */
export interface HandoffOperationsGateway {
  execute(
    actor: AuthenticatedActor,
    input: HandoffOperationInput,
  ): Promise<HandoffOperationResult | null>;
}
