import { AuthenticatedActor } from './operator-authenticator.js';

export type CustomerLoyaltyType = 'NEW' | 'RECURRING';

/**
 * Workspace-scoped settings used by the operational cockpit.  These values
 * are business data, not browser preferences: a successful write must be
 * visible to every authorised operator and survive a reload.
 */
export interface WorkspaceOperationalSettings {
  workspaceId: string;
  commercialConfig: Record<string, unknown>;
  loyaltyOverrides: Record<string, CustomerLoyaltyType>;
  dailyTargetRevenueMinor: number;
  updatedAt: string | null;
}

export interface UpdateWorkspaceOperationalSettingsInput {
  commercialConfig?: Record<string, unknown>;
  loyaltyOverrides?: Record<string, CustomerLoyaltyType>;
  dailyTargetRevenueMinor?: number;
}

export interface UpdatedContact {
  contactId: string;
  name: string | null;
}

/** Authenticated, RLS-scoped cockpit settings and contact mutations. */
export interface WorkspaceOperationalGateway {
  getSettings(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<WorkspaceOperationalSettings>;

  updateSettings(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: UpdateWorkspaceOperationalSettingsInput,
  ): Promise<WorkspaceOperationalSettings>;

  updateContactName(
    actor: AuthenticatedActor,
    workspaceId: string,
    contactId: string,
    name: string,
  ): Promise<UpdatedContact | null>;
}
