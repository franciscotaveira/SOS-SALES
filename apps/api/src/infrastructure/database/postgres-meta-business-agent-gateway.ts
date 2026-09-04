import { Pool } from 'pg';
import {
  MetaBusinessAgentOnboarding,
  MetaBusinessAgentTestResult,
  MetaBusinessAgentThreadControlResult,
  MetaBusinessAgentEligibility,
  MetaBusinessAgentGateway,
} from '../../application/ports/meta-business-agent-gateway.js';
import {
  MetaBusinessAgentClient,
  MetaBusinessAgentUpstreamError,
} from '../channels/meta/meta-business-agent-client.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'query'>;

type MetaAgentActivationStatus = 'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED';

export class PostgresMetaBusinessAgentGateway implements MetaBusinessAgentGateway {
  constructor(
    private readonly pool: PgConnector = dbPool,
    private readonly client = new MetaBusinessAgentClient({
      baseUrl: process.env.META_BUSINESS_AGENT_BASE_URL?.trim() || undefined,
    }),
  ) {}

  private async resolveCredentials(
    workspaceId: string,
    channelConnectionId?: string,
  ): Promise<{ phoneNumberId: string; accessToken: string; channelConnectionId: string } | null> {
    const result = await this.pool.query<{
      channel_connection_id: string;
      phone_number_id: string | null;
      secret_payload: Record<string, unknown> | string | null;
    }>(`
      SELECT
        cc.id AS channel_connection_id,
        COALESCE(
          NULLIF(cc.public_config::jsonb ->> 'phoneNumberId', ''),
          NULLIF(cc.public_config::jsonb ->> 'phone_number_id', ''),
          NULLIF(cc.public_config::jsonb ->> 'wabaPhoneNumberId', '')
        ) AS phone_number_id,
        cs.secret_payload
      FROM public.channel_connections cc
      LEFT JOIN public.channel_connection_secrets cs
        ON cs.channel_connection_id = cc.id
        AND cs.secret_kind = 'meta_bearer_token'
      WHERE cc.workspace_id = $1
        AND cc.provider = 'meta_cloud'
        AND cc.status = 'CONNECTED'
        AND ($2::uuid IS NULL OR cc.id = $2::uuid)
      ORDER BY cc.created_at ASC
      LIMIT 2
    `, [workspaceId, channelConnectionId ?? null]);
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    const secretPayload = typeof row.secret_payload === 'string'
      ? JSON.parse(row.secret_payload) as Record<string, unknown>
      : row.secret_payload ?? {};
    const accessToken = [
      secretPayload.accessToken,
      secretPayload.access_token,
      secretPayload.token,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
    if (!row.phone_number_id || !accessToken || !row.channel_connection_id) return null;
    return { phoneNumberId: row.phone_number_id, accessToken, channelConnectionId: row.channel_connection_id };
  }

  private async persistEligibilityStatus(
    workspaceId: string,
    status: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN',
    checkedAt: string,
    channelConnectionId?: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.workspace_agent_config (
         workspace_id, meta_agent_eligibility_status, meta_agent_checked_at,
         meta_agent_channel_connection_id, updated_at
       ) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         meta_agent_eligibility_status = EXCLUDED.meta_agent_eligibility_status,
         meta_agent_checked_at = EXCLUDED.meta_agent_checked_at,
         meta_agent_channel_connection_id = COALESCE(EXCLUDED.meta_agent_channel_connection_id, workspace_agent_config.meta_agent_channel_connection_id),
         updated_at = NOW()`,
      [workspaceId, status, checkedAt, channelConnectionId ?? null],
    );
  }

  private async persistActivationStatus(
    workspaceId: string,
    status: MetaAgentActivationStatus,
    fields: { agentId?: string; error?: string | null; channelConnectionId?: string } = {},
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.workspace_agent_config (
         workspace_id, meta_agent_id, meta_agent_enabled,
         meta_agent_channel_connection_id,
         meta_agent_activation_status, meta_agent_onboarding_started_at,
         meta_agent_ready_at, meta_agent_last_error, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         meta_agent_id = COALESCE(EXCLUDED.meta_agent_id, workspace_agent_config.meta_agent_id),
         meta_agent_enabled = EXCLUDED.meta_agent_enabled,
         meta_agent_channel_connection_id = COALESCE(EXCLUDED.meta_agent_channel_connection_id, workspace_agent_config.meta_agent_channel_connection_id),
         meta_agent_activation_status = EXCLUDED.meta_agent_activation_status,
         meta_agent_onboarding_started_at = COALESCE(EXCLUDED.meta_agent_onboarding_started_at, workspace_agent_config.meta_agent_onboarding_started_at),
         meta_agent_ready_at = EXCLUDED.meta_agent_ready_at,
         meta_agent_last_error = EXCLUDED.meta_agent_last_error,
         updated_at = NOW()`,
      [
        workspaceId,
        fields.agentId ?? null,
        status === 'PENDING' || status === 'READY',
        fields.channelConnectionId ?? null,
        status,
        status === 'PENDING' ? new Date().toISOString() : null,
        status === 'READY' ? new Date().toISOString() : null,
        fields.error ?? null,
      ],
    );
  }

  async checkEligibility(workspaceId: string, channelConnectionId?: string): Promise<MetaBusinessAgentEligibility> {
    const checkedAt = new Date().toISOString();
    const credentials = await this.resolveCredentials(workspaceId, channelConnectionId);
    if (!credentials) {
      // A previously eligible workspace must not retain provider ownership
      // after its channel or secret disappears.  Persist UNKNOWN here too;
      // otherwise a stale ELIGIBLE row could keep the responder selector
      // advertising Meta even though no request can be authenticated.
      try {
        await this.persistEligibilityStatus(workspaceId, 'UNKNOWN', checkedAt, channelConnectionId);
      } catch (persistError) {
        console.error('[MetaBusinessAgentGateway] Could not persist missing-credentials eligibility state', persistError);
      }
      return { status: 'UNKNOWN', checkedAt, reason: 'CHANNEL_NOT_CONNECTED' };
    }

    try {
      const isEligible = await this.client.checkEligibility({
        phoneNumberId: credentials.phoneNumberId,
        accessToken: credentials.accessToken,
      });
      // Provisioning normally creates this row, but the adapter must remain
      // correct for older workspaces as well.  Persisting the provider result
      // is what lets the responder policy make a deterministic choice later;
      // an in-memory/browser-only eligibility flag is not sufficient.
      await this.persistEligibilityStatus(workspaceId, isEligible ? 'ELIGIBLE' : 'INELIGIBLE', checkedAt, credentials.channelConnectionId);
      return {
        status: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
        phoneNumberId: credentials.phoneNumberId,
        channelConnectionId: credentials.channelConnectionId,
        checkedAt,
      };
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      // Preserve UNKNOWN durably when a previously eligible agent cannot be
      // checked.  Leaving an old ELIGIBLE value in place would allow a stale
      // workspace policy to claim provider ownership indefinitely; marking it
      // UNKNOWN makes auto-fallback pause until the next successful check.
      try {
        await this.persistEligibilityStatus(workspaceId, 'UNKNOWN', checkedAt, credentials.channelConnectionId);
      } catch (persistError) {
        console.error('[MetaBusinessAgentGateway] Could not persist UNKNOWN eligibility state', persistError);
      }
      const isTermsError = Boolean(
        upstream?.message?.toLowerCase().includes('terms')
        || (upstream?.statusCode === 403 && upstream?.message?.includes('Meta Business AI'))
      );
      return {
        status: 'UNKNOWN',
        phoneNumberId: credentials.phoneNumberId,
        channelConnectionId: credentials.channelConnectionId,
        checkedAt,
        reason: isTermsError
          ? 'TERMS_NOT_ACCEPTED'
          : upstream?.statusCode && upstream.statusCode >= 400 && upstream.statusCode < 500
          ? 'UPSTREAM_REJECTED'
          : 'UPSTREAM_UNAVAILABLE',
        detail: upstream?.message,
        actionUrl: isTermsError ? 'https://www.facebook.com/legal/meta-business-ai-terms' : undefined,
      };
    }
  }

  async startOnboarding(workspaceId: string, catalogId?: string, channelConnectionId?: string): Promise<MetaBusinessAgentOnboarding> {
    // Resolve the current credential/phone before reusing any persisted agent
    // id.  An old PENDING/READY id is not safe evidence after a WABA phone was
    // replaced or a different connected channel was selected.
    const credentials = await this.resolveCredentials(workspaceId, channelConnectionId);
    if (!credentials) throw new MetaBusinessAgentUpstreamError('Meta WABA credentials are unavailable', 503);

    // Meta's onboarding contract is asynchronous, but it still requires an
    // eligibility check immediately before the trigger. A browser may hold an
    // old eligible value; never start or reuse a provider job from that stale
    // state.
    const eligibility = await this.checkEligibility(workspaceId, credentials.channelConnectionId);
    if (eligibility.status !== 'ELIGIBLE') {
      const statusCode = eligibility.status === 'INELIGIBLE' ? 409 : 503;
      throw new MetaBusinessAgentUpstreamError(
        eligibility.status === 'INELIGIBLE'
          ? 'Meta Business Agent is not eligible for this number'
          : 'Meta Business Agent eligibility could not be confirmed',
        statusCode,
      );
    }

    const current = await this.pool.query<{
      meta_agent_id: string | null;
      meta_agent_activation_status: MetaAgentActivationStatus | null;
      meta_agent_channel_connection_id: string | null;
    }>(
      `SELECT meta_agent_id, meta_agent_activation_status,
              meta_agent_channel_connection_id
       FROM public.workspace_agent_config
       WHERE workspace_id = $1
       LIMIT 1`,
      [workspaceId],
    );
    const currentAgent = current.rows[0];
    if (currentAgent?.meta_agent_id
      && currentAgent.meta_agent_channel_connection_id === credentials.channelConnectionId
      && (currentAgent.meta_agent_activation_status === 'PENDING'
        || currentAgent.meta_agent_activation_status === 'READY')) {
      // The provider job is asynchronous. Re-clicking the button must not
      // create a second agent/session while the first one is still preparing.
      return { agentId: currentAgent.meta_agent_id };
    }

    let agentId: string;
    try {
      agentId = await this.client.startOnboarding({ ...credentials, catalogId });
    } catch (error) {
      // Meta onboarding schedules asynchronous preparation. Persist a failed
      // state when the trigger itself is rejected, but never expose provider
      // error text that could contain credentials or customer data.
      try {
        await this.persistActivationStatus(workspaceId, 'FAILED', { error: 'META_ONBOARDING_TRIGGER_FAILED' });
      } catch (persistError) {
        console.error('[MetaBusinessAgentGateway] Could not persist onboarding failure', persistError);
      }
      throw error;
    }
    // A 201/agent_id only proves that Meta accepted the asynchronous job. It
    // is not proof that the agent is ready to answer customer conversations.
    await this.persistActivationStatus(workspaceId, 'PENDING', { agentId, channelConnectionId: credentials.channelConnectionId });
    return { agentId };
  }

  async testAgent(workspaceId: string, userMsg: string, conversationId?: string, channelConnectionId?: string): Promise<MetaBusinessAgentTestResult> {
    const credentials = await this.resolveCredentials(workspaceId, channelConnectionId);
    if (!credentials) throw new MetaBusinessAgentUpstreamError('Meta WABA credentials are unavailable');
    let result;
    try {
      result = await this.client.testAgent({ ...credentials, userMsg, conversationId });
    } catch (error) {
      try {
        await this.persistActivationStatus(workspaceId, 'FAILED', { error: 'META_AGENT_TEST_FAILED' });
      } catch (persistError) {
        console.error('[MetaBusinessAgentGateway] Could not persist agent test failure', persistError);
      }
      throw error;
    }
    // Meta can return a structurally valid envelope with no generated answer
    // (for example when the provider reports ELIGIBILITY_CHECK_FAILED).  That
    // is not proof that the agent is ready to own customer conversations.
    if (result.no_response_reason || !result.agent_response.trim()) {
      try {
        await this.persistActivationStatus(workspaceId, 'FAILED', { error: result.no_response_reason || 'META_AGENT_EMPTY_RESPONSE' });
      } catch (persistError) {
        console.error('[MetaBusinessAgentGateway] Could not persist empty agent test failure', persistError);
      }
      throw new MetaBusinessAgentUpstreamError(
        'Meta Business Agent did not produce a usable test response',
        409,
      );
    }
    // The non-billing agent_test endpoint exercises the provider pipeline. A
    // successful response is the first durable proof that the asynchronous
    // onboarding is usable; only then may the responder selector expose Meta.
    await this.persistActivationStatus(workspaceId, 'READY', { channelConnectionId: credentials.channelConnectionId });
    return {
      messageId: result.message_id,
      agentResponse: result.agent_response,
      conversationId: result.conversation_id,
      timestamp: result.timestamp,
      handoffReason: result.handoff_reason,
      noResponseReason: result.no_response_reason,
      quickReplies: result.quick_replies,
      productVariantIds: result.product_variant_ids,
    };
  }

  async controlThread(
    workspaceId: string,
    input: { action: 'take' | 'release'; to: string; metadata?: string; channelConnectionId?: string },
  ): Promise<MetaBusinessAgentThreadControlResult> {
    const credentials = await this.resolveCredentials(workspaceId, input.channelConnectionId);
    if (!credentials) throw new MetaBusinessAgentUpstreamError('Meta WABA credentials are unavailable');
    const { channelConnectionId: _channelConnectionId, ...providerInput } = input;
    const messagingProduct = await this.client.controlThread({ ...credentials, ...providerInput });
    return { messagingProduct };
  }
}
