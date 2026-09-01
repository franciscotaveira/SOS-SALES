import { AuthenticatedActor } from './operator-authenticator.js';

export type WorkspaceMemberRole = 'owner' | 'operator' | 'viewer';

export interface WorkspaceMemberRecord {
  membershipId: string;
  userId: string;
  role: WorkspaceMemberRole;
  createdAt: string;
}

/**
 * Owner-governed membership management. This port never creates auth users or
 * sends invitations: an operator must have an SOS Sales account before a
 * workspace owner can grant access.
 */
export interface WorkspaceMembershipGateway {
  listMembers(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberRecord[]>;
  createInvitation(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: { email: string; role: Extract<WorkspaceMemberRole, 'operator' | 'viewer'> },
  ): Promise<{ code: string; email: string; role: 'operator' | 'viewer'; expiresAt: string }>;
  acceptInvitation(actor: AuthenticatedActor, code: string): Promise<{ workspaceId: string; role: WorkspaceMemberRole }>;
  removeMember(actor: AuthenticatedActor, workspaceId: string, membershipId: string): Promise<void>;
}
