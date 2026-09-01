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

export class PostgresMetaBusinessAgentGateway implements MetaBusinessAgentGateway {
  constructor(
    private readonly pool: PgConnector = dbPool,
    private readonly client = new MetaBusinessAgentClient({
      baseUrl: process.env.META_BUSINESS_AGENT_BASE_URL?.trim() || undefined,
    }),
  ) {}

  private async resolveCredentials(workspaceId: string): Promise<{ phoneNumberId: string; accessToken: string } | null> {
    const result = await this.pool.query<{
      phone_number_id: string | null;
      secret_payload: Record<string, unknown> | string | null;
    }>(`
      SELECT
        cc.public_config::jsonb ->> 'phoneNumberId' AS phone_number_id,
        cs.secret_payload
      FROM public.channel_connections cc
      LEFT JOIN public.channel_connection_secrets cs
        ON cs.channel_connection_id = cc.id
        AND cs.secret_kind = 'meta_bearer_token'
      WHERE cc.workspace_id = $1
        AND cc.provider = 'meta_cloud'
        AND cc.status = 'CONNECTED'
      ORDER BY cc.created_at ASC
      LIMIT 2
    `, [workspaceId]);
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    const secretPayload = typeof row.secret_payload === 'string'
      ? JSON.parse(row.secret_payload) as Record<string, unknown>
      : row.secret_payload ?? {};
    const accessToken = typeof secretPayload.accessToken === 'string' ? secretPayload.accessToken : '';
    if (!row.phone_number_id || !accessToken) return null;
    return { phoneNumberId: row.phone_number_id, accessToken };
  }

  private async persistEligibilityStatus(
    workspaceId: string,
    status: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN',
    checkedAt: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.workspace_agent_config (
         workspace_id, meta_agent_eligibility_status, meta_agent_checked_at, updated_at
       ) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         meta_agent_eligibility_status = EXCLUDED.meta_agent_eligibility_status,
         meta_agent_checked_at = EXCLUDED.meta_agent_checked_at,
         updated_at = NOW()`,
      [workspaceId, status, checkedAt],
    );
  }

  async checkEligibility(workspaceId: string): Promise<MetaBusinessAgentEligibility> {
    const checkedAt = new Date().toISOString();
    const credentials = await this.resolveCredentials(workspaceId);
    if (!credentials) {
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
      await this.persistEligibilityStatus(workspaceId, isEligible ? 'ELIGIBLE' : 'INELIGIBLE', checkedAt);
      return {
        status: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
        phoneNumberId: credentials.phoneNumberId,
        checkedAt,
      };
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      // Preserve UNKNOWN durably when a previously eligible agent cannot be
      // checked.  Leaving an old ELIGIBLE value in place would allow a stale
      // workspace policy to claim provider ownership indefinitely; marking it
      // UNKNOWN makes auto-fallback pause until the next successful check.
      try {
        await this.persistEligibilityStatus(workspaceId, 'UNKNOWN', checkedAt);
      } catch (persistError) {
        console.error('[MetaBusinessAgentGateway] Could not persist UNKNOWN eligibility state', persistError);
      }
      return {
        status: 'UNKNOWN',
        phoneNumberId: credentials.phoneNumberId,
        checkedAt,
        reason: upstream?.statusCode && upstream.statusCode >= 400 && upstream.statusCode < 500
          ? 'UPSTREAM_REJECTED'
          : 'UPSTREAM_UNAVAILABLE',
      };
    }
  }

  async startOnboarding(workspaceId: string, catalogId?: string): Promise<MetaBusinessAgentOnboarding> {
    const credentials = await this.resolveCredentials(workspaceId);
    if (!credentials) throw new MetaBusinessAgentUpstreamError('Meta WABA credentials are unavailable');
    const agentId = await this.client.startOnboarding({ ...credentials, catalogId });
    await this.pool.query(
      `INSERT INTO public.workspace_agent_config (
         workspace_id, meta_agent_id, meta_agent_enabled, updated_at
       ) VALUES ($1, $2, true, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         meta_agent_id = EXCLUDED.meta_agent_id,
         meta_agent_enabled = true,
         updated_at = NOW()`,
      [workspaceId, agentId],
    );
    return { agentId };
  }

  async testAgent(workspaceId: string, userMsg: string, conversationId?: string): Promise<MetaBusinessAgentTestResult> {
    const credentials = await this.resolveCredentials(workspaceId);
    if (!credentials) throw new MetaBusinessAgentUpstreamError('Meta WABA credentials are unavailable');
    const result = await this.client.testAgent({ ...credentials, userMsg, conversationId });
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
    input: { action: 'take' | 'release'; to: string; metadata?: string },
  ): Promise<MetaBusinessAgentThreadControlResult> {
    const credentials = await this.resolveCredentials(workspaceId);
    if (!credentials) throw new MetaBusinessAgentUpstreamError('Meta WABA credentials are unavailable');
    const messagingProduct = await this.client.controlThread({ ...credentials, ...input });
    return { messagingProduct };
  }
}
