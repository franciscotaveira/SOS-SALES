import type {
  CapabilityRegistryItem,
  CapabilityRevocationCommand,
  CapabilityRevocationResult,
  DataGovernancePolicy,
  ExecutionEnvironment,
} from '../../domain/types/governance.js';

export interface CapabilityRevocationGateway {
  /**
   * Executa a revogação efetiva de capability:
   * permission revoked -> credential disabled -> pending tasks blocked -> tool unavailable -> agent context updated -> audit event generated
   */
  revokeCapability(command: CapabilityRevocationCommand): Promise<CapabilityRevocationResult>;

  /**
   * Lista as capabilities ativas e seu estado de autorização para o workspace
   */
  listCapabilities(workspaceId: string): Promise<CapabilityRegistryItem[]>;

  /**
   * Obtém a política de governança de dados e consentimento do workspace
   */
  getDataGovernancePolicy(workspaceId: string): Promise<DataGovernancePolicy | null>;

  /**
   * Registra ou atualiza a política de governança de dados
   */
  upsertDataGovernancePolicy(policy: DataGovernancePolicy): Promise<DataGovernancePolicy>;

  /**
   * Retorna o perfil de ambiente de isolamento (ExecutionEnvironment) do tenant
   */
  resolveExecutionEnvironment(workspaceId: string): Promise<ExecutionEnvironment>;
}
