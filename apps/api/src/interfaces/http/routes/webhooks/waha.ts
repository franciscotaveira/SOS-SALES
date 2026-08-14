import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IngestWahaWebhookUseCase } from '../../../../application/usecases/ingest-waha-webhook.js';
import { WebhookSecretProvider } from '../../../../application/ports/webhook-secret-provider.js';
import { ChannelWebhookAdapter } from '../../../../application/ports/channel-webhook-adapter.js';
import { InboundIngestionGateway } from '../../../../application/ports/inbound-ingestion-gateway.js';

export interface WahaWebhookRouteOptions {
  secretProvider: WebhookSecretProvider;
  wahaAdapter: ChannelWebhookAdapter;
  ingestionGateway: InboundIngestionGateway;
}

export const wahaWebhookRoutes: FastifyPluginAsync<WahaWebhookRouteOptions> = async (
  app: FastifyInstance,
  options: WahaWebhookRouteOptions
) => {
  const useCase = new IngestWahaWebhookUseCase(
    options.secretProvider,
    options.wahaAdapter,
    options.ingestionGateway
  );

  app.post<{
    Params: { channelConnectionId: string };
  }>('/webhooks/waha/:channelConnectionId', async (request, reply) => {
    const { channelConnectionId } = request.params;

    // Retrieve raw body buffer attached by custom content-parser
    const rawBody = (request as unknown as { rawBody?: Buffer | string }).rawBody || request.body;

    // Strict official WAHA headers contract (no legacy fallbacks)
    const signatureHeader = request.headers['x-webhook-hmac'] as string | undefined;
    const algorithmHeader = request.headers['x-webhook-hmac-algorithm'] as string | undefined;
    const timestampHeader = request.headers['x-webhook-timestamp'] as string | undefined;
    const requestIdHeader = request.headers['x-webhook-request-id'] as string | undefined;

    try {
      const output = await useCase.execute({
        channelConnectionId,
        rawBody: typeof rawBody === 'string' || Buffer.isBuffer(rawBody) ? rawBody : JSON.stringify(rawBody),
        signatureHeader,
        algorithmHeader,
        timestampHeader,
        requestIdHeader,
      });

      return reply.code(202).send({
        status: output.status,
        eventId: output.inboundEventId,
        isDuplicate: output.isDuplicate,
      });
    } catch (err) {
      const errorObj = err as Error & { statusCode?: number };
      const statusCode = errorObj.statusCode || 500;

      if (statusCode >= 500) {
        request.log.error(
          { err, channelConnectionId, requestId: requestIdHeader },
          'Internal server error during webhook ingestion'
        );
        return reply.code(500).send({
          error: 'Internal server error during webhook ingestion',
        });
      }

      // For controlled 4xx operational errors (400, 401, 404), return the sanitized operational message
      return reply.code(statusCode).send({
        error: errorObj.message || 'Bad Request',
      });
    }
  });
};
