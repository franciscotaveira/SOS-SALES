export type GlobalAiAutonomyMode = 'copilot_supervised' | 'autonomous_24_7' | 'semi_autonomous';

const STORAGE_PREFIX = 'sos_ai_autonomy_mode_';

/**
 * Gets the single source of truth autonomy mode for a workspace.
 * Default is 'copilot_supervised' (Safe Learning Mode) for safety.
 */
export function getWorkspaceAiMode(workspaceId: string): GlobalAiAutonomyMode {
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + workspaceId);
    if (saved === 'autonomous_24_7' || saved === 'copilot_supervised' || saved === 'semi_autonomous') {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'copilot_supervised';
}

/**
 * Sets the single source of truth autonomy mode for a workspace
 * and notifies all components across the app in real time.
 */
export function setWorkspaceAiMode(workspaceId: string, mode: GlobalAiAutonomyMode): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + workspaceId, mode);
  } catch {
    // ignore
  }

  // Dispatch global broadcast event for immediate reactive synchronization
  window.dispatchEvent(
    new CustomEvent('sos_ai_mode_changed', {
      detail: { workspaceId, mode },
    })
  );
}
