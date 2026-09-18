import { getDatabasePool } from "./client";

export interface UserWorkspaceMembership {
  workspace_id: string;
  workspace_name: string;
  role: string;
}

export interface SecurityAuditEventParams {
  workspaceId: string;
  actorId: string;
  actorType?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Discovers workspaces and active roles for an authenticated user.
 * Uses SECURITY DEFINER function to bypass tenant RLS safely.
 */
export async function getUserWorkspaces(userId: string): Promise<UserWorkspaceMembership[]> {
  const pool = getDatabasePool();
  const res = await pool.query<UserWorkspaceMembership>(
    "SELECT workspace_id, workspace_name, role FROM get_user_workspaces($1::uuid)",
    [userId]
  );
  return res.rows;
}

/**
 * Records an audit event even during rejected cross-tenant requests.
 * Uses SECURITY DEFINER function to ensure tamper-proof logging under FORCE RLS.
 */
export async function recordSecurityAuditEvent(params: SecurityAuditEventParams): Promise<string> {
  const pool = getDatabasePool();
  const res = await pool.query<{ record_security_audit_event: string }>(
    `SELECT record_security_audit_event(
      $1::uuid,
      $2::uuid,
      $3,
      $4,
      $5,
      $6,
      $7::jsonb,
      $8,
      $9
    )`,
    [
      params.workspaceId,
      params.actorId,
      params.actorType || "user",
      params.action,
      params.resourceType,
      params.resourceId,
      JSON.stringify(params.metadata || {}),
      params.ipAddress || null,
      params.userAgent || null,
    ]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error("Failed to record security audit event: no ID returned");
  }
  return row.record_security_audit_event;
}
