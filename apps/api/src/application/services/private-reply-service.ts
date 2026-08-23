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
}

export class PrivateReplyService {
  private readonly messengerClient = new MessengerClient();

  /**
   * Dispatches a private reply to a specific comment.
   */
  async dispatchPrivateReply(options: PrivateReplyDispatchOptions): Promise<PrivateReplyDispatchResult> {
    const { workspaceId, channelConnectionId, commentId, authorName, replyText } = options;

    // Check if this comment has already been replied to
    const checkRes = await dbPool.query(
      `SELECT id FROM public.conversation_messages 
       WHERE workspace_id = $1 
         AND (media_payload->>'commentId') = $2 
         AND (media_payload->>'isPrivateReply') = 'true'
       LIMIT 1`,
      [workspaceId, commentId]
    );

    if (checkRes.rows.length > 0) {
      return {
        success: false,
        alreadyReplied: true,
        error: 'Private reply already sent for this comment',
      };
    }

    // Retrieve Page Access Token from channel secrets
    const secretRes = await dbPool.query(
      `SELECT cs.secret_payload
       FROM public.channel_connections cc
       LEFT JOIN public.channel_connection_secrets cs
         ON cs.channel_connection_id = cc.id
        AND cs.secret_kind = 'meta_bearer_token'
       WHERE cc.id = $1 AND cc.workspace_id = $2`,
      [channelConnectionId, workspaceId]
    );

    if (secretRes.rows.length === 0) {
      return { success: false, error: 'Channel connection not found' };
    }

    const secretRaw = secretRes.rows[0].secret_payload;
    const secretPayload = typeof secretRaw === 'string' ? JSON.parse(secretRaw) : (secretRaw || {});
    const pageAccessToken = secretPayload.pageAccessToken || secretPayload.accessToken;

    if (!pageAccessToken) {
      return { success: false, error: 'Page Access Token not configured for Private Replies' };
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

      return {
        success: true,
        messageId: result.messageId,
        recipientId: result.recipientId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Error sending private reply via Meta Graph API',
      };
    }
  }
}
