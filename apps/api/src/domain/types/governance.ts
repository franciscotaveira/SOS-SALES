/**
 * GOVERNANCE, CAPABILITY REGISTRY & CONFIDENTIAL EXECUTION CONTRACTS
 * 
 * Alinhamento com arquitetura Meta Muse & Enterprise Multi-tenant Isolation:
 * - Nível 1: Storage Encryption (repouso)
 * - Nível 2: Tenant Isolation (isolamento lógico estrito por workspace)
 * - Nível 3: Confidential Execution (enclaves criptografados com chave sob controle do usuário)
 * 
 * Controles de Governança:
 * - DataGovernancePolicy: consentimento granular (treinamento, analytics, ads, retenção)
 * - CapabilityRevocationEngine: revogação real (credencial desativada, tarefas bloqueadas, tools desligadas, auditoria)
 */

export type ExecutionIsolationLevel = 'LOGICAL' | 'DEDICATED' | 'CONFIDENTIAL';

export type KeyOwner = 'PLATFORM' | 'TENANT' | 'USER_HELD';

export type EncryptionScope = 'REST' | 'TRANSIT' | 'RUNTIME_CONFIDENTIAL';

export interface AuditPolicy {
  logRetentionDays: number;
  auditTrailImmutable: boolean;
  sentinelVerification: boolean;
  humanApprovalRequired: boolean;
}

export interface ExecutionEnvironment {
  isolationLevel: ExecutionIsolationLevel;
  encryptionScope: EncryptionScope;
  keyOwner: KeyOwner;
  credentialVault: string;
  auditPolicy: AuditPolicy;
}

export interface DataGovernancePolicy {
  workspaceId: string;
  purpose: string;
  trainingAllowed: boolean;      // Opt-out explícito de uso para treinamento de LLM/Meta
  analyticsAllowed: boolean;     // Telemetria agregada interna permitida
  adsEnrichmentAllowed: boolean; // Dados e conversas isolados de sistemas de anúncios/ad-tech
  retentionDays: number;         // Janela de expiração e expurgo de dados
  externalToolAccess: boolean;   // Autorização para ferramentas e MCP externas
  revokedAt?: string | null;     // Timestamp de revogação de consentimento
}

export interface CapabilityRegistryItem {
  id: string;
  workspaceId: string;
  capabilityKey: string;         // e.g. 'google_calendar', 'shopify_orders', 'meta_business_agent'
  provider: string;
  status: 'ACTIVE' | 'REVOKED' | 'SUSPENDED';
  credentialVaultSecretId?: string;
  grantedAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface CapabilityRevocationCommand {
  workspaceId: string;
  capabilityKey: string;
  revokedBy: string;
  reason?: string;
}

export interface CapabilityRevocationResult {
  permissionRevoked: boolean;
  credentialDisabled: boolean;
  pendingTasksBlockedCount: number;
  toolUnavailable: boolean;
  agentContextUpdated: boolean;
  auditEventId: string;
  revokedAt: string;
}
