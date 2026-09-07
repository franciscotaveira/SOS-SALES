import { useCallback, useRef } from 'react';

interface UseConversationDraftsOptions {
  userId?: string;
  workspaceId: string;
}

const memoryDrafts = new Map<string, string>();

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      return window.sessionStorage;
    }
  } catch {
    // Acesso bloqueado por restrições de sandbox
  }
  return null;
}

function buildDraftKey(userId: string | undefined, workspaceId: string, journeyId: string): string {
  const safeUser = userId?.trim() || 'operator';
  return `sos_draft:${safeUser}:${workspaceId}:${journeyId}`;
}

export const ConversationDraftStore = {
  getDraft(userId: string | undefined, workspaceId: string, journeyId: string): string {
    if (!journeyId) return '';
    const key = buildDraftKey(userId, workspaceId, journeyId);

    // 1. Tenta memória
    if (memoryDrafts.has(key)) {
      return memoryDrafts.get(key) || '';
    }

    // 2. Tenta sessionStorage
    try {
      const storage = getStorage();
      if (storage) {
        const stored = storage.getItem(key);
        if (stored !== null) {
          memoryDrafts.set(key, stored);
          return stored;
        }
      }
    } catch {
      // Ignora erro de storage
    }

    return '';
  },

  setDraft(userId: string | undefined, workspaceId: string, journeyId: string, text: string): void {
    if (!journeyId) return;
    const key = buildDraftKey(userId, workspaceId, journeyId);

    // Atualiza memória
    if (!text || text.trim() === '') {
      memoryDrafts.delete(key);
    } else {
      memoryDrafts.set(key, text);
    }

    // Sincroniza sessionStorage
    try {
      const storage = getStorage();
      if (storage) {
        if (!text || text.trim() === '') {
          storage.removeItem(key);
        } else {
          storage.setItem(key, text);
        }
      }
    } catch {
      // Modo privado ou cota esgotada - mantém em memória
    }
  },

  clearDraft(userId: string | undefined, workspaceId: string, journeyId: string): void {
    if (!journeyId) return;
    const key = buildDraftKey(userId, workspaceId, journeyId);
    memoryDrafts.delete(key);
    try {
      const storage = getStorage();
      if (storage) {
        storage.removeItem(key);
      }
    } catch {
      // Ignora erro de storage
    }
  },

  clearUserDrafts(userId?: string): void {
    const safeUser = userId?.trim() || 'operator';
    const prefix = `sos_draft:${safeUser}:`;

    // Limpa da memória
    for (const key of Array.from(memoryDrafts.keys())) {
      if (key.startsWith(prefix)) {
        memoryDrafts.delete(key);
      }
    }

    // Limpa do sessionStorage se disponível
    try {
      const storage = getStorage();
      if (storage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && k.startsWith(prefix)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => storage.removeItem(k));
      }
    } catch (err) {
      console.warn('[ConversationDraftStore] Falha ao limpar rascunhos da sessão:', err);
    }
  },
};

export const clearUserDrafts = ConversationDraftStore.clearUserDrafts;

export function useConversationDrafts({ userId, workspaceId }: UseConversationDraftsOptions) {
  const currentWorkspaceIdRef = useRef(workspaceId);
  currentWorkspaceIdRef.current = workspaceId;

  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

  const getDraft = useCallback(
    (journeyId: string): string => {
      return ConversationDraftStore.getDraft(
        currentUserIdRef.current,
        currentWorkspaceIdRef.current,
        journeyId
      );
    },
    []
  );

  const setDraft = useCallback(
    (journeyId: string, text: string): void => {
      ConversationDraftStore.setDraft(
        currentUserIdRef.current,
        currentWorkspaceIdRef.current,
        journeyId,
        text
      );
    },
    []
  );

  const clearDraft = useCallback(
    (journeyId: string): void => {
      ConversationDraftStore.clearDraft(
        currentUserIdRef.current,
        currentWorkspaceIdRef.current,
        journeyId
      );
    },
    []
  );

  return {
    getDraft,
    setDraft,
    clearDraft,
  };
}
