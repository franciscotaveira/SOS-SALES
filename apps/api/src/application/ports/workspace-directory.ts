import { AuthenticatedActor } from './operator-authenticator.js';

/** A workspace visible to the authenticated actor, including its RBAC role. */
export interface AccessibleWorkspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'operator' | 'viewer';
}

/** A persisted workspace membership. Personal profile fields are deliberately
 * absent: this table is the RBAC source of truth, not a user-directory mirror. */
export interface WorkspaceMember {
  membershipId: string;
  userId: string;
  role: 'owner' | 'operator' | 'viewer';
  createdAt: string;
}

/**
 * Read port for the authenticated user's own workspace memberships.
 * It intentionally receives the verifier-derived actor rather than a
 * caller-supplied workspace id, preventing tenant selection by header.
 */
export interface WorkspaceDirectory {
  listForActor(actor: AuthenticatedActor): Promise<AccessibleWorkspace[]>;
  /** Optional while older composition roots are upgraded. Implementations must
   * return members only after applying the actor's tenant context. */
  listMembers?(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMember[]>;
}
