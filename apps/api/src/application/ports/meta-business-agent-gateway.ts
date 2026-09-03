/**
 * Meta Business Agent is an optional capability of a connected official WABA
 * number. `UNKNOWN` is intentionally distinct from `INELIGIBLE`: upstream
 * errors must not silently route a customer away from the Meta agent.
 */
export type MetaBusinessAgentEligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';

export interface MetaBusinessAgentEligibility {
  status: MetaBusinessAgentEligibilityStatus;
  phoneNumberId?: string;
  channelConnectionId?: string;
  checkedAt: string;
  reason?: 'CHANNEL_NOT_CONNECTED' | 'CREDENTIALS_UNAVAILABLE' | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_REJECTED' | 'INVALID_RESPONSE';
}

export interface MetaBusinessAgentOnboarding {
  agentId: string;
}

export interface MetaBusinessAgentTestResult {
  messageId: string;
  agentResponse: string;
  conversationId: string;
  timestamp?: number;
  handoffReason?: string;
  noResponseReason?: string;
  quickReplies?: string[];
  productVariantIds?: string[];
}

export interface MetaBusinessAgentThreadControlResult {
  messagingProduct: 'whatsapp';
}

export interface MetaBusinessAgentGateway {
  checkEligibility(workspaceId: string, channelConnectionId?: string): Promise<MetaBusinessAgentEligibility>;
  startOnboarding?(workspaceId: string, catalogId?: string, channelConnectionId?: string): Promise<MetaBusinessAgentOnboarding>;
  testAgent?(workspaceId: string, userMsg: string, conversationId?: string, channelConnectionId?: string): Promise<MetaBusinessAgentTestResult>;
  controlThread?(
    workspaceId: string,
    input: { action: 'take' | 'release'; to: string; metadata?: string; channelConnectionId?: string },
  ): Promise<MetaBusinessAgentThreadControlResult>;
}
