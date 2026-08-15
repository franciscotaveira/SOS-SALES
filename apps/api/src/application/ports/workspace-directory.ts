import { AuthenticatedActor } from './operator-authenticator.js';

/** A workspace visible to the authenticated actor, including its RBAC role. */
export interface AccessibleWorkspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'operator' | 'viewer';
}

/**
 * Read port for the authenticated user's own workspace memberships.
 * It intentionally receives the verifier-derived actor rather than a
 * caller-supplied workspace id, preventing tenant selection by header.
 */
export interface WorkspaceDirectory {
  listForActor(actor: AuthenticatedActor): Promise<AccessibleWorkspace[]>;
}
