import { AuthenticatedActor } from './operator-authenticator.js';

export const COMMERCIAL_OUTCOME_RESULTS = ['WON', 'LOST'] as const;
export type CommercialOutcomeResult = (typeof COMMERCIAL_OUTCOME_RESULTS)[number];

export interface RecordCommercialOutcomeInput {
  workspaceId: string;
  journeyId: string;
  result: CommercialOutcomeResult;
  revenueMinor: number;
  /** BRL is deliberately fixed in this first public contract. */
  currency: 'BRL';
  reason?: string;
  idempotencyKey: string;
}

export interface CommercialOutcomeResultRecord {
  outcomeId: string;
}

/** Safe semantic error: malformed, rejected or policy-invalid outcome input. */
export class CommercialOutcomeRuleViolationError extends Error {}

/** Safe immutable-state error: a different final result already exists. */
export class CommercialOutcomeConflictError extends Error {}

/**
 * Final commercial outcome boundary. Implementations must execute under the
 * verified actor identity and must never accept a caller-supplied operator.
 */
export interface CommercialOutcomeGateway {
  record(
    actor: AuthenticatedActor,
    input: RecordCommercialOutcomeInput,
  ): Promise<CommercialOutcomeResultRecord | null>;
}
