import {
  FeatureFlagKey,
  FeatureFlagDefinition,
  FEATURE_FLAG_REGISTRY,
  WorkspaceTier,
  ROLE_HIERARCHY,
} from '../types/featureFlags';
import { Workspace, OperatorRole } from '../types/cockpit';
import { salesOsRuntimeConfig } from '../config/runtime';

const STORAGE_KEY = 'sales_os_feature_flag_overrides_v1';

export class FeatureFlagService {
  private overrides: Map<FeatureFlagKey, boolean> = new Map();

  constructor() {
    this.loadOverrides();
  }

  private loadOverrides() {
    // Production capabilities are owned by the authenticated workspace. A
    // stale browser value must never expose a module that the backend did not
    // enable for that tenant.
    if (salesOsRuntimeConfig.mode === 'api') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([k, v]) => {
            if (typeof v === 'boolean' && k in FEATURE_FLAG_REGISTRY) {
              this.overrides.set(k as FeatureFlagKey, v);
            }
          });
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  private persistOverrides() {
    if (salesOsRuntimeConfig.mode === 'api') return;
    try {
      const obj: Record<string, boolean> = {};
      this.overrides.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore localStorage write errors
    }
  }

  public getOverrides(): Record<FeatureFlagKey, boolean | undefined> {
    const result: Partial<Record<FeatureFlagKey, boolean>> = {};
    (Object.keys(FEATURE_FLAG_REGISTRY) as FeatureFlagKey[]).forEach((key) => {
      if (this.overrides.has(key)) {
        result[key] = this.overrides.get(key);
      }
    });
    return result as Record<FeatureFlagKey, boolean | undefined>;
  }

  public setOverride(key: FeatureFlagKey, value: boolean | null): void {
    if (salesOsRuntimeConfig.mode === 'api') return;
    if (value === null) {
      this.overrides.delete(key);
    } else {
      this.overrides.set(key, value);
    }
    this.persistOverrides();
  }

  public resetOverrides(): void {
    this.overrides.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  public isEnabled(
    key: FeatureFlagKey,
    workspace?: Workspace | null,
    role?: OperatorRole
  ): boolean {
    const definition = FEATURE_FLAG_REGISTRY[key];
    if (!definition) return false;

    const currentRole: OperatorRole = role || 'operator';
    const isOwner = currentRole === 'owner';

    // 1. Role-specific enforcement: Owner-Only Analytics restriction
    // If owner_only_analytics is enabled and current user is NOT an owner,
    // restrict traffic_proof and financial analytics tools
    if (!isOwner) {
      const isOwnerOnlyEnforced = this.isOwnerOnlyAnalyticsEnforced(workspace);
      if (isOwnerOnlyEnforced) {
        if (
          key === 'traffic_proof' ||
          key === 'financial_metrics' ||
          key === 'roas_deep_analytics' ||
          key === 'audit_trail'
        ) {
          // If explicitly overridden locally for testing, permit; otherwise block for non-owner
          if (this.overrides.has(key)) {
            return this.overrides.get(key) === true;
          }
          return false;
        }
      }
    }

    // 2. Check local explicit override
    if (this.overrides.has(key)) {
      return this.overrides.get(key) === true;
    }

    // 3. Role-specific restrictions (e.g. Viewer can never access QA simulator or admin tools)
    if (key === 'qa_simulator' && (currentRole === 'viewer' || currentRole === 'operator')) {
      // Only supervisor and owner have QA simulator by default
      if (currentRole === 'viewer') return false;
    }

    // 4. Role Hierarchy Minimum Requirement Check (if configured)
    if (definition.requiredRole && !isOwner) {
      const userLevel = ROLE_HIERARCHY[currentRole] || 1;
      const requiredLevel = ROLE_HIERARCHY[definition.requiredRole] || 1;
      if (userLevel < requiredLevel) {
        // If definition has a strict requiredRole and owner_only_analytics is active or role is viewer
        if (currentRole === 'viewer') {
          return false;
        }
      }
    }

    // 5. Workspace-level explicit configuration
    if (workspace?.featureFlags && key in workspace.featureFlags) {
      const wsFlag = workspace.featureFlags[key];
      if (typeof wsFlag === 'boolean') {
        return wsFlag;
      }
    }

    // 6. Workspace Tier default
    const tier: WorkspaceTier = workspace?.tier || 'standard';
    if (tier === 'agency') {
      return definition.defaultForAgency;
    }
    if (tier === 'enterprise') {
      return definition.defaultForEnterprise;
    }

    return definition.defaultForStandard;
  }

  private isOwnerOnlyAnalyticsEnforced(workspace?: Workspace | null): boolean {
    if (this.overrides.has('owner_only_analytics')) {
      return this.overrides.get('owner_only_analytics') === true;
    }
    if (workspace?.featureFlags?.owner_only_analytics !== undefined) {
      return workspace.featureFlags.owner_only_analytics;
    }
    const tier: WorkspaceTier = workspace?.tier || 'standard';
    return tier === 'agency' || tier === 'enterprise';
  }

  public getAllFlags(
    workspace?: Workspace | null,
    role?: OperatorRole
  ): Record<FeatureFlagKey, { isEnabled: boolean; definition: FeatureFlagDefinition; isOverridden: boolean }> {
    const result = {} as Record<
      FeatureFlagKey,
      { isEnabled: boolean; definition: FeatureFlagDefinition; isOverridden: boolean }
    >;

    (Object.keys(FEATURE_FLAG_REGISTRY) as FeatureFlagKey[]).forEach((key) => {
      const isOverridden = this.overrides.has(key);
      const isEnabled = this.isEnabled(key, workspace, role);
      result[key] = {
        isEnabled,
        definition: FEATURE_FLAG_REGISTRY[key],
        isOverridden,
      };
    });

    return result;
  }
}

export const featureFlagService = new FeatureFlagService();
