/**
 * Instagram DM Client — Meta Graph API v20.0
 *
 * Implements Instagram Messaging API capabilities:
 * - Text Messages
 * - Media (Image, Audio, Video, File via Sticker)
 * - Generic Template (Product cards)
 * - Ice Breakers (conversation starters)
 * - Media Share handling
 * - Story Mention/Reply handling
 *
 * Key differences from Messenger:
 * - Uses Instagram-Scoped ID (IGSID) instead of PSID
 * - Endpoint is the same (/messages) but recipient uses IGSID
 * - Limited template types (generic only, no buttons template)
 * - Ice Breakers instead of Get Started button
 * - Story mentions and replies are unique to Instagram
 */

export interface InstagramSendTextOptions {
  igUserId: string;
  pageAccessToken: string;
  recipientIgsid: string;
  text: string;
  messageTag?: 'HUMAN_AGENT';
}

export interface InstagramSendMediaOptions {
  igUserId: string;
  pageAccessToken: string;
  recipientIgsid: string;
  mediaType: 'image' | 'audio' | 'video' | 'file';
  url: string;
}

export interface InstagramSendGenericTemplateOptions {
  igUserId: string;
  pageAccessToken: string;
  recipientIgsid: string;
  elements: Array<{
    title: string;
    subtitle?: string;
    image_url?: string;
    default_action?: { type: 'web_url'; url: string };
    buttons?: Array<{ type: 'web_url' | 'postback'; title: string; url?: string; payload?: string }>;
  }>;
}

export interface InstagramIceBreaker {
  question: string; // Max 80 chars
  payload: string;  // Sent back when user taps
}

export interface InstagramSendHeartReactionOptions {
  igUserId: string;
  pageAccessToken: string;
  recipientIgsid: string;
  senderMessageId: string;
}

export class InstagramDmClient {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  // ─── Text Messages ──────────────────────────────────────────────

  async sendText(options: InstagramSendTextOptions): Promise<{ messageId: string; recipientId: string }> {
    const { igUserId, pageAccessToken, recipientIgsid, text, messageTag } = options;

    const body: Record<string, unknown> = {
      recipient: { id: recipientIgsid },
      message: { text },
    };
    if (messageTag) {
      body.messaging_type = 'MESSAGE_TAG';
      body.tag = messageTag;
    }

    return this.sendRequest(igUserId, pageAccessToken, body);
  }

  // ─── Media Messages ─────────────────────────────────────────────

  async sendMedia(options: InstagramSendMediaOptions): Promise<{ messageId: string; recipientId: string }> {
    const { igUserId, pageAccessToken, recipientIgsid, mediaType, url } = options;

    // Instagram supports image, audio, video, and file (via 'file' type)
    const attachmentType = mediaType === 'file' ? 'file' : mediaType;

    return this.sendRequest(igUserId, pageAccessToken, {
      recipient: { id: recipientIgsid },
      message: {
        attachment: {
          type: attachmentType,
          payload: { url },
        },
      },
    });
  }

  // ─── Heart/Like Reaction ────────────────────────────────────────

  async sendHeartReaction(options: InstagramSendHeartReactionOptions): Promise<{ messageId: string; recipientId: string }> {
    const { igUserId, pageAccessToken, recipientIgsid, senderMessageId } = options;

    return this.sendRequest(igUserId, pageAccessToken, {
      recipient: { id: recipientIgsid },
      sender_action: 'react',
      payload: {
        message_id: senderMessageId,
        reaction: 'love',
      },
    });
  }

  // ─── Generic Template ──────────────────────────────────────────

  async sendGenericTemplate(options: InstagramSendGenericTemplateOptions): Promise<{ messageId: string; recipientId: string }> {
    const { igUserId, pageAccessToken, recipientIgsid, elements } = options;

    return this.sendRequest(igUserId, pageAccessToken, {
      recipient: { id: recipientIgsid },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: elements.slice(0, 10).map((el) => ({
              title: el.title.substring(0, 80),
              subtitle: el.subtitle?.substring(0, 80),
              image_url: el.image_url,
              default_action: el.default_action,
              buttons: el.buttons?.slice(0, 3),
            })),
          },
        },
      },
    });
  }

  // ─── Quick Replies ──────────────────────────────────────────────

  async sendQuickReplies(
    igUserId: string,
    pageAccessToken: string,
    recipientIgsid: string,
    text: string,
    quickReplies: Array<{ content_type: 'text'; title: string; payload: string }>
  ): Promise<{ messageId: string; recipientId: string }> {
    return this.sendRequest(igUserId, pageAccessToken, {
      recipient: { id: recipientIgsid },
      message: {
        text,
        quick_replies: quickReplies.slice(0, 13).map((qr) => ({
          content_type: qr.content_type,
          title: qr.title.substring(0, 20),
          payload: qr.payload.substring(0, 1000),
        })),
      },
    });
  }

  // ─── Ice Breakers ──────────────────────────────────────────────

  async setIceBreakers(
    igUserId: string,
    pageAccessToken: string,
    iceBreakers: InstagramIceBreaker[]
  ): Promise<{ result: string }> {
    const response = await fetch(`${this.baseUrl}/${igUserId}/messenger_profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: 'instagram',
        ice_breakers: iceBreakers.slice(0, 4).map((ib) => ({
          question: ib.question.substring(0, 80),
          payload: ib.payload,
        })),
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { result: data.result || 'success' };
  }

  async deleteIceBreakers(igUserId: string, pageAccessToken: string): Promise<{ result: string }> {
    const response = await fetch(`${this.baseUrl}/${igUserId}/messenger_profile`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: ['ice_breakers'],
        platform: 'instagram',
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { result: data.result || 'success' };
  }

  // ─── Sender Actions ────────────────────────────────────────────

  async markSeen(igUserId: string, pageAccessToken: string, recipientIgsid: string): Promise<void> {
    await fetch(`${this.baseUrl}/${igUserId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        sender_action: 'mark_seen',
      }),
    });
  }

  async typingOn(igUserId: string, pageAccessToken: string, recipientIgsid: string): Promise<void> {
    await fetch(`${this.baseUrl}/${igUserId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        sender_action: 'typing_on',
      }),
    });
  }

  // ─── Internals ─────────────────────────────────────────────────

  private async sendRequest(
    igUserId: string,
    pageAccessToken: string,
    body: Record<string, unknown>
  ): Promise<{ messageId: string; recipientId: string }> {
    const response = await fetch(`${this.baseUrl}/${igUserId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }

    return {
      messageId: data.message_id || '',
      recipientId: data.recipient_id || '',
    };
  }

  private parseError(errorObj: any, httpStatus: number): Error {
    const code = errorObj?.code;
    const subcode = errorObj?.error_subcode;
    const message = errorObj?.message || `Instagram DM API Error: HTTP ${httpStatus}`;

    switch (code) {
      case 10:
        return new Error(`[IG DM #10] Permissão negada: O app não tem instagram_manage_messages aprovado.`);
      case 100:
        if (subcode === 2018109) {
          return new Error(`[IG DM #100.2018109] Janela de 24h expirada. Use HUMAN_AGENT tag.`);
        }
        if (subcode === 2534015) {
          return new Error(`[IG DM #100.2534015] Usuário bloqueou mensagens desta conta.`);
        }
        return new Error(`[IG DM #100] Parâmetro inválido: ${message}`);
      case 190:
        return new Error(`[IG DM #190] Token expirado. Reconecte em Configurações.`);
      case 613:
        return new Error(`[IG DM #613] Rate limit atingido para Instagram DM.`);
      default:
        return new Error(`[IG DM #${code || 'UNKNOWN'}] ${message}`);
    }
  }
}
