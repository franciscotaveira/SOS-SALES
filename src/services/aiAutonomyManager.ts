import { authenticatedFetch } from './authenticatedFetch';

export type GlobalAiAutonomyMode = 'copilot_supervised' | 'autonomous_24_7' | 'semi_autonomous';

export interface WorkspaceAgentRuntimeConfig {
  autonomyMode: GlobalAiAutonomyMode;
  runtimeEnabled: boolean;
  runtimeEffective: boolean;
  providerConfigured: boolean;
  behaviorConfig: Record<string, unknown>;
  publishedAt: string | null;
}

const safeDefault: WorkspaceAgentRuntimeConfig = {
  autonomyMode: 'copilot_supervised',
  runtimeEnabled: false,
  runtimeEffective: false,
  providerConfigured: false,
  behaviorConfig: {},
  publishedAt: null,
};

const runtimeCache = new Map<string, WorkspaceAgentRuntimeConfig>();

function emitRuntimeChanged(workspaceId: string, config: WorkspaceAgentRuntimeConfig) {
  window.dispatchEvent(new CustomEvent('sos_ai_mode_changed', {
    detail: { workspaceId, mode: config.autonomyMode, config },
  }));
}

function normalizeConfig(value: Partial<WorkspaceAgentRuntimeConfig>): WorkspaceAgentRuntimeConfig {
  const autonomyMode: GlobalAiAutonomyMode =
    value.autonomyMode === 'autonomous_24_7'
    || value.autonomyMode === 'semi_autonomous'
    || value.autonomyMode === 'copilot_supervised'
      ? value.autonomyMode
      : 'copilot_supervised';

  return {
    autonomyMode,
    runtimeEnabled: value.runtimeEnabled === true,
    runtimeEffective: value.runtimeEffective === true,
    providerConfigured: value.providerConfigured === true,
    behaviorConfig: value.behaviorConfig && typeof value.behaviorConfig === 'object'
      ? value.behaviorConfig
      : {},
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : null,
  };
}

/** Synchronous fail-closed snapshot used while the backend state loads. */
export function getWorkspaceAiMode(workspaceId: string): GlobalAiAutonomyMode {
  return runtimeCache.get(workspaceId)?.autonomyMode || 'copilot_supervised';
}

export function getCachedWorkspaceAgentConfig(workspaceId: string): WorkspaceAgentRuntimeConfig {
  return runtimeCache.get(workspaceId) || safeDefault;
}

export async function loadWorkspaceAgentConfig(workspaceId: string): Promise<WorkspaceAgentRuntimeConfig> {
  const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/agent/config`);
  if (!response.ok) {
    runtimeCache.set(workspaceId, safeDefault);
    emitRuntimeChanged(workspaceId, safeDefault);
    throw new Error(`Configuração da IA indisponível (HTTP ${response.status}).`);
  }

  const config = normalizeConfig(await response.json());
  runtimeCache.set(workspaceId, config);
  emitRuntimeChanged(workspaceId, config);
  return config;
}

export async function publishWorkspaceAgentConfig(
  workspaceId: string,
  update: {
    autonomyMode?: GlobalAiAutonomyMode;
    runtimeEnabled?: boolean;
    behaviorConfig?: Record<string, unknown>;
  },
): Promise<WorkspaceAgentRuntimeConfig> {
  const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/agent/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    let message = `Não foi possível publicar a configuração da IA (HTTP ${response.status}).`;
    try {
      const error = await response.json() as { error?: string };
      if (error.error) message = error.error;
    } catch {
      // Keep the sanitized HTTP error.
    }
    throw new Error(message);
  }

  const config = normalizeConfig(await response.json());
  runtimeCache.set(workspaceId, config);
  emitRuntimeChanged(workspaceId, config);
  return config;
}

export async function setWorkspaceAiMode(
  workspaceId: string,
  mode: GlobalAiAutonomyMode,
): Promise<WorkspaceAgentRuntimeConfig> {
  return publishWorkspaceAgentConfig(workspaceId, {
    autonomyMode: mode,
    runtimeEnabled: mode === 'autonomous_24_7',
  });
}
