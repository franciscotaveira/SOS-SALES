import { useState, useEffect, useCallback } from 'react';
import { HttpSalesOsGateway } from '../services/salesOsGateway';

export function useWorkspaceInit(gateway?: HttpSalesOsGateway, currentWorkspaceId?: string) {
  const [needsInit, setNeedsInit] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkWorkspaces = useCallback(async () => {
    if (!gateway) return;
    try {
      setLoading(true);
      const workspaces = await gateway.listWorkspaces();
      if (!workspaces || workspaces.length === 0) {
        setNeedsInit(true);
      } else {
        setNeedsInit(false);
      }
    } catch {
      // If error (e.g. auth error), don't force init modal
      setNeedsInit(false);
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    if (!currentWorkspaceId && gateway) {
      checkWorkspaces();
    }
  }, [currentWorkspaceId, gateway, checkWorkspaces]);

  const initWorkspace = async (name?: string) => {
    if (!gateway) return;
    await gateway.initializeWorkspace(name);
    setNeedsInit(false);
  };

  return {
    needsInit,
    loading,
    initWorkspace,
    recheck: checkWorkspaces,
  };
}
