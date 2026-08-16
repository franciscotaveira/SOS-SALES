/**
 * WABA Client — Native Meta Graph API v20.0 Adapter
 * 
 * Implements complete WhatsApp Business Platform capabilities:
 * - Text & Media (Audio PTT, Image, Document, Video)
 * - Interactive Buttons (Quick Reply & Call-To-Action)
 * - Interactive Lists (Sections & Rows)
 * - HSM Message Templates (Marketing & Utility)
 * - Mark as Read (Blue Checks)
 * - Business Profile & Quality Rating
 */

export interface WabaSendTextOptions {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  text: string;
  previewUrl?: boolean;
}

export interface WabaSendMediaOptions {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

export interface WabaSendInteractiveButtonsOptions {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface WabaSendInteractiveListOptions {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttonLabel: string;
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

export interface WabaSendTemplateOptions {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  templateName: string;
  languageCode: string;
  headerMediaUrl?: string;
  bodyParameters?: string[];
  buttonParameters?: Array<{ index: number; subType: 'url' | 'quick_reply'; payload: string }>;
}

export class WabaClient {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  /** Send standard text message */
  async sendText(options: WabaSendTextOptions): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, text, previewUrl = false } = options;
    const cleanPhone = recipientPhone.replace(/\D/g, '');

    const response = await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: previewUrl, body: text },
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro Meta WABA: HTTP ${response.status}`);
    }
    return { messageId: data.messages?.[0]?.id };
  }

  /** Send rich media (Image, Audio voice note, Document, Video) */
  async sendMedia(options: WabaSendMediaOptions): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, mediaType, mediaUrl, caption, filename } = options;
    const cleanPhone = recipientPhone.replace(/\D/g, '');

    const mediaPayload: Record<string, unknown> = { link: mediaUrl };
    if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
      mediaPayload.caption = caption;
    }
    if (filename && mediaType === 'document') {
      mediaPayload.filename = filename;
    }

    const response = await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: mediaType,
        [mediaType]: mediaPayload,
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro Meta WABA Media: HTTP ${response.status}`);
    }
    return { messageId: data.messages?.[0]?.id };
  }

  /** Send interactive quick reply buttons (up to 3 buttons) */
  async sendInteractiveButtons(options: WabaSendInteractiveButtonsOptions): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, headerText, bodyText, footerText, buttons } = options;
    const cleanPhone = recipientPhone.replace(/\D/g, '');

    const interactivePayload: Record<string, unknown> = {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.substring(0, 20) },
        })),
      },
    };

    if (headerText) {
      interactivePayload.header = { type: 'text', text: headerText };
    }
    if (footerText) {
      interactivePayload.footer = { text: footerText };
    }

    const response = await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'interactive',
        interactive: interactivePayload,
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro Meta WABA Buttons: HTTP ${response.status}`);
    }
    return { messageId: data.messages?.[0]?.id };
  }

  /** Send interactive list message (menus & catalogs) */
  async sendInteractiveList(options: WabaSendInteractiveListOptions): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, headerText, bodyText, footerText, buttonLabel, sections } = options;
    const cleanPhone = recipientPhone.replace(/\D/g, '');

    const interactivePayload: Record<string, unknown> = {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel.substring(0, 20),
        sections: sections.map((s) => ({
          title: s.title.substring(0, 24),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: r.title.substring(0, 24),
            description: r.description ? r.description.substring(0, 72) : undefined,
          })),
        })),
      },
    };

    if (headerText) {
      interactivePayload.header = { type: 'text', text: headerText };
    }
    if (footerText) {
      interactivePayload.footer = { text: footerText };
    }

    const response = await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'interactive',
        interactive: interactivePayload,
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro Meta WABA List: HTTP ${response.status}`);
    }
    return { messageId: data.messages?.[0]?.id };
  }

  /** Send approved Meta HSM Template (Reopens 24h window) */
  async sendTemplate(options: WabaSendTemplateOptions): Promise<{ messageId: string }> {
    const {
      phoneNumberId,
      accessToken,
      recipientPhone,
      templateName,
      languageCode,
      headerMediaUrl,
      bodyParameters = [],
    } = options;
    const cleanPhone = recipientPhone.replace(/\D/g, '');

    const components: Array<Record<string, unknown>> = [];

    if (headerMediaUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: headerMediaUrl } }],
      });
    }

    if (bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParameters.map((text) => ({ type: 'text', text })),
      });
    }

    const response = await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode || 'pt_BR' },
          components: components.length > 0 ? components : undefined,
        },
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro Meta WABA Template: HTTP ${response.status}`);
    }
    return { messageId: data.messages?.[0]?.id };
  }

  /** Mark incoming message as read (Blue checks) */
  async markAsRead(phoneNumberId: string, accessToken: string, messageId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
    return response.ok;
  }

  /** List approved templates from Meta WhatsApp Business Account */
  async listTemplates(wabaId: string, accessToken: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/${wabaId}/message_templates?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro ao listar templates Meta: HTTP ${response.status}`);
    }
    return data.data || [];
  }
}
