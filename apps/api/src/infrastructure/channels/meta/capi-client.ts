import { createHash } from 'node:crypto';
import {
  CapiDispatchGateway,
  CapiDispatchResult,
  CapiPurchaseEventPayload,
} from '../../../application/ports/capi-dispatch-gateway.js';

export interface CapiClientConfig {
  defaultAccessToken?: string;
  apiVersion?: string;
  baseUrl?: string;
  defaultTestEventCode?: string;
}

export function hashPii(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function hashPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digitsOnly = phone.replace(/\D/g, '');
  if (!digitsOnly) return undefined;
  return createHash('sha256').update(digitsOnly, 'utf8').digest('hex');
}

export class CapiClient implements CapiDispatchGateway {
  private readonly defaultAccessToken?: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly defaultTestEventCode?: string;

  constructor(config?: CapiClientConfig) {
    this.defaultAccessToken = config?.defaultAccessToken || process.env.META_CAPI_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
    this.apiVersion = config?.apiVersion || 'v20.0';
    this.baseUrl = config?.baseUrl || 'https://graph.facebook.com';
    this.defaultTestEventCode = config?.defaultTestEventCode || process.env.META_TEST_EVENT_CODE;
  }

  async sendPurchaseEvent(
    event: CapiPurchaseEventPayload,
    accessToken?: string,
  ): Promise<CapiDispatchResult> {
    const token = accessToken || this.defaultAccessToken;
    if (!token) {
      return {
        success: false,
        kind: 'FATAL',
        errorCode: 'MISSING_ACCESS_TOKEN',
        errorMessage: 'Meta CAPI Access Token is missing',
      };
    }

    if (!event.pixelId) {
      return {
        success: false,
        kind: 'FATAL',
        errorCode: 'MISSING_PIXEL_ID',
        errorMessage: 'Meta Pixel ID is required for Conversions API dispatch',
      };
    }

    const cleanPixelId = event.pixelId.trim();
    const endpoint = `${this.baseUrl}/${this.apiVersion}/${cleanPixelId}/events`;

    const eventTime = event.occurredAt
      ? Math.floor(new Date(event.occurredAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const hashedPhone = hashPhone(event.phone);
    const hashedEmail = hashPii(event.email);

    const userData: Record<string, unknown> = {};
    if (hashedPhone) userData.ph = [hashedPhone];
    if (hashedEmail) userData.em = [hashedEmail];

    const valueFloat = Math.round(event.revenueMinor) / 100;

    const eventData: Record<string, unknown> = {
      event_name: 'Purchase',
      event_time: eventTime,
      event_id: event.outcomeId, // Primary deduplication key across Pixel & CAPI
      action_source: 'system_generated',
      user_data: userData,
      custom_data: {
        currency: event.currency || 'BRL',
        value: valueFloat,
      },
    };

    const payload: Record<string, unknown> = {
      data: [eventData],
    };

    const testCode = event.testEventCode || this.defaultTestEventCode;
    if (testCode) {
      payload.test_event_code = testCode;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (response.ok) {
        return {
          success: true,
          capiEventId: event.outcomeId,
          fbtraceId: typeof body.fbtrace_id === 'string' ? body.fbtrace_id : undefined,
          rawResponse: body,
        };
      }

      const status = response.status;
      const errorObj = (body.error as Record<string, unknown>) || {};
      const errorMessage = typeof errorObj.message === 'string' ? errorObj.message : `HTTP ${status}`;
      const errorCode = typeof errorObj.code === 'number' ? `META_${errorObj.code}` : `HTTP_${status}`;

      if (status >= 400 && status < 500) {
        return {
          success: false,
          kind: 'FATAL',
          errorCode,
          errorMessage,
        };
      }

      return {
        success: false,
        kind: 'RETRYABLE',
        errorCode,
        errorMessage,
      };
    } catch (error) {
      return {
        success: false,
        kind: 'RETRYABLE',
        errorCode: 'NETWORK_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
