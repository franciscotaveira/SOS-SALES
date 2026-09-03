import { describe, expect, it, vi } from 'vitest';
import { PrivateReplyService } from '../../src/application/services/private-reply-service.js';
import { MessengerClient } from '../../src/infrastructure/channels/meta/messenger-client.js';

describe('PrivateReplyService', () => {
  it('reserves and persists a private reply after Meta accepts it', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'dispatch-1', status: 'PENDING' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ secret_payload: { pageAccessToken: 'page-token' } }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const messenger = {
      sendPrivateReply: vi.fn().mockResolvedValue({ messageId: 'message-1', recipientId: 'user-1' }),
    } as unknown as MessengerClient;
    const service = new PrivateReplyService({ query } as any, messenger);

    await expect(service.dispatchPrivateReply({
      workspaceId: 'workspace-1',
      channelConnectionId: 'channel-1',
      commentId: 'comment-1',
      commentText: 'Quanto custa?',
      authorName: 'Ana',
      replyText: 'Oi {{name}}',
    })).resolves.toMatchObject({ success: true, status: 'SENT', messageId: 'message-1' });

    expect(messenger.sendPrivateReply).toHaveBeenCalledWith({
      pageAccessToken: 'page-token',
      commentId: 'comment-1',
      message: 'Oi Ana',
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("status = 'SENT'"),
      ['dispatch-1', 'message-1', 'user-1'],
    );
  });

  it('does not call Meta when a comment already has a pending or sent dispatch', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'SENT' }] });
    const messenger = { sendPrivateReply: vi.fn() } as unknown as MessengerClient;
    const service = new PrivateReplyService({ query } as any, messenger);

    await expect(service.dispatchPrivateReply({
      workspaceId: 'workspace-1',
      channelConnectionId: 'channel-1',
      commentId: 'comment-1',
      commentText: '',
      replyText: 'Oi',
    })).resolves.toMatchObject({ success: false, alreadyReplied: true, status: 'SENT' });
    expect(messenger.sendPrivateReply).not.toHaveBeenCalled();
  });
});

