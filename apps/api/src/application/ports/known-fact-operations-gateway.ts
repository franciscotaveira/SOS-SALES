import { AuthenticatedActor } from './operator-authenticator.js';

export interface RecordKnownFactInput {
  workspaceId: string;
  journeyId: string;
  key: string;
  value: unknown;
  confidence: number;
  confirmedByCustomer: boolean;
  evidenceMessageId?: string;
  supersedesFactId?: string;
  idempotencyKey: string;
}

export interface RecordedKnownFact {
  factId: string;
  journeyId: string;
  source: 'human_operator';
  idempotent: boolean;
  supersedesFactId?: string;
}

/** Request passed local validation but violates an auditable fact rule. */
export class KnownFactRuleViolationError extends Error {}

/** The same idempotency key was submitted with a different immutable payload. */
export class KnownFactIdempotencyConflictError extends Error {}

/**
 * Append-only human fact command boundary. Implementations must establish
 * Postgres RLS/JWT identity from `actor`; callers never choose an operator.
 */
export interface KnownFactOperationsGateway {
  record(actor: AuthenticatedActor, input: RecordKnownFactInput): Promise<RecordedKnownFact | null>;
}
