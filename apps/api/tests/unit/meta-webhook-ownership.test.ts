import { describe, expect, it, vi } from 'vitest';
import { resolveWorkspace } from '../../src/interfaces/http/routes/webhooks/messenger-webhook-handler.js';
import { findChannelByPhoneNumberId } from '../../src/interfaces/http/routes/webhooks/waba-webhook.js';

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
});
