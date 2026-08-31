import { AuthenticatedActor } from './operator-authenticator.js';

export interface WorkspaceInitResult {
  workspaceId: string;
  workspaceName: string;
  membershipId: string;
  role: 'owner';
  channelConnectionId: string;
  isExisting?: boolean;
}

export interface ClientWorkspaceInput {
  parentWorkspaceId: string;
  name: string;
  businessType: 'hair_salon' | 'auto_film' | 'general_services';
  tagline: string;
  ownerEmail?: string;
  whatsappNumber?: string;
  provider: 'waba' | 'waha';
}

export interface ClientWorkspaceResult extends WorkspaceInitResult {
  slug: string;
  channelProvider: 'meta_cloud' | 'waha';
  channelStatus: 'DISCONNECTED';
  ownerAccess: 'agency_owner';
}

export interface WorkspaceProvisioningGateway {
  /**
   * Initializes a new workspace with owner membership, default SLA policies,
   * and a disconnected WAHA channel ready for QR scanning.
   * If the actor already owns workspaces, returns the primary existing workspace idempotently.
   */
  initializeForActor(
    actor: AuthenticatedActor,
    workspaceName?: string,
  ): Promise<WorkspaceInitResult>;

  actorHasWorkspace(actor: AuthenticatedActor): Promise<boolean>;

  createClientWorkspace(
    actor: AuthenticatedActor,
    input: ClientWorkspaceInput,
  ): Promise<ClientWorkspaceResult>;

  /**
   * Removes a client workspace from the active operation without deleting its
   * commercial history. Reactivation remains an explicit back-office action.
   */
  deactivateWorkspace(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<void>;
}
