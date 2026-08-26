/**
 * TX COMMERCIAL CORE — WAHA OUTBOUND ADAPTER
 *
 * HTTP Client adapter for sending outbound messages through WAHA API.
 * Uses strict timeouts, payload normalization, and classifies response errors
 * into RETRYABLE (5xx / network errors), FATAL (4xx client/business errors),
 * and AMBIGUOUS (network timeouts where dispatch state is indeterminate).
 */

export interface WahaOutboundConfig {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface WahaSendTextRequest {
  session?: string;
  chatId: string;
  text: string;
}

export interface WahaSendTextResponse {
  id: string;
  timestamp?: number;
  status?: string;
}

export type WahaOutboundResult =
  | { success: true; providerMessageId: string; rawResponse: unknown }
  | { success: false; kind: 'FATAL'; failureCode: string; message: string }
  | { success: false; kind: 'RETRYABLE'; failureCode: string; message: string }
  | { success: false; kind: 'AMBIGUOUS'; failureCode: string; message: string };

export class WahaOutboundAdapter {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config: WahaOutboundConfig) {
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  /**
   * Sends a text message to WAHA API endpoint /api/sendText.
   */
  async sendText(request: WahaSendTextRequest): Promise<WahaOutboundResult> {
    const cleanChatId = request.chatId.trim();
    const cleanText = request.text.trim();

    if (!cleanChatId || !cleanText) {
      return {
        success: false,
        kind: 'FATAL',
        failureCode: 'INVALID_PAYLOAD',
        message: 'chatId and text are required',
      };
    }

    const url = `${this.endpoint}/api/sendText`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    const payload: Record<string, unknown> = {
      chatId: cleanChatId,
      text: cleanText,
    };

    if (request.session) {
      payload.session = request.session;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const providerMessageId =
          typeof data.id === 'string'
            ? data.id
            : typeof (data.message as Record<string, unknown>)?.id === 'string'
            ? ((data.message as Record<string, unknown>).id as string)
            : `waha-${Date.now()}`;

        return {
          success: true,
          providerMessageId,
          rawResponse: data,
        };
      }

      const status = response.status;
      const errorBody = await response.text().catch(() => '');

      if (status >= 400 && status < 500) {
        return {
          success: false,
          kind: 'FATAL',
          failureCode: `WAHA_HTTP_${status}`,
          message: errorBody || `WAHA returned client error HTTP ${status}`,
        };
      }

      return {
        success: false,
        kind: 'RETRYABLE',
        failureCode: `WAHA_HTTP_${status}`,
        message: errorBody || `WAHA returned server error HTTP ${status}`,
      };
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          kind: 'AMBIGUOUS',
          failureCode: 'WAHA_TIMEOUT',
          message: `Request timed out after ${this.timeoutMs}ms without confirmation`,
        };
      }

      return {
        success: false,
        kind: 'RETRYABLE',
        failureCode: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown network failure',
      };
    }
  }

  /**
   * Sends an image message to WAHA API endpoint /api/sendImage.
   */
  async sendImage(request: {
    chatId: string;
    file: { url?: string; data?: string; mimetype?: string; filename?: string };
    caption?: string;
    session?: string;
  }): Promise<WahaOutboundResult> {
    const cleanChatId = request.chatId.trim();
    if (!cleanChatId || (!request.file.url && !request.file.data)) {
      return {
        success: false,
        kind: 'FATAL',
        failureCode: 'INVALID_PAYLOAD',
        message: 'chatId and file url/data are required',
      };
    }

    const url = `${this.endpoint}/api/sendImage`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    const payload: Record<string, unknown> = {
      chatId: cleanChatId,
      file: {
        mimetype: request.file.mimetype || 'image/jpeg',
        filename: request.file.filename || 'image.jpg',
        url: request.file.url || request.file.data,
      },
      caption: request.caption || '',
      session: request.session || 'default',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const providerMessageId =
          typeof data.id === 'string'
            ? data.id
            : typeof (data.message as Record<string, unknown>)?.id === 'string'
            ? ((data.message as Record<string, unknown>).id as string)
            : `waha-${Date.now()}`;

        return {
          success: true,
          providerMessageId,
          rawResponse: data,
        };
      }

      const status = response.status;
      const errorBody = await response.text().catch(() => '');

      return {
        success: false,
        kind: status >= 400 && status < 500 ? 'FATAL' : 'RETRYABLE',
        failureCode: `WAHA_HTTP_${status}`,
        message: errorBody || `WAHA returned HTTP ${status}`,
      };
    } catch (error) {
      clearTimeout(timer);
      return {
        success: false,
        kind: error instanceof Error && error.name === 'AbortError' ? 'AMBIGUOUS' : 'RETRYABLE',
        failureCode: error instanceof Error && error.name === 'AbortError' ? 'WAHA_TIMEOUT' : 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown network failure',
      };
    }
  }

  /**
   * Sends a generic file/document message to WAHA API endpoint /api/sendFile.
   */
  async sendFile(request: {
    chatId: string;
    file: { url?: string; data?: string; mimetype?: string; filename?: string };
    caption?: string;
    session?: string;
  }): Promise<WahaOutboundResult> {
    const cleanChatId = request.chatId.trim();
    if (!cleanChatId || (!request.file.url && !request.file.data)) {
      return {
        success: false,
        kind: 'FATAL',
        failureCode: 'INVALID_PAYLOAD',
        message: 'chatId and file url/data are required',
      };
    }

    const url = `${this.endpoint}/api/sendFile`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    const payload: Record<string, unknown> = {
      chatId: cleanChatId,
      file: {
        mimetype: request.file.mimetype || 'application/octet-stream',
        filename: request.file.filename || 'file.bin',
        url: request.file.url || request.file.data,
      },
      caption: request.caption || '',
      session: request.session || 'default',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const providerMessageId =
          typeof data.id === 'string'
            ? data.id
            : typeof (data.message as Record<string, unknown>)?.id === 'string'
            ? ((data.message as Record<string, unknown>).id as string)
            : `waha-${Date.now()}`;

        return {
          success: true,
          providerMessageId,
          rawResponse: data,
        };
      }

      const status = response.status;
      const errorBody = await response.text().catch(() => '');

      return {
        success: false,
        kind: status >= 400 && status < 500 ? 'FATAL' : 'RETRYABLE',
        failureCode: `WAHA_HTTP_${status}`,
        message: errorBody || `WAHA returned HTTP ${status}`,
      };
    } catch (error) {
      clearTimeout(timer);
      return {
        success: false,
        kind: error instanceof Error && error.name === 'AbortError' ? 'AMBIGUOUS' : 'RETRYABLE',
        failureCode: error instanceof Error && error.name === 'AbortError' ? 'WAHA_TIMEOUT' : 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown network failure',
      };
    }
  }
}
