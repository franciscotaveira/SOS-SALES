/**
 * Chat Sales — Integration Suggestions Repository (F1 Radar)
 * 
 * Provides tenant-scoped CRUD for integration suggestions with:
 * - Idempotent creation (same idempotency_key returns existing row)
 * - Optimistic concurrency via state_version
 * - Pagination support for candidate and suggestion listing
 */
import type { Pool, PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SuggestionSource = "n8n" | "manual" | "system";
export type SuggestionType = "follow_up" | "reengagement" | "upsell" | "reminder" | "custom";
export type SuggestionPriority = "low" | "normal" | "high" | "urgent";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "expired";

export interface IntegrationSuggestionRecord {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  source: SuggestionSource;
  thread_id: string | null;
  contact_id: string | null;
  suggestion_type: SuggestionType;
  title: string;
  body: string;
  draft_message: string | null;
  priority: SuggestionPriority;
  metadata: Record<string, unknown>;
  status: SuggestionStatus;
  state_version: number;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSuggestionInput {
  idempotencyKey: string;
  source?: SuggestionSource;
  threadId?: string | null;
  contactId?: string | null;
  suggestionType?: SuggestionType;
  title: string;
  body: string;
  draftMessage?: string | null;
  priority?: SuggestionPriority;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}

export interface CandidateRecord {
  thread_id: string;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string;
  thread_status: string;
  last_message_at: Date;
  last_message_direction: string | null;
  last_message_body: string | null;
  hours_since_last_message: number;
  journey_id: string | null;
  journey_stage: string | null;
  journey_status: string | null;
}

// ---------------------------------------------------------------------------
// Suggestion CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a suggestion idempotently. If the idempotency_key already exists
 * within the workspace, returns the existing row without modification.
 */
export async function createIntegrationSuggestion(
  client: Pool | PoolClient,
  workspaceId: string,
  input: CreateSuggestionInput
): Promise<{ suggestion: IntegrationSuggestionRecord; created: boolean }> {
  // Attempt INSERT with ON CONFLICT DO NOTHING for idempotency
  const insertRes = await client.query<IntegrationSuggestionRecord>(
    `INSERT INTO public.integration_suggestions (
      workspace_id, idempotency_key, source,
      thread_id, contact_id,
      suggestion_type, title, body, draft_message,
      priority, metadata, expires_at
    ) VALUES (
      $1, $2, COALESCE($3, 'n8n'),
      $4, $5,
      COALESCE($6, 'follow_up'), $7, $8, $9,
      COALESCE($10, 'normal'), COALESCE($11, '{}'::jsonb), $12
    )
    ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
    RETURNING *;`,
    [
      workspaceId,
      input.idempotencyKey,
      input.source || "n8n",
      input.threadId || null,
      input.contactId || null,
      input.suggestionType || "follow_up",
      input.title,
      input.body,
      input.draftMessage || null,
      input.priority || "normal",
      JSON.stringify(input.metadata || {}),
      input.expiresAt || null,
    ]
  );

  if (insertRes.rows[0]) {
    return { suggestion: insertRes.rows[0], created: true };
  }

  // Conflict: fetch existing
  const existingRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     WHERE workspace_id = $1 AND idempotency_key = $2;`,
    [workspaceId, input.idempotencyKey]
  );

  const existing = existingRes.rows[0];
  if (!existing) {
    throw new Error("Idempotency conflict but existing row not found — race condition or RLS violation");
  }

  return { suggestion: existing, created: false };
}

/**
 * Lists pending suggestions for a workspace with pagination.
 */
export async function listIntegrationSuggestions(
  client: Pool | PoolClient,
  workspaceId: string,
  options: {
    status?: SuggestionStatus;
    limit?: number;
    offset?: number;
    threadId?: string;
  } = {}
): Promise<{ items: IntegrationSuggestionRecord[]; total: number }> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  let whereClause = "WHERE workspace_id = $1";
  const params: unknown[] = [workspaceId];
  let paramIndex = 2;

  if (options.status) {
    whereClause += ` AND status = $${paramIndex}`;
    params.push(options.status);
    paramIndex++;
  }

  if (options.threadId) {
    whereClause += ` AND thread_id = $${paramIndex}`;
    params.push(options.threadId);
    paramIndex++;
  }

  // Count total matching
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM public.integration_suggestions ${whereClause};`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  // Fetch paginated results
  const dataRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     ${whereClause}
     ORDER BY 
       CASE priority
         WHEN 'urgent' THEN 0
         WHEN 'high' THEN 1
         WHEN 'normal' THEN 2
         WHEN 'low' THEN 3
       END,
       created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1};`,
    [...params, limit, offset]
  );

  return { items: dataRes.rows, total };
}

/**
 * Transitions a suggestion to accepted/dismissed with optimistic concurrency.
 * Returns null if the suggestion was not found or if the state_version has changed
 * (indicating a concurrent modification).
 */
export async function decideSuggestion(
  client: Pool | PoolClient,
  workspaceId: string,
  suggestionId: string,
  decision: {
    status: "accepted" | "dismissed";
    decidedByUserId: string;
    expectedStateVersion: number;
  }
): Promise<IntegrationSuggestionRecord | null> {
  const res = await client.query<IntegrationSuggestionRecord>(
    `UPDATE public.integration_suggestions
     SET status = $1,
         decided_by_user_id = $2,
         decided_at = clock_timestamp(),
         state_version = state_version + 1,
         updated_at = clock_timestamp()
     WHERE workspace_id = $3
       AND id = $4
       AND status = 'pending'
       AND state_version = $5
     RETURNING *;`,
    [
      decision.status,
      decision.decidedByUserId,
      workspaceId,
      suggestionId,
      decision.expectedStateVersion,
    ]
  );

  return res.rows[0] ?? null;
}

/**
 * Expires all suggestions past their expires_at timestamp.
 * Called by background worker — no tenant context required.
 */
export async function expireStaleIntegrationSuggestions(
  client: Pool | PoolClient,
): Promise<number> {
  const res = await client.query(
    `UPDATE public.integration_suggestions
     SET status = 'expired',
         decided_at = clock_timestamp(),
         state_version = state_version + 1,
         updated_at = clock_timestamp()
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at < clock_timestamp();`
  );

  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Candidate Query (Snapshot of threads with real "waiting" facts)
// ---------------------------------------------------------------------------

/**
 * Returns threads eligible for integration suggestions.
 * Computes real "waiting" facts from the last message direction and timestamp.
 * No fake waitingOn/waitingSince — derives from actual data.
 */
export async function listIntegrationCandidates(
  client: Pool | PoolClient,
  workspaceId: string,
  options: {
    minHoursSinceLastMessage?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ items: CandidateRecord[]; total: number }> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const offset = Math.max(options.offset || 0, 0);
  const minHours = options.minHoursSinceLastMessage ?? 0;

  const baseWhere = `
    WHERE t.workspace_id = $1
      AND t.status IN ('active', 'waiting_client', 'waiting_human')
      AND EXTRACT(EPOCH FROM (now() - t.last_message_at)) / 3600 >= $2
  `;

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM public.commercial_threads t
     ${baseWhere};`,
    [workspaceId, minHours]
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const dataRes = await client.query<CandidateRecord>(
    `SELECT 
       t.id as thread_id,
       t.contact_id,
       c.name as contact_name,
       c.phone_e164 as contact_phone,
       t.status as thread_status,
       t.last_message_at,
       last_msg.direction as last_message_direction,
       last_msg.body as last_message_body,
       ROUND(EXTRACT(EPOCH FROM (now() - t.last_message_at)) / 3600)::integer as hours_since_last_message,
       j.id as journey_id,
       j.stage as journey_stage,
       j.status as journey_status
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     LEFT JOIN LATERAL (
       SELECT m.direction, m.body
       FROM public.messages m
       WHERE m.workspace_id = t.workspace_id
         AND m.thread_id = t.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) last_msg ON true
     LEFT JOIN public.commercial_journeys j 
       ON j.workspace_id = t.workspace_id 
       AND j.thread_id = t.id 
       AND j.status = 'open'
     ${baseWhere}
     ORDER BY t.last_message_at ASC
     LIMIT $3 OFFSET $4;`,
    [workspaceId, minHours, limit, offset]
  );

  return { items: dataRes.rows, total };
}

/**
 * Gets the count of pending suggestions for a workspace.
 * Used by Cockpit UI for the badge counter.
 */
export async function countPendingSuggestions(
  client: Pool | PoolClient,
  workspaceId: string
): Promise<number> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count 
     FROM public.integration_suggestions
     WHERE workspace_id = $1 AND status = 'pending';`,
    [workspaceId]
  );
  return parseInt(res.rows[0]?.count || "0", 10);
}
