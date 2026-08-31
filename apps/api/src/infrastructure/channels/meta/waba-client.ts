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

export interface WabaCreateTemplateOptions {
  wabaId: string;
  accessToken: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language?: string;
  bodyText: string;
  headerText?: string;
  footerText?: string;
  buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phoneNumber?: string }>;
}

export interface WabaSendFlowOptions {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  flowId: string;
  flowToken?: string;
  flowCta: string;
  screenId?: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  flowData?: Record<string, unknown>;
}


export class WabaClient {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  /**
   * Normalizes a phone number for the Meta API.
   * Strips non-digits, then ensures the Brazil country code (55) is prepended
   * if the number looks like a local Brazilian number (10–11 digits without DDI).
   */
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    // Already has full international format (13+ digits starting with 55)
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    // Add Brazil DDI for 10 or 11 digit numbers
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    // Return as-is for other formats (international numbers)
    return digits;
  }

  /** Meta acceptance is not proven without its provider message identifier. */
  private requireMessageId(data: unknown, operation: string): string {
    const messageId = (data as { messages?: Array<{ id?: unknown }> })?.messages?.[0]?.id;
    if (typeof messageId !== 'string' || messageId.trim().length === 0) {
      throw new Error(`Meta WABA did not return a message ID for ${operation}`);
    }
    return messageId;
  }

  /** Calculate natural human typing delay in ms based on text length */
  public calculateHumanTypingDelay(text: string): number {
    if (!text) return 600;
    // ~20ms per character, clamped between 800ms and 2400ms
    return Math.min(Math.max(text.length * 20, 800), 2400);
  }

  /** Send standard text message with optional organic human delay */
  async sendText(options: WabaSendTextOptions & { simulateTyping?: boolean }): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, text, previewUrl = false, simulateTyping = false } = options;
    const cleanPhone = this.normalizePhone(recipientPhone);

    if (simulateTyping && text) {
      const delayMs = this.calculateHumanTypingDelay(text);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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
        type: 'text',
        text: { preview_url: previewUrl, body: text },
      }),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro Meta WABA: HTTP ${response.status}`);
    }
    return { messageId: this.requireMessageId(data, 'text') };
  }

  /** Send rich media (Image, Audio voice note, Document, Video) */
  async sendMedia(options: WabaSendMediaOptions): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, mediaType, mediaUrl, caption, filename } = options;
    const cleanPhone = this.normalizePhone(recipientPhone);

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
    return { messageId: this.requireMessageId(data, 'media') };
  }

  /** Send interactive quick reply buttons (up to 3 buttons) */
  async sendInteractiveButtons(options: WabaSendInteractiveButtonsOptions): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, headerText, bodyText, footerText, buttons } = options;
    const cleanPhone = this.normalizePhone(recipientPhone);

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
    return { messageId: this.requireMessageId(data, 'interactive buttons') };
  }

  /** Send interactive list message (menus & catalogs) */
  async sendInteractiveList(options: WabaSendInteractiveListOptions): Promise<{ messageId: string }> {
    const { phoneNumberId, accessToken, recipientPhone, headerText, bodyText, footerText, buttonLabel, sections } = options;
    const cleanPhone = this.normalizePhone(recipientPhone);

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
    return { messageId: this.requireMessageId(data, 'interactive list') };
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
    const cleanPhone = this.normalizePhone(recipientPhone);

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
    return { messageId: this.requireMessageId(data, 'template') };
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

  /** Create new Message Template directly in Meta Graph API */
  async createTemplate(options: WabaCreateTemplateOptions): Promise<{ id: string; status: string; category: string }> {
    const { wabaId, accessToken, name, category, language = 'pt_BR', bodyText, headerText, footerText, buttons } = options;

    const components: Array<Record<string, unknown>> = [];

    if (headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    }

    components.push({ type: 'BODY', text: bodyText });

    if (footerText) {
      components.push({ type: 'FOOTER', text: footerText });
    }

    if (buttons && buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map((b) => {
          if (b.type === 'URL') {
            return { type: 'URL', text: b.text, url: b.url };
          }
          if (b.type === 'PHONE_NUMBER') {
            return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
          }
          return { type: 'QUICK_REPLY', text: b.text };
        }),
      });
    }

    const payload = {
      name: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      category,
      allow_category_change: true,
      language,
      components,
    };

    const response = await fetch(`${this.baseUrl}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro ao submeter template para a Meta: HTTP ${response.status}`);
    }

    return {
      id: data.id,
      status: data.status || 'PENDING',
      category: data.category || category,
    };
  }

  /** Delete Message Template by Name from Meta */
  async deleteTemplate(wabaId: string, accessToken: string, templateName: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro ao deletar template na Meta: HTTP ${response.status}`);
    }
    return data.success === true;
  }

  /** Send WhatsApp Flow (Interactive In-App Forms & Flows) */
  async sendFlow(options: WabaSendFlowOptions): Promise<{ messageId: string }> {
    const {
      phoneNumberId,
      accessToken,
      recipientPhone,
      flowId,
      flowToken = crypto.randomUUID(),
      flowCta,
      screenId,
      headerText,
      bodyText,
      footerText,
      flowData,
    } = options;
    const cleanPhone = this.normalizePhone(recipientPhone);

    const interactivePayload: Record<string, unknown> = {
      type: 'flow',
      body: { text: bodyText },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: flowId,
          flow_cta: flowCta.substring(0, 20),
          flow_action: 'navigate',
          flow_action_payload: screenId ? { screen: screenId, data: flowData || {} } : undefined,
        },
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
      throw new Error(data.error?.message || `Erro Meta WABA Flow: HTTP ${response.status}`);
    }
    return { messageId: this.requireMessageId(data, 'flow') };
  }
}
