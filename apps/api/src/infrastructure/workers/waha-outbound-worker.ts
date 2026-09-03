import { randomUUID } from 'node:crypto';
import { ClaimedOutboundDispatch, OutboundDispatchGateway } from '../../application/ports/outbound-dispatch-gateway.js';
import { WahaOutboundAdapter, WahaOutboundResult } from '../channels/waha/waha-outbound-adapter.js';
import { WabaClient } from '../channels/meta/waba-client.js';

export interface WahaOutboundWorkerOptions {
  dispatchGateway: OutboundDispatchGateway;
  outboundAdapter: WahaOutboundAdapter;
  wabaClient?: WabaClient;
  pollingIntervalMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  workerId?: string;
}

/**
 * TX COMMERCIAL CORE — WAHA OUTBOUND WORKER
 *
 * Background worker responsible for processing approved outbound drafts:
 * 1. Claims approved dispatches with fencing tokens.
 * 2. Formats WhatsApp chatId (E.164 -> chatId@c.us).
 * 3. Sends message payload to WAHA HTTP API.
 * 4. Records provider acceptance (ACCEPTED) or failure (FAILED) atomically.
 * 5. Handles ambiguous timeouts strictly (never blindly retries timed-out requests).
 */
export class WahaOutboundWorker {
  private readonly dispatchGateway: OutboundDispatchGateway;
  private readonly outboundAdapter: WahaOutboundAdapter;
  private readonly wabaClient: WabaClient;
  private readonly pollingIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly workerId: string;

  private isRunning = false;
  private isProcessing = false;
  private lastPollingError: Error | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: WahaOutboundWorkerOptions) {
    if (!options.dispatchGateway) {
      throw new Error('WahaOutboundWorker requires an OutboundDispatchGateway instance');
    }
    if (!options.outboundAdapter) {
      throw new Error('WahaOutboundWorker requires a WahaOutboundAdapter instance');
    }

    this.dispatchGateway = options.dispatchGateway;
    this.outboundAdapter = options.outboundAdapter;
    this.wabaClient = options.wabaClient ?? new WabaClient();
    this.pollingIntervalMs = options.pollingIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 10;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    this.workerId = options.workerId ?? `waha-outbound-worker-${randomUUID()}`;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastPollingError = null;
    this.scheduleNextTick(0);
  }

  public isHealthy(): boolean {
    return this.isRunning && this.lastPollingError === null;
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  public async processSingleBatch(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const claimable = await this.dispatchGateway.listClaimableDispatches({
        limit: this.batchSize,
      });

      if (!claimable || claimable.length === 0) {
        this.lastPollingError = null;
        return 0;
      }

      let processedCount = 0;

      for (const item of claimable) {
        const claimed = await this.dispatchGateway.claimDispatch({
          dispatchId: item.dispatchId,
          workerId: this.workerId,
          leaseSeconds: this.leaseSeconds,
        });

        if (!claimed) {
          continue;
        }

        // Format chatId: e.g. +5511999998888 -> 5511999998888@c.us
        const rawPhone = claimed.contactPhone || '';
        const cleanPhone = rawPhone.replace(/\D/g, '');
        const chatId = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@c.us`;
        let sendResult: WahaOutboundResult;
        const text = claimed.textContent || '';
        const containsInlineMedia = text.includes(':::data:') || text.startsWith('data:image/') || text.startsWith('data:application/') || text.startsWith('data:audio/');

        if (claimed.provider === 'meta_cloud') {
          if (containsInlineMedia) {
            sendResult = { success: false, kind: 'FATAL', failureCode: 'WABA_INLINE_MEDIA_UNSUPPORTED', message: 'Meta Cloud does not accept inline media payloads' };
          } else if (!claimed.wabaPhoneNumberId || !claimed.wabaAccessToken || !claimed.contactPhone) {
            sendResult = { success: false, kind: 'FATAL', failureCode: 'WABA_CHANNEL_NOT_CONFIGURED', message: 'Meta Cloud channel credentials are incomplete' };
          } else {
            try {
              const wabaResult = await this.sendMetaDispatch(claimed);
              sendResult = wabaResult.messageId
                ? { success: true, providerMessageId: wabaResult.messageId, rawResponse: wabaResult }
                : { success: false, kind: 'AMBIGUOUS', failureCode: 'WABA_PROVIDER_ID_MISSING', message: 'Meta accepted the request without a provider message id' };
            } catch {
              // The provider may have accepted a timed-out request. Mark it for
              // human reconciliation and never replay the irreversible call.
              sendResult = { success: false, kind: 'AMBIGUOUS', failureCode: 'WABA_DELIVERY_UNCONFIRMED', message: 'Meta delivery result is ambiguous; manual reconciliation is required' };
            }
          }
        // Check if text is a media attachment (base64 data URL)
        } else if (containsInlineMedia) {

          const parts = text.split(':::');
          const dataUrl = parts.length > 1 ? parts[1] : parts[0];
          const caption = parts.length > 1 ? parts[0].replace(/^\[(Foto|Imagem|Vídeo|Áudio|Documento)\]\s*/i, '') : '';
          const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
          const mimetype = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const isImg = mimetype.startsWith('image/');

          if (isImg) {
            sendResult = await this.outboundAdapter.sendImage({
              chatId,
              file: {
                data: dataUrl,
                mimetype,
                filename: 'imagem_whatsapp.jpg',
              },
              caption,
              session: claimed.session,
            });
          } else {
            sendResult = await this.outboundAdapter.sendFile({
              chatId,
              file: {
                data: dataUrl,
                mimetype,
                filename: 'documento_whatsapp',
              },
              caption,
              session: claimed.session,
            });
          }
        } else {
          sendResult = await this.outboundAdapter.sendText({
            chatId,
            text: claimed.textContent,
            session: claimed.session,
          });
        }

        if (sendResult.success) {
          await this.dispatchGateway.recordProviderAcceptance({
            dispatchId: claimed.dispatchId,
            claimToken: claimed.claimToken,
            workerId: this.workerId,
            providerMessageId: sendResult.providerMessageId || '',
          });
        } else {
          const failure = {
            dispatchId: claimed.dispatchId,
            claimToken: claimed.claimToken,
            workerId: this.workerId,
            failureCode: sendResult.failureCode || 'PROVIDER_FAILURE',
          };
          if (sendResult.kind === 'RETRYABLE') {
            await this.dispatchGateway.recordProviderFailure({ ...failure, retryable: true });
          } else {
            // Fatal and ambiguous outcomes remain terminal. An ambiguous HTTP
            // call may already have reached the provider and must never be
            // replayed automatically.
            await this.dispatchGateway.recordProviderFailure(failure);
          }
        }

        processedCount++;
      }

      this.lastPollingError = null;
      return processedCount;
    } catch (error) {
      this.lastPollingError = error instanceof Error ? error : new Error(String(error));
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendMetaDispatch(claimed: ClaimedOutboundDispatch): Promise<{ messageId: string }> {
    const common = {
      phoneNumberId: claimed.wabaPhoneNumberId!,
      accessToken: claimed.wabaAccessToken!,
      recipientPhone: claimed.contactPhone!,
    };
    const payload = claimed.messagePayload || {};
    switch (claimed.messageKind || 'TEXT') {
      case 'TEXT': return this.wabaClient.sendText({ ...common, text: claimed.textContent });
      case 'WABA_TEMPLATE': return this.wabaClient.sendTemplate({ ...common, templateName: String(payload.templateName), languageCode: String(payload.languageCode || 'pt_BR'), headerMediaUrl: typeof payload.headerMediaUrl === 'string' ? payload.headerMediaUrl : undefined, bodyParameters: Array.isArray(payload.bodyParameters) ? payload.bodyParameters.map(String) : [] });
      case 'WABA_BUTTONS': return this.wabaClient.sendInteractiveButtons({ ...common, bodyText: String(payload.bodyText), headerText: typeof payload.headerText === 'string' ? payload.headerText : undefined, footerText: typeof payload.footerText === 'string' ? payload.footerText : undefined, buttons: Array.isArray(payload.buttons) ? payload.buttons.map((item: any) => ({ id: String(item.id), title: String(item.title) })) : [] });
      case 'WABA_LIST': return this.wabaClient.sendInteractiveList({ ...common, bodyText: String(payload.bodyText), buttonLabel: String(payload.buttonLabel), headerText: typeof payload.headerText === 'string' ? payload.headerText : undefined, footerText: typeof payload.footerText === 'string' ? payload.footerText : undefined, sections: Array.isArray(payload.sections) ? payload.sections as any : [] });
      case 'WABA_FLOW': return this.wabaClient.sendFlow({ ...common, flowId: String(payload.flowId), flowCta: String(payload.flowCta), bodyText: String(payload.bodyText), headerText: typeof payload.headerText === 'string' ? payload.headerText : undefined, footerText: typeof payload.footerText === 'string' ? payload.footerText : undefined, screenId: typeof payload.screenId === 'string' ? payload.screenId : undefined, flowData: payload.flowData as Record<string, unknown> | undefined });
      case 'WABA_MEDIA': return this.wabaClient.sendMedia({ ...common, mediaType: payload.mediaType as 'image' | 'audio' | 'video' | 'document', mediaUrl: String(payload.mediaUrl), caption: typeof payload.caption === 'string' ? payload.caption : undefined, filename: typeof payload.filename === 'string' ? payload.filename : undefined });
    }
    throw new Error('Unsupported WABA outbound message kind');
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;
      await this.processSingleBatch().catch(() => undefined);
      this.scheduleNextTick(this.pollingIntervalMs);
    }, delayMs);
  }
}
