/**
 * Meta Business Agent is an optional capability of a connected official WABA
 * number. `UNKNOWN` is intentionally distinct from `INELIGIBLE`: upstream
 * errors must not silently route a customer away from the Meta agent.
 */
export type MetaBusinessAgentEligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';

export interface MetaBusinessAgentEligibility {
  status: MetaBusinessAgentEligibilityStatus;
  phoneNumberId?: string;
  checkedAt: string;
  reason?: 'CHANNEL_NOT_CONNECTED' | 'CREDENTIALS_UNAVAILABLE' | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_REJECTED' | 'INVALID_RESPONSE';
}

export interface MetaBusinessAgentGateway {
  checkEligibility(workspaceId: string): Promise<MetaBusinessAgentEligibility>;
}
