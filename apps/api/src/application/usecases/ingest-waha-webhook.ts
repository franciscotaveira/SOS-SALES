import { ChannelWebhookAdapter } from '../ports/channel-webhook-adapter.js';
import { WebhookSecretProvider } from '../ports/webhook-secret-provider.js';
import { InboundIngestionGateway } from '../ports/inbound-ingestion-gateway.js';
import { IdempotencyGate } from '../../infrastructure/cache/idempotency-gate.js';

export interface IngestWahaWebhookInput {
  channelConnectionId: string;
  rawBody: Buffer | string;
  signatureHeader?: string;
  algorithmHeader?: string;
  timestampHeader?: string;
  requestIdHeader?: string;
}

export interface IngestWahaWebhookOutput {
  status: 'ACCEPTED';
  inboundEventId: string;
  workspaceId: string;
  isDuplicate: boolean;
}

export class IngestWahaWebhookUseCase {
  private readonly idempotencyGate: IdempotencyGate;

  constructor(
    private readonly secretProvider: WebhookSecretProvider,
    private readonly adapter: ChannelWebhookAdapter,
    private readonly ingestionGateway: InboundIngestionGateway,
    idempotencyGate?: IdempotencyGate
  ) {
    this.idempotencyGate = idempotencyGate || IdempotencyGate.getInstance();
  }

  public async execute(input: IngestWahaWebhookInput): Promise<IngestWahaWebhookOutput> {
    const {
      channelConnectionId,
      rawBody,
      signatureHeader,
      algorithmHeader,
      timestampHeader,
      requestIdHeader,
    } = input;

    // 1. Resolve channel connection secret
    const secret = await this.secretProvider.getWebhookSecret(channelConnectionId);
    if (!secret) {
      const error = new Error(`Channel connection ${channelConnectionId} secret not found`);
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    // 2. Verify HMAC signature, algorithm and mandatory timestamp freshness
    const verification = this.adapter.verifySignature({
      rawBody,
      signatureHeader,
      algorithmHeader,
      timestampHeader,
      secret,
    });

    if (!verification.valid) {
      const error = new Error(`Unauthorized webhook signature: ${verification.error || 'Invalid signature'}`);
      (error as Error & { statusCode: number }).statusCode = 401;
      throw error;
    }

    // 3. Extract stable provider event ID and metadata
    const event = this.adapter.extractEvent(rawBody);

    // Fast-path Idempotency Check: if providerEventId has already been seen in the current TTL window
    if (event.providerEventId) {
      const isMemoryDuplicate = await this.idempotencyGate.isDuplicate(
        `waha:event:${channelConnectionId}:${event.providerEventId}`,
        120
      );
      if (isMemoryDuplicate) {
        return {
          status: 'ACCEPTED',
          inboundEventId: `dedup_${event.providerEventId}`,
          workspaceId: '',
          isDuplicate: true,
        };
      }
    }

    // If x-webhook-request-id was supplied in the request headers, preserve it inside rawPayload for tracing
    const payloadToPersist = { ...event.rawPayload };
    if (requestIdHeader && !payloadToPersist._requestId) {
      payloadToPersist._requestId = requestIdHeader;
    }

    // 4. Persist raw envelope via InboundIngestionGateway port
    const result = await this.ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      rawPayload: payloadToPersist,
    });

    // 5. Return immediate 202 Accepted response (zero synchronous normalization)
    return {
      status: 'ACCEPTED',
      inboundEventId: result.inboundEventId,
      workspaceId: result.workspaceId,
      isDuplicate: result.isDuplicate,
    };
  }
}
