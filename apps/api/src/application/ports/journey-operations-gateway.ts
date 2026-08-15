import { AuthenticatedActor } from './operator-authenticator.js';

export const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface SetJourneyStageInput {
  workspaceId: string;
  journeyId: string;
  stage: PipelineStage;
  reason?: string;
  idempotencyKey: string;
}

export interface CreateFollowUpInput {
  workspaceId: string;
  journeyId: string;
  dueAt: string;
  reason: string;
  idempotencyKey: string;
}

export interface JourneyStageResult {
  journeyId: string;
  stage: PipelineStage;
  idempotent: boolean;
}

export interface FollowUpResult {
  followUpTaskId: string;
  status: 'PENDING' | 'DUE' | 'DONE' | 'CANCELLED';
  idempotent: boolean;
}

/** A client-safe validation or business-rule rejection. */
export class JourneyOperationRuleViolationError extends Error {}

/** Internal sentinel for absent and cross-workspace resources. */
export class JourneyOperationNotFoundError extends Error {}

/**
 * Mutation boundary for operational journey changes. Implementations must set
 * database identity from the verified actor; callers cannot supply an operator
 * id, membership role, or service credential in mutation input.
 */
export interface JourneyOperationsGateway {
  setStage(actor: AuthenticatedActor, input: SetJourneyStageInput): Promise<JourneyStageResult | null>;
  createFollowUp(actor: AuthenticatedActor, input: CreateFollowUpInput): Promise<FollowUpResult | null>;
}
