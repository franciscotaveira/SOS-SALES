export { WahaWebhookAdapter } from './infrastructure/channels/waha/waha-webhook-adapter.js';
export { WahaLidIdentityResolver } from './infrastructure/channels/waha/waha-lid-identity-resolver.js';
export { PostgresNotesGateway } from './infrastructure/database/postgres-notes-gateway.js';
export { PostgresWorkspaceProvisioningGateway } from './infrastructure/database/postgres-workspace-provisioning-gateway.js';
export { PostgresWabaChannelInfoGateway } from './infrastructure/database/postgres-waba-channel-info-gateway.js';
export { PostgresWorkspaceDirectory } from './infrastructure/database/postgres-workspace-directory.js';
export { PostgresCockpitReadGateway } from './infrastructure/database/postgres-cockpit-read-gateway.js';
export { PostgresHandoffOperationsGateway } from './infrastructure/database/postgres-handoff-operations-gateway.js';
export { PostgresJourneyOperationsGateway } from './infrastructure/database/postgres-journey-operations-gateway.js';
export { PostgresCommercialOutcomeGateway } from './infrastructure/database/postgres-commercial-outcome-gateway.js';
export { PostgresOutboundDispatchGateway } from './infrastructure/database/postgres-outbound-dispatch-gateway.js';
export { PostgresTrafficProofGateway } from './infrastructure/database/postgres-traffic-proof-gateway.js';
export { PostgresKnownFactOperationsGateway } from './infrastructure/database/postgres-known-fact-operations-gateway.js';
export { PostgresAppointmentGateway } from './infrastructure/database/postgres-appointment-gateway.js';
export { PostgresInboundIngestionGateway } from './infrastructure/database/postgres-inbound-ingestion-gateway.js';
export { PostgresOutboxProcessingGateway } from './infrastructure/database/postgres-outbox-processing-gateway.js';
export { SupabaseJwtAuthenticator } from './infrastructure/security/supabase-jwt-authenticator.js';
export { EnvironmentWebhookSecretProvider } from './infrastructure/security/environment-webhook-secret-provider.js';
export { PostgresDependencyHealthProvider } from './infrastructure/database/postgres-dependency-health-provider.js';
export { RedisDependencyHealthProvider } from './infrastructure/health/redis-dependency-health-provider.js';
export { WabaClient } from './infrastructure/channels/meta/waba-client.js';
export { InstagramDmClient } from './infrastructure/channels/meta/instagram-dm-client.js';
export { MessengerClient } from './infrastructure/channels/meta/messenger-client.js';
export { ConversationsApiClient } from './infrastructure/channels/meta/conversations-api-client.js';
export { AbacatePayGateway } from './infrastructure/billing/abacatepay-gateway.js';
export type { CreateAbacateChargeInput, AbacateChargeOutput } from './infrastructure/billing/abacatepay-gateway.js';
export { OpenRouterEngine } from './infrastructure/ai/openrouter-engine.js';
export { NvidiaNimEngine } from './infrastructure/ai/nvidia-nim-engine.js';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';
export { startServer };

const isDirectExecution = () => {
  if (process.env.NO_AUTO_START === 'true') return false;
  if (!process.argv || !process.argv[1]) return true;
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    return process.argv[1] === currentFilePath || process.argv[1].endsWith('apps/api/dist/index.js') || process.argv[1].endsWith('apps/api/src/index.ts');
  } catch {
    return true;
  }
};

if (isDirectExecution()) {
  startServer().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}
