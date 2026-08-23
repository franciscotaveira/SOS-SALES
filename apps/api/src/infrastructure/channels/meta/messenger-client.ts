/**
 * Messenger Client — Meta Graph API v20.0 Send API
 *
 * Implements Messenger Platform messaging capabilities:
 * - Text, Media (Image, Audio, Video, File)
 * - Quick Replies & Persistent Menu
 * - Generic Template (Carousels) & Button Template
 * - Sender Actions (typing_on, typing_off, mark_seen)
 * - Welcome Screen (Get Started + Greeting)
 * - Ice Breakers for Instagram
 * - Persona API
 */

export interface MessengerSendTextOptions {
  pageId: string;
  pageAccessToken: string;
  recipientPsid: string;
  text: string;
  messageTag?: MessengerMessageTag;
}

export interface MessengerSendMediaOptions {
  pageId: string;
  pageAccessToken: string;
  recipientPsid: string;
  mediaType: 'image' | 'audio' | 'video' | 'file';
  url: string;
  isReusable?: boolean;
}

export interface MessengerQuickReply {
  content_type: 'text' | 'user_phone_number' | 'user_email';
  title?: string;
  payload?: string;
  image_url?: string;
}

export interface MessengerSendQuickRepliesOptions {
  pageId: string;
  pageAccessToken: string;
  recipientPsid: string;
  text: string;
  quickReplies: MessengerQuickReply[];
  messageTag?: MessengerMessageTag;
}

export interface MessengerTemplateElement {
  title: string;
  subtitle?: string;
  image_url?: string;
  default_action?: {
    type: 'web_url';
    url: string;
    webview_height_ratio?: 'compact' | 'tall' | 'full';
  };
  buttons?: MessengerButton[];
}

export interface MessengerButton {
  type: 'web_url' | 'postback' | 'phone_number';
  title: string;
  url?: string;
  payload?: string;
}

export interface MessengerSendGenericTemplateOptions {
  pageId: string;
  pageAccessToken: string;
  recipientPsid: string;
  elements: MessengerTemplateElement[];
  messageTag?: MessengerMessageTag;
}

export interface MessengerSendButtonTemplateOptions {
  pageId: string;
  pageAccessToken: string;
  recipientPsid: string;
  text: string;
  buttons: MessengerButton[];
  messageTag?: MessengerMessageTag;
}

export type MessengerSenderAction = 'typing_on' | 'typing_off' | 'mark_seen';

/**
 * Message Tags allow sending outside the 24h window for specific use cases.
 * Only approved tags are allowed by Meta.
 */
export type MessengerMessageTag =
  | 'CONFIRMED_EVENT_UPDATE'
  | 'POST_PURCHASE_UPDATE'
  | 'ACCOUNT_UPDATE'
  | 'HUMAN_AGENT';

export interface MessengerGreetingEntry {
  locale: string; // 'default', 'pt_BR', 'en_US', etc.
  text: string; // Max 160 chars. Supports {{user_first_name}}, {{user_last_name}}, {{user_full_name}}
}

export interface MessengerPrivateReplyOptions {
  pageAccessToken: string;
  commentId: string;
  message: string;
}

export class MessengerClient {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  // ─── Text Messages ──────────────────────────────────────────────

  async sendText(options: MessengerSendTextOptions): Promise<{ messageId: string; recipientId: string }> {
    const { pageId, pageAccessToken, recipientPsid, text, messageTag } = options;

    const body: Record<string, unknown> = {
      recipient: { id: recipientPsid },
      message: { text },
      messaging_type: messageTag ? 'MESSAGE_TAG' : 'RESPONSE',
    };
    if (messageTag) body.tag = messageTag;

    return this.sendRequest(pageId, pageAccessToken, body);
  }

  // ─── Media Messages ─────────────────────────────────────────────

  async sendMedia(options: MessengerSendMediaOptions): Promise<{ messageId: string; recipientId: string }> {
    const { pageId, pageAccessToken, recipientPsid, mediaType, url, isReusable = false } = options;

    const attachmentType = mediaType === 'file' ? 'file' : mediaType;

    return this.sendRequest(pageId, pageAccessToken, {
      recipient: { id: recipientPsid },
      message: {
        attachment: {
          type: attachmentType,
          payload: { url, is_reusable: isReusable },
        },
      },
      messaging_type: 'RESPONSE',
    });
  }

  // ─── Quick Replies ──────────────────────────────────────────────

  async sendQuickReplies(options: MessengerSendQuickRepliesOptions): Promise<{ messageId: string; recipientId: string }> {
    const { pageId, pageAccessToken, recipientPsid, text, quickReplies, messageTag } = options;

    const body: Record<string, unknown> = {
      recipient: { id: recipientPsid },
      message: {
        text,
        quick_replies: quickReplies.slice(0, 13).map((qr) => ({
          content_type: qr.content_type,
          title: qr.title?.substring(0, 20),
          payload: qr.payload?.substring(0, 1000),
          image_url: qr.image_url,
        })),
      },
      messaging_type: messageTag ? 'MESSAGE_TAG' : 'RESPONSE',
    };
    if (messageTag) body.tag = messageTag;

    return this.sendRequest(pageId, pageAccessToken, body);
  }

  // ─── Generic Template (Carousel) ───────────────────────────────

  async sendGenericTemplate(options: MessengerSendGenericTemplateOptions): Promise<{ messageId: string; recipientId: string }> {
    const { pageId, pageAccessToken, recipientPsid, elements, messageTag } = options;

    const body: Record<string, unknown> = {
      recipient: { id: recipientPsid },
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
      messaging_type: messageTag ? 'MESSAGE_TAG' : 'RESPONSE',
    };
    if (messageTag) body.tag = messageTag;

    return this.sendRequest(pageId, pageAccessToken, body);
  }

  // ─── Button Template ────────────────────────────────────────────

  async sendButtonTemplate(options: MessengerSendButtonTemplateOptions): Promise<{ messageId: string; recipientId: string }> {
    const { pageId, pageAccessToken, recipientPsid, text, buttons, messageTag } = options;

    const body: Record<string, unknown> = {
      recipient: { id: recipientPsid },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: text.substring(0, 640),
            buttons: buttons.slice(0, 3),
          },
        },
      },
      messaging_type: messageTag ? 'MESSAGE_TAG' : 'RESPONSE',
    };
    if (messageTag) body.tag = messageTag;

    return this.sendRequest(pageId, pageAccessToken, body);
  }

  // ─── Sender Actions ─────────────────────────────────────────────

  async senderAction(
    pageId: string,
    pageAccessToken: string,
    recipientPsid: string,
    action: MessengerSenderAction
  ): Promise<{ recipientId: string }> {
    const response = await fetch(`${this.baseUrl}/${pageId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        sender_action: action,
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { recipientId: data.recipient_id };
  }

  // ─── Welcome Screen: Get Started ───────────────────────────────

  async setGetStartedPayload(pageId: string, pageAccessToken: string, payload: string): Promise<{ result: string }> {
    const response = await fetch(`${this.baseUrl}/${pageId}/messenger_profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        get_started: { payload: payload.substring(0, 1000) },
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { result: data.result || 'success' };
  }

  // ─── Welcome Screen: Greeting ──────────────────────────────────

  async setGreeting(pageId: string, pageAccessToken: string, greetings: MessengerGreetingEntry[]): Promise<{ result: string }> {
    const response = await fetch(`${this.baseUrl}/${pageId}/messenger_profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        greeting: greetings.map((g) => ({
          locale: g.locale,
          text: g.text.substring(0, 160),
        })),
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { result: data.result || 'success' };
  }

  // ─── Persistent Menu ───────────────────────────────────────────

  async setPersistentMenu(
    pageId: string,
    pageAccessToken: string,
    menuItems: Array<{ type: 'postback' | 'web_url'; title: string; payload?: string; url?: string }>,
    locale = 'default',
    composerInputDisabled = false
  ): Promise<{ result: string }> {
    const response = await fetch(`${this.baseUrl}/${pageId}/messenger_profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale,
            composer_input_disabled: composerInputDisabled,
            call_to_actions: menuItems.slice(0, 5).map((item) => ({
              type: item.type,
              title: item.title.substring(0, 30),
              payload: item.payload,
              url: item.url,
            })),
          },
        ],
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { result: data.result || 'success' };
  }

  // ─── Private Replies (Comment → DM) ────────────────────────────

  async sendPrivateReply(options: MessengerPrivateReplyOptions): Promise<{ messageId: string; recipientId: string }> {
    const { pageAccessToken, commentId, message } = options;

    const response = await fetch(`${this.baseUrl}/${commentId}/private_replies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return {
      messageId: data.id || data.message_id || '',
      recipientId: data.recipient_id || '',
    };
  }

  // ─── NLP Config ────────────────────────────────────────────────

  async enableNlp(pageAccessToken: string, enabled = true, model?: string): Promise<{ success: boolean }> {
    const params = new URLSearchParams();
    params.set('nlp_enabled', String(enabled));
    if (model) params.set('model', model);
    // Custom model requires Wit.ai server token
    if (model) params.set('custom_token', model);

    const response = await fetch(`${this.baseUrl}/me/nlp_configs?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
      },
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { success: data.success === true };
  }

  // ─── Messaging Insights ────────────────────────────────────────

  async getMessagingInsights(
    pageId: string,
    pageAccessToken: string,
    metrics: string[],
    since?: number,
    until?: number
  ): Promise<Array<{ name: string; period: string; values: Array<{ value: number; end_time: string }> }>> {
    const params = new URLSearchParams();
    params.set('metric', metrics.join(','));
    if (since) params.set('since', String(since));
    if (until) params.set('until', String(until));

    const response = await fetch(`${this.baseUrl}/${pageId}/insights?${params.toString()}`, {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return data.data || [];
  }

  // ─── Conversations API ─────────────────────────────────────────

  async listConversations(
    pageId: string,
    pageAccessToken: string,
    platform?: 'messenger' | 'instagram' | 'whatsapp',
    folder?: 'inbox' | 'done' | 'spam' | 'page_done',
    limit = 25
  ): Promise<{ data: any[]; paging?: any }> {
    const params = new URLSearchParams();
    params.set('fields', 'id,updated_time,participants,message_count,unread_count,snippet');
    if (platform) params.set('platform', platform);
    if (folder) params.set('folder', folder);
    params.set('limit', String(limit));

    const response = await fetch(`${this.baseUrl}/${pageId}/conversations?${params.toString()}`, {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { data: data.data || [], paging: data.paging };
  }

  async getConversationMessages(
    conversationId: string,
    pageAccessToken: string,
    limit = 50
  ): Promise<{ data: any[]; paging?: any }> {
    const params = new URLSearchParams();
    params.set('fields', 'id,message,from,to,created_time,attachments,shares,sticker');
    params.set('limit', String(limit));

    const response = await fetch(`${this.baseUrl}/${conversationId}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw this.parseError(data.error, response.status);
    }
    return { data: data.data || [], paging: data.paging };
  }

  // ─── m.me Link Generation ──────────────────────────────────────

  generateMmeLink(pageName: string, ref?: string): string {
    const base = `https://m.me/${encodeURIComponent(pageName)}`;
    if (ref) return `${base}?ref=${encodeURIComponent(ref)}`;
    return base;
  }

  // ─── Internals ─────────────────────────────────────────────────

  private async sendRequest(
    pageId: string,
    pageAccessToken: string,
    body: Record<string, unknown>
  ): Promise<{ messageId: string; recipientId: string }> {
    const response = await fetch(`${this.baseUrl}/${pageId}/messages`, {
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
    const message = errorObj?.message || `Messenger API Error: HTTP ${httpStatus}`;

    switch (code) {
      case 10:
        return new Error(`[Messenger #10] Permissão negada: O app não tem a permissão pages_messaging aprovada.`);
      case 100:
        if (subcode === 2018109) {
          return new Error(`[Messenger #100.2018109] Janela de 24h expirada. Use uma Message Tag aprovada (HUMAN_AGENT, POST_PURCHASE_UPDATE, CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE).`);
        }
        return new Error(`[Messenger #100] Parâmetro inválido: ${message}`);
      case 190:
        return new Error(`[Messenger #190] Token de acesso expirado. Reconecte em Configurações > Embedded Signup.`);
      case 200:
        return new Error(`[Messenger #200] Permissão insuficiente: ${message}`);
      case 551:
        return new Error(`[Messenger #551] O usuário não é elegível para receber mensagens desta Page.`);
      case 613:
        return new Error(`[Messenger #613] Rate limit atingido. Aguarde antes de reenviar.`);
      case 1545041:
        return new Error(`[Messenger #1545041] Private Reply já foi enviada para este comentário (limite: 1 por comentário).`);
      default:
        return new Error(`[Messenger #${code || 'UNKNOWN'}] ${message}`);
    }
  }
}
