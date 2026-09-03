import { describe, expect, it, vi } from 'vitest';
import { resolveWorkspace } from '../../src/interfaces/http/routes/webhooks/messenger-webhook-handler.js';
import {
  findChannelByPhoneNumberId,
  inferWabaHandoverOwner,
  isWabaHandoverField,
  persistWabaHandover,
  resolveWorkspaceResponderDefaults,
} from '../../src/interfaces/http/routes/webhooks/waba-webhook.js';

const logger = {
  warn: vi.fn(),
  error: vi.fn(),
} as any;

describe('Meta webhook provider ownership', () => {
  it('accepts a WABA phone number only when one workspace owns it', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'connection-a', workspace_id: 'workspace-a' }],
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

    await expect(findChannelByPhoneNumberId('123456789', logger, query)).resolves.toEqual({
      id: 'connection-a',
      workspace_id: 'workspace-a',
    });
  });

  it('rejects a WABA phone number owned by multiple workspaces', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { id: 'connection-a', workspace_id: 'workspace-a' },
        { id: 'connection-b', workspace_id: 'workspace-b' },
      ],
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

    await expect(findChannelByPhoneNumberId('123456789', logger, query)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('rejects Messenger/Instagram ownership ambiguity instead of selecting a first row', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { id: 'connection-a', workspace_id: 'workspace-a' },
        { id: 'connection-b', workspace_id: 'workspace-b' },
      ],
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

    await expect(resolveWorkspace('page-123', 'messenger', query)).resolves.toEqual({
      workspaceId: null,
      channelConnectionId: null,
    });
  });

  it('does not issue a database lookup without a WABA phone number id', async () => {
    const query = vi.fn() as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    await expect(findChannelByPhoneNumberId(undefined, logger, query)).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('recognizes explicit Meta handover fields and never guesses unknown owners', () => {
    expect(isWabaHandoverField('messaging_handovers')).toBe(true);
    expect(isWabaHandoverField('messages')).toBe(false);
    expect(inferWabaHandoverOwner({ action: 'take' })).toBe('sos_sales');
    expect(inferWabaHandoverOwner({ action: 'release' })).toBe('meta_business_agent');
    expect(inferWabaHandoverOwner({ metadata: 'take' })).toBeNull();
  });

  it('persists a handover receipt and reconciles only its exact channel/contact', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'receipt-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const result = await persistWabaHandover({
      channelInfo: { id: 'connection-a', workspace_id: 'workspace-a' },
      phoneNumberId: 'phone-1',
      entryId: 'entry-1',
      field: 'messaging_handovers',
      value: { messaging_handovers: [{ id: 'handover-1', action: 'take', to: '+55 49 99999-9999' }] },
    }, logger, query);
    expect(result).toEqual({ receipts: 1, journeysUpdated: 1 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String((query as any).mock.calls[1][0])).toContain('j.channel_connection_id = $2');
  });

  it('propagates ownership lookup failures so the webhook can request a Meta retry', async () => {
    const query = vi.fn().mockRejectedValue(new Error('database unavailable')) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

    await expect(findChannelByPhoneNumberId('123456789', logger, query)).rejects.toThrow('database unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('maps a ready Meta agent to Meta ownership in auto fallback mode', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        responder_mode: 'auto_fallback',
        meta_agent_id: 'agent-1',
        meta_agent_enabled: true,
        meta_agent_eligibility_status: 'ELIGIBLE',
        meta_agent_checked_at: new Date().toISOString(),
        meta_agent_activation_status: 'READY',
      }],
    }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

    await expect(resolveWorkspaceResponderDefaults('workspace-a', query)).resolves.toEqual({
      responderMode: 'auto_fallback',
      responderOwner: 'meta_business_agent',
      metaAgentId: 'agent-1',
      metaAgentEnabled: true,
      metaAgentEligibilityStatus: 'ELIGIBLE',
      metaAgentCheckedAt: expect.any(String),
      metaAgentActivationStatus: 'READY',
    });
  });

  it('maps an unavailable Meta agent to SOS fallback and manual mode to human', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          responder_mode: 'auto_fallback',
          meta_agent_id: 'agent-1',
          meta_agent_enabled: true,
          meta_agent_eligibility_status: 'UNKNOWN',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          responder_mode: 'manual',
          meta_agent_id: null,
          meta_agent_enabled: false,
          meta_agent_eligibility_status: 'UNKNOWN',
        }],
      }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;

    await expect(resolveWorkspaceResponderDefaults('workspace-a', query)).resolves.toMatchObject({
      responderMode: 'auto_fallback',
      responderOwner: 'sos_sales',
    });
    await expect(resolveWorkspaceResponderDefaults('workspace-a', query)).resolves.toMatchObject({
      responderMode: 'manual',
      responderOwner: 'human',
    });
  });
});
