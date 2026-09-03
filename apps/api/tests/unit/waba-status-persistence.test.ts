import { describe, expect, it, vi } from 'vitest';
import {
  extractWabaStatusError,
  persistWabaStatus,
} from '../../src/interfaces/http/routes/webhooks/waba-webhook.js';

const channelInfo = { id: 'channel-waba-1', workspace_id: 'workspace-waba-1' };
const logger = { warn: vi.fn(), error: vi.fn() } as any;

describe('WABA status persistence', () => {
  it('stores a Meta failure code and message on the immutable lifecycle event', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] });
    const statusObj = {
      id: 'wamid.failure-12345678',
      status: 'failed',
      timestamp: '1725100000',
      errors: [{ code: 131047, title: 'Re-engagement message required' }],
    };

    await expect(persistWabaStatus({
      channelInfo,
      wabaMessageId: statusObj.id,
      status: 'FAILED',
      providerTimestamp: new Date('2026-08-31T12:00:00.000Z'),
      statusObj,
    }, logger, query as any)).resolves.toEqual({ correlated: true });

    expect(query).toHaveBeenCalledTimes(1);
    const params = query.mock.calls[0][1];
    expect(params).toEqual(expect.arrayContaining(['131047', 'Re-engagement message required']));
    expect(query.mock.calls[0][0]).toContain('error_code, error_message');
  });

  it('retains an unmatched status as an immutable reconciliation receipt and logs only sanitized identifiers', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const messageId = 'wamid.unmatched-private-87654321';

    await expect(persistWabaStatus({
      channelInfo,
      wabaMessageId: messageId,
      status: 'DELIVERED',
      providerTimestamp: new Date('2026-08-31T12:00:00.000Z'),
      statusObj: { id: messageId, status: 'delivered', timestamp: '1725100001' },
    }, logger, query as any)).resolves.toEqual({ correlated: false });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('inbound_channel_events');
    expect(logger.warn).toHaveBeenLastCalledWith(
      expect.objectContaining({ providerMessageIdSuffix: '87654321', status: 'DELIVERED' }),
      expect.stringContaining('retained for reconciliation'),
    );
    expect(JSON.stringify(logger.warn.mock.calls.at(-1))).not.toContain('wamid.unmatched-private');
  });

  it('extracts the Meta status error shape without inventing an error for successful delivery', () => {
    expect(extractWabaStatusError({ errors: [{ code: 131026, message: 'Message undeliverable' }] }))
      .toEqual({ code: '131026', message: 'Message undeliverable' });
    expect(extractWabaStatusError({})).toEqual({ code: null, message: null });
  });
});
