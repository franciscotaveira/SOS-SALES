export { WahaWebhookAdapter } from './infrastructure/channels/waha/waha-webhook-adapter.js';
export { PostgresNotesGateway } from './infrastructure/database/postgres-notes-gateway.js';
export { PostgresWorkspaceProvisioningGateway } from './infrastructure/database/postgres-workspace-provisioning-gateway.js';
export { AbacatePayGateway } from './infrastructure/billing/abacatepay-gateway.js';
export type { CreateAbacateChargeInput, AbacateChargeOutput } from './infrastructure/billing/abacatepay-gateway.js';
export { OpenRouterEngine } from './infrastructure/ai/openrouter-engine.js';
export { NvidiaNimEngine } from './infrastructure/ai/nvidia-nim-engine.js';
import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
