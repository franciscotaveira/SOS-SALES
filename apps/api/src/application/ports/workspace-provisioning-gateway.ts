import { AuthenticatedActor } from './operator-authenticator.js';

export interface WorkspaceInitResult {
  workspaceId: string;
  workspaceName: string;
  membershipId: string;
  role: 'owner';
  channelConnectionId: string;
  isExisting?: boolean;
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
}
