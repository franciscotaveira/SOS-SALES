import React from 'react';
import { FeatureFlagKey, FeatureFlagDefinition, WorkspaceTier } from '../types/featureFlags';
import { Workspace, OperatorRole } from '../types/cockpit';
import { featureFlagService } from '../services/featureFlags';

interface FeatureFlagContextValue {
  isFeatureEnabled: (key: FeatureFlagKey) => boolean;
  setOverride: (key: FeatureFlagKey, value: boolean | null) => void;
  resetOverrides: () => void;
  allFlags: Record<
    FeatureFlagKey,
    { isEnabled: boolean; definition: FeatureFlagDefinition; isOverridden: boolean }
  >;
  workspaceTier: WorkspaceTier;
  hasOverrides: boolean;
  currentRole: OperatorRole;
}

const FeatureFlagContext = React.createContext<FeatureFlagContextValue | undefined>(undefined);

interface FeatureFlagProviderProps {
  workspace: Workspace | null;
  role?: OperatorRole;
  children: React.ReactNode;
}

export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({
  workspace,
  role,
  children,
}) => {
  const [version, setVersion] = React.useState(0);

  const isFeatureEnabled = React.useCallback(
    (key: FeatureFlagKey): boolean => {
      // Re-evaluate on version change
      return featureFlagService.isEnabled(key, workspace, role);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, role, version]
  );

  const setOverride = React.useCallback((key: FeatureFlagKey, value: boolean | null) => {
    featureFlagService.setOverride(key, value);
    setVersion((v) => v + 1);
  }, []);

  const resetOverrides = React.useCallback(() => {
    featureFlagService.resetOverrides();
    setVersion((v) => v + 1);
  }, []);

  const allFlags = React.useMemo(() => {
    return featureFlagService.getAllFlags(workspace, role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, role, version]);

  const hasOverrides = React.useMemo(() => {
    return Object.values(allFlags).some((f) => (f as { isOverridden: boolean }).isOverridden);
  }, [allFlags]);

  const workspaceTier: WorkspaceTier = workspace?.tier || 'standard';
  const currentRole: OperatorRole = role || 'operator';

  const value: FeatureFlagContextValue = {
    isFeatureEnabled,
    setOverride,
    resetOverrides,
    allFlags,
    workspaceTier,
    hasOverrides,
    currentRole,
  };

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = (): FeatureFlagContextValue => {
  const context = React.useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  return context;
};
