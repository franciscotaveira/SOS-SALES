/**
 * Private Reply Service — Converts Facebook/Instagram comments into private DMs
 * 
 * Implements Meta Private Replies capability:
 * - Sends 1:1 private message in response to a post/video comment
 * - Enforces Meta's 1-reply-per-comment strict limit
 * - Respects the 7-day window for replying to comments
 * - Persists dispatch status to prevent duplicate replies
 */

import { MessengerClient } from '../../infrastructure/channels/meta/messenger-client.js';
import { dbPool } from '../../infrastructure/database/pool.js';
import type { Pool } from 'pg';

export interface PrivateReplyDispatchOptions {
  workspaceId: string;
  channelConnectionId: string;
  commentId: string;
  commentText: string;
  authorName?: string;
  replyText: string;
}

export interface PrivateReplyDispatchResult {
  success: boolean;
  messageId?: string;
  recipientId?: string;
  error?: string;
  alreadyReplied?: boolean;
  status?: 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';
}

export class PrivateReplyService {
  constructor(
    private readonly pool: Pick<Pool, 'query'> = dbPool,
    private readonly messengerClient = new MessengerClient(),
  ) {}

  /**
   * Dispatches a private reply to a specific comment.
   */
  async dispatchPrivateReply(options: PrivateReplyDispatchOptions): Promise<PrivateReplyDispatchResult> {
    const { workspaceId, channelConnectionId, commentId, commentText, authorName, replyText } = options;

    // Reserve the comment before calling Meta.  A second concurrent request
    // sees PENDING/SENT/UNKNOWN and is refused instead of risking a duplicate
    // provider message.  FAILED is the only state that may be retried.
    const reservation = await this.pool.query<{ id: string; status: 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' }>(
      `INSERT INTO public.meta_private_reply_dispatches (
         workspace_id, channel_connection_id, comment_id, comment_text, author_name, reply_text, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       ON CONFLICT (workspace_id, comment_id) DO UPDATE
         SET reply_text = EXCLUDED.reply_text,
             author_name = EXCLUDED.author_name,
             comment_text = EXCLUDED.comment_text,
             status = 'PENDING',
             failure_code = NULL,
             failure_detail = NULL,
             updated_at = NOW()
         WHERE meta_private_reply_dispatches.status = 'FAILED'
       RETURNING id, status`,
      [workspaceId, channelConnectionId, commentId, commentText || '', authorName || null, replyText],
    );

    if (reservation.rows.length === 0) {
      const checkRes = await this.pool.query<{ status: 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' }>(
        `SELECT status
         FROM public.meta_private_reply_dispatches
         WHERE workspace_id = $1 AND comment_id = $2
         LIMIT 1`,
        [workspaceId, commentId],
      );
      const status = checkRes.rows[0]?.status || 'UNKNOWN';
      return {
        success: false,
        alreadyReplied: true,
        status,
        error: status === 'PENDING'
          ? 'Private reply is already being dispatched for this comment'
          : 'Private reply already sent or requires reconciliation for this comment',
      };
    }

    // Retrieve Page Access Token from channel secrets
    const secretRes = await this.pool.query(
      `SELECT cs.secret_payload
       FROM public.channel_connections cc
       LEFT JOIN public.channel_connection_secrets cs
         ON cs.channel_connection_id = cc.id
        AND cs.secret_kind = 'meta_bearer_token'
       WHERE cc.id = $1 AND cc.workspace_id = $2
         AND cc.provider = 'messenger' AND cc.status = 'CONNECTED'`,
      [channelConnectionId, workspaceId]
    );

    if (secretRes.rows.length === 0) {
      await this.markFailed(reservation.rows[0].id, 'CHANNEL_NOT_FOUND', 'Channel connection not found');
      return { success: false, status: 'FAILED', error: 'Channel connection not found' };
    }

    const secretRaw = secretRes.rows[0].secret_payload;
    const secretPayload = typeof secretRaw === 'string' ? JSON.parse(secretRaw) : (secretRaw || {});
    const pageAccessToken = secretPayload.pageAccessToken || secretPayload.accessToken;

    if (!pageAccessToken) {
      await this.markFailed(reservation.rows[0].id, 'PAGE_TOKEN_MISSING', 'Page Access Token not configured for Private Replies');
      return { success: false, status: 'FAILED', error: 'Page Access Token not configured for Private Replies' };
    }

    // Personalize template with author name
    const formattedText = authorName
      ? replyText.replace(/\{\{name\}\}/gi, authorName).replace(/\{\{nome\}\}/gi, authorName)
      : replyText.replace(/\{\{name\}\}/gi, 'amigo(a)').replace(/\{\{nome\}\}/gi, 'amigo(a)');

    try {
      const result = await this.messengerClient.sendPrivateReply({
        pageAccessToken,
        commentId,
        message: formattedText,
      });

      try {
        await this.pool.query(
          `UPDATE public.meta_private_reply_dispatches
           SET status = 'SENT', provider_message_id = $2, provider_recipient_id = $3,
               sent_at = NOW(), failure_code = NULL, failure_detail = NULL, updated_at = NOW()
           WHERE id = $1 AND status = 'PENDING'`,
          [reservation.rows[0].id, result.messageId, result.recipientId],
        );
      } catch (persistError) {
        // Meta already accepted the reply. Mark UNKNOWN if possible so a
        // retry is blocked and an operator can reconcile the provider id.
        await this.pool.query(
          `UPDATE public.meta_private_reply_dispatches
           SET status = 'UNKNOWN', provider_message_id = $2, provider_recipient_id = $3,
               failure_code = 'LOCAL_PERSIST_FAILED', failure_detail = 'Provider accepted reply but local state could not be saved', updated_at = NOW()
           WHERE id = $1`,
          [reservation.rows[0].id, result.messageId, result.recipientId],
        ).catch(() => undefined);
        return { success: false, status: 'UNKNOWN', error: 'Meta aceitou a resposta privada, mas o estado local precisa de reconciliação.' };
      }

      return {
        success: true,
        status: 'SENT',
        messageId: result.messageId,
        recipientId: result.recipientId,
      };
    } catch (err: any) {
      await this.markFailed(reservation.rows[0].id, 'META_SEND_FAILED', err?.message || 'Error sending private reply via Meta Graph API');
      return {
        success: false,
        status: 'FAILED',
        error: err.message || 'Error sending private reply via Meta Graph API',
      };
    }
  }

  private async markFailed(id: string, code: string, detail: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.meta_private_reply_dispatches
       SET status = 'FAILED', failure_code = $2, failure_detail = $3, updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING'`,
      [id, code, detail.slice(0, 2000)],
    ).catch(() => undefined);
  }
}
