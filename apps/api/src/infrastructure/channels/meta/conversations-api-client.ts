/**
 * Conversations API Client — Meta Graph API v20.0
 * 
 * Interacts with the unified Page / Instagram Conversations endpoint:
 * - List active threads across Messenger, Instagram DM, and WhatsApp
 * - Fetch full message histories with attachments and stickers
 * - Query individual message details and delivery metadata
 */

export interface MetaConversationItem {
  id: string;
  updatedTime: string;
  messageCount: number;
  unreadCount: number;
  snippet?: string;
  participants: Array<{ id: string; name?: string; email?: string }>;
}

export interface MetaMessageItem {
  id: string;
  message?: string;
  from: { id: string; name?: string; email?: string };
  createdTime: string;
  attachments?: any[];
  shares?: any[];
  sticker?: string;
}

export class ConversationsApiClient {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  /**
   * List conversations for a Facebook Page or Instagram Business Account.
   */
  async listConversations(params: {
    pageId: string;
    pageAccessToken: string;
    platform?: 'messenger' | 'instagram';
    folder?: 'inbox' | 'done' | 'spam';
    limit?: number;
  }): Promise<{ data: MetaConversationItem[]; nextPageCursor?: string }> {
    const { pageId, pageAccessToken, platform, folder = 'inbox', limit = 25 } = params;

    const url = new URL(`${this.baseUrl}/${pageId}/conversations`);
    url.searchParams.set('fields', 'id,updated_time,message_count,unread_count,snippet,participants');
    url.searchParams.set('folder', folder);
    url.searchParams.set('limit', String(limit));
    if (platform) url.searchParams.set('platform', platform);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        Accept: 'application/json',
      },
    });

    const json = (await response.json()) as any;
    if (!response.ok || json.error) {
      throw new Error(json.error?.message || `Conversations API Error: HTTP ${response.status}`);
    }

    const items: MetaConversationItem[] = (json.data || []).map((row: any) => ({
      id: row.id,
      updatedTime: row.updated_time,
      messageCount: row.message_count || 0,
      unreadCount: row.unread_count || 0,
      snippet: row.snippet,
      participants: row.participants?.data || [],
    }));

    return {
      data: items,
      nextPageCursor: json.paging?.cursors?.after,
    };
  }

  /**
   * Retrieve messages within a specific conversation thread.
   */
  async getConversationMessages(params: {
    conversationId: string;
    pageAccessToken: string;
    limit?: number;
  }): Promise<MetaMessageItem[]> {
    const { conversationId, pageAccessToken, limit = 50 } = params;

    const url = new URL(`${this.baseUrl}/${conversationId}/messages`);
    url.searchParams.set('fields', 'id,message,from,created_time,attachments,shares,sticker');
    url.searchParams.set('limit', String(limit));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        Accept: 'application/json',
      },
    });

    const json = (await response.json()) as any;
    if (!response.ok || json.error) {
      throw new Error(json.error?.message || `Conversations Messages API Error: HTTP ${response.status}`);
    }

    return (json.data || []).map((row: any) => ({
      id: row.id,
      message: row.message,
      from: row.from,
      createdTime: row.created_time,
      attachments: row.attachments?.data || [],
      shares: row.shares?.data || [],
      sticker: row.sticker,
    }));
  }
}
