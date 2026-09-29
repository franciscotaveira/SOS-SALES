/**
 * Chat Sales — Integration Suggestions Repository (F1.1 Radar Hardening)
 * 
 * Provides tenant-scoped CRUD for integration suggestions with:
 * - Semantic idempotency (fingerprint verification on conflict -> 409 on logical difference)
 * - Origin snapshot and transactional revalidation on accept
 * - Governed candidates query with stable cursor, deduplication, and exclusion rules
 * - Optimistic concurrency via state_version
 * - Automatic exclusion of expired suggestions from queue and count
 */
import type { Pool, PoolClient } from "pg";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type SuggestionSource = "n8n" | "manual" | "system";
export type SuggestionType = "follow_up" | "reengagement" | "upsell" | "reminder" | "custom";
export type SuggestionPriority = "low" | "normal" | "high" | "urgent";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "expired" | "invalidated";

export interface OriginSnapshot {
  threadId?: string | null;
  lastMessageAt?: string | null;
  lastMessageId?: string | null;
  threadStatus?: string | null;
  contactOptOut?: boolean | null;
  assignedUserId?: string | null;
  moduleKey?: string | null;
  ruleVersion?: string | null;
  reasonCode?: string | null;
  snapshotRevision?: string | null;
  [key: string]: unknown;
}

export interface IntegrationSuggestionRecord {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  payload_fingerprint: string;
  source: SuggestionSource;
  thread_id: string | null;
  contact_id: string | null;
  suggestion_type: SuggestionType;
  title: string;
  body: string;
  draft_message: string | null;
  priority: SuggestionPriority;
  metadata: Record<string, unknown>;
  origin_snapshot: OriginSnapshot;
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
  originSnapshot?: OriginSnapshot;
  expiresAt?: string | null;
}

export interface CandidateEvidence {
  hoursSinceLastMessage: number;
  lastMessageAt: string;
  lastMessageDirection: string | null;
  lastMessageBody: string | null;
  lastMessageId: string | null;
  threadStatus: string;
  journeyId: string | null;
  journeyStage: string | null;
  journeyStatus: string | null;
}

export interface GovernedCandidateRecord {
  candidateId: string;
  threadId: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  moduleKey: string;
  ruleVersion: string;
  reasonCode: string;
  evidence: CandidateEvidence;
  snapshotRevision: string;
  lastMessageAt: Date;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SuggestionIdempotencyConflictError extends Error {
  public readonly code = "IDEMPOTENCY_CONFLICT";
  public readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    super(`Idempotency key '${idempotencyKey}' was already used with a different suggestion payload`);
    this.name = "SuggestionIdempotencyConflictError";
    this.idempotencyKey = idempotencyKey;
  }
}

export type DecisionRejectionReason =
  | "SUGGESTION_NOT_FOUND"
  | "ALREADY_DECIDED"
  | "VERSION_MISMATCH"
  | "SUGGESTION_EXPIRED"
  | "ORIGIN_THREAD_CLOSED"
  | "ORIGIN_THREAD_HANDOFF"
  | "ORIGIN_STALE_NEW_MESSAGE"
  | "ORIGIN_CONTACT_OPT_OUT"
  | "WORKSPACE_INACTIVE";

export class SuggestionDecisionRejectionError extends Error {
  public readonly code: DecisionRejectionReason;
  public readonly suggestionId: string;

  constructor(suggestionId: string, code: DecisionRejectionReason, message: string) {
    super(message);
    this.name = "SuggestionDecisionRejectionError";
    this.code = code;
    this.suggestionId = suggestionId;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function computeSuggestionFingerprint(input: {
  source?: SuggestionSource;
  threadId?: string | null;
  contactId?: string | null;
  suggestionType?: SuggestionType;
  title: string;
  body: string;
  draftMessage?: string | null;
  priority?: SuggestionPriority;
}): string {
  const normalized = {
    source: input.source || "n8n",
    threadId: input.threadId || null,
    contactId: input.contactId || null,
    suggestionType: input.suggestionType || "follow_up",
    title: (input.title || "").trim(),
    body: (input.body || "").trim(),
    draftMessage: input.draftMessage ? input.draftMessage.trim() : null,
    priority: input.priority || "normal",
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function encodeCursor(lastMessageAtIso: string, id: string): string {
  return Buffer.from(
    JSON.stringify({ lastMessageAt: lastMessageAtIso, id })
  ).toString("base64url");
}

export function decodeCursor(cursor: string): { lastMessageAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.lastMessageAt && parsed.id) {
      return { lastMessageAt: String(parsed.lastMessageAt), id: String(parsed.id) };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suggestion CRUD & State Machine
// ---------------------------------------------------------------------------

/**
 * Creates a suggestion with semantic idempotency.
 * If the idempotencyKey exists in the workspace:
 * - If payload_fingerprint matches -> returns existing record (replay)
 * - If payload_fingerprint differs -> throws SuggestionIdempotencyConflictError (HTTP 409)
 */
export async function createIntegrationSuggestion(
  client: Pool | PoolClient,
  workspaceId: string,
  input: CreateSuggestionInput
): Promise<{ suggestion: IntegrationSuggestionRecord; created: boolean }> {
  const fingerprint = computeSuggestionFingerprint(input);

  // If originSnapshot was not provided, assemble default from thread state if available
  let originSnapshot: OriginSnapshot = input.originSnapshot || {};
  if (!input.originSnapshot && input.threadId) {
    const snapRes = await client.query<{
      thread_status: string;
      last_message_at: Date;
      last_message_id: string | null;
      contact_opt_out: boolean;
    }>(
      `SELECT t.status as thread_status, t.last_message_at,
              m.id as last_message_id,
              c.opt_out as contact_opt_out
       FROM public.commercial_threads t
       LEFT JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
       LEFT JOIN LATERAL (
         SELECT id FROM public.messages
         WHERE workspace_id = t.workspace_id AND thread_id = t.id
         ORDER BY created_at DESC LIMIT 1
       ) m ON true
       WHERE t.workspace_id = $1 AND t.id = $2;`,
      [workspaceId, input.threadId]
    );

    if (snapRes.rows[0]) {
      const row = snapRes.rows[0];
      const revHash = crypto
        .createHash("sha256")
        .update(`${input.threadId}:${row.last_message_at.toISOString()}:${row.last_message_id || ""}:${row.thread_status}`)
        .digest("hex");

      originSnapshot = {
        threadId: input.threadId,
        lastMessageAt: row.last_message_at.toISOString(),
        lastMessageId: row.last_message_id,
        threadStatus: row.thread_status,
        contactOptOut: row.contact_opt_out,
        snapshotRevision: revHash,
      };
    }
  }

  // Attempt INSERT with ON CONFLICT DO NOTHING
  const insertRes = await client.query<IntegrationSuggestionRecord>(
    `INSERT INTO public.integration_suggestions (
      workspace_id, idempotency_key, payload_fingerprint, source,
      thread_id, contact_id,
      suggestion_type, title, body, draft_message,
      priority, metadata, origin_snapshot, expires_at
    ) VALUES (
      $1, $2, $3, COALESCE($4, 'n8n'),
      $5, $6,
      COALESCE($7, 'follow_up'), $8, $9, $10,
      COALESCE($11, 'normal'), COALESCE($12, '{}'::jsonb), COALESCE($13, '{}'::jsonb), $14
    )
    ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
    RETURNING *;`,
    [
      workspaceId,
      input.idempotencyKey,
      fingerprint,
      input.source || "n8n",
      input.threadId || null,
      input.contactId || null,
      input.suggestionType || "follow_up",
      input.title,
      input.body,
      input.draftMessage || null,
      input.priority || "normal",
      JSON.stringify(input.metadata || {}),
      JSON.stringify(originSnapshot),
      input.expiresAt || null,
    ]
  );

  if (insertRes.rows[0]) {
    return { suggestion: insertRes.rows[0], created: true };
  }

  // Conflict: fetch existing record
  const existingRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     WHERE workspace_id = $1 AND idempotency_key = $2;`,
    [workspaceId, input.idempotencyKey]
  );

  const existing = existingRes.rows[0];
  if (!existing) {
    throw new Error("Idempotency conflict but existing row not found — race condition or RLS violation");
  }

  // Verify semantic fingerprint
  if (existing.payload_fingerprint && existing.payload_fingerprint !== fingerprint) {
    throw new SuggestionIdempotencyConflictError(input.idempotencyKey);
  }

  return { suggestion: existing, created: false };
}

/**
 * Lists suggestions for a workspace with automatic exclusion of expired suggestions.
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

  // If status is pending, exclude expired
  let whereClause = "WHERE workspace_id = $1";
  const params: unknown[] = [workspaceId];
  let paramIndex = 2;

  if (options.status) {
    if (options.status === "pending") {
      whereClause += ` AND status = 'pending' AND (expires_at IS NULL OR expires_at > clock_timestamp())`;
    } else {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }
  } else {
    // Default view: exclude expired pending
    whereClause += ` AND (status != 'pending' OR expires_at IS NULL OR expires_at > clock_timestamp())`;
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
 * Gets the count of active, non-expired pending suggestions for a workspace.
 */
export async function countPendingSuggestions(
  client: Pool | PoolClient,
  workspaceId: string
): Promise<number> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count 
     FROM public.integration_suggestions
     WHERE workspace_id = $1 
       AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > clock_timestamp());`,
    [workspaceId]
  );
  return parseInt(res.rows[0]?.count || "0", 10);
}

/**
 * Transitions a suggestion to accepted or dismissed with transactional origin revalidation.
 * Revalidates:
 * 1. Optimistic concurrency (state_version match)
 * 2. Expiration (even if worker job hasn't run yet)
 * 3. Origin thread status (not closed, not in waiting_human / handoff)
 * 4. Origin message revision (no new messages arrived after origin snapshot)
 * 5. Contact opt-out status
 * 
 * NEVER sends external messages. Only updates suggestion state for operator composer pre-fill.
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
): Promise<IntegrationSuggestionRecord> {
  // 1. Lock and fetch target suggestion row
  const sugRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     WHERE workspace_id = $1 AND id = $2
     FOR UPDATE;`,
    [workspaceId, suggestionId]
  );

  const suggestion = sugRes.rows[0];
  if (!suggestion) {
    throw new SuggestionDecisionRejectionError(
      suggestionId,
      "SUGGESTION_NOT_FOUND",
      "Sugestão não encontrada no workspace"
    );
  }

  // 2. Check if already decided
  if (suggestion.status !== "pending") {
    throw new SuggestionDecisionRejectionError(
      suggestionId,
      "ALREADY_DECIDED",
      `Sugestão já foi decidida anteriormente (status: ${suggestion.status})`
    );
  }

  // 3. Optimistic concurrency check
  if (suggestion.state_version !== decision.expectedStateVersion) {
    throw new SuggestionDecisionRejectionError(
      suggestionId,
      "VERSION_MISMATCH",
      `Conflito de versão concorrente (esperado: ${decision.expectedStateVersion}, atual: ${suggestion.state_version})`
    );
  }

  // 4. Expiration check (even if background worker hasn't run yet)
  if (suggestion.expires_at && new Date(suggestion.expires_at).getTime() <= Date.now()) {
    // Mark as expired in DB
    await client.query(
      `UPDATE public.integration_suggestions
       SET status = 'expired',
           decided_at = clock_timestamp(),
           state_version = state_version + 1,
           updated_at = clock_timestamp()
       WHERE workspace_id = $1 AND id = $2;`,
      [workspaceId, suggestionId]
    );

    throw new SuggestionDecisionRejectionError(
      suggestionId,
      "SUGGESTION_EXPIRED",
      "Sugestão expirada pelo tempo limite e não pode mais ser aceita"
    );
  }

  // 5. Origin revalidation if accepting and thread is present
  if (decision.status === "accepted" && suggestion.thread_id) {
    const threadRes = await client.query<{
      status: string;
      last_message_at: Date;
      contact_id: string;
      opt_out: boolean;
      current_last_message_id: string | null;
      current_last_message_at: Date | null;
    }>(
      `SELECT t.status, t.last_message_at, t.contact_id,
              c.opt_out,
              m.id as current_last_message_id,
              m.created_at as current_last_message_at
       FROM public.commercial_threads t
       JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
       LEFT JOIN LATERAL (
         SELECT id, created_at
         FROM public.messages
         WHERE workspace_id = t.workspace_id AND thread_id = t.id
         ORDER BY created_at DESC LIMIT 1
       ) m ON true
       WHERE t.workspace_id = $1 AND t.id = $2;`,
      [workspaceId, suggestion.thread_id]
    );

    const threadRow = threadRes.rows[0];
    if (!threadRow) {
      throw new SuggestionDecisionRejectionError(
        suggestionId,
        "ORIGIN_THREAD_CLOSED",
        "A conversa de origem não foi encontrada"
      );
    }

    // 5.1 Closed thread check
    if (threadRow.status === "closed") {
      await invalidateSuggestion(client, workspaceId, suggestionId, decision.decidedByUserId, "A conversa de origem foi encerrada");
      throw new SuggestionDecisionRejectionError(
        suggestionId,
        "ORIGIN_THREAD_CLOSED",
        "A conversa de origem foi encerrada. Sugestão invalidada."
      );
    }

    // 5.2 Handoff / Human control check
    if (threadRow.status === "waiting_human") {
      await invalidateSuggestion(client, workspaceId, suggestionId, decision.decidedByUserId, "A conversa está sob controle humano / handoff");
      throw new SuggestionDecisionRejectionError(
        suggestionId,
        "ORIGIN_THREAD_HANDOFF",
        "A conversa está sob controle humano / handoff ativo. Sugestão não aplicável."
      );
    }

    // 5.3 Contact opt-out check
    if (threadRow.opt_out) {
      await invalidateSuggestion(client, workspaceId, suggestionId, decision.decidedByUserId, "Contato realizou opt-out");
      throw new SuggestionDecisionRejectionError(
        suggestionId,
        "ORIGIN_CONTACT_OPT_OUT",
        "O contato realizou opt-out de mensagens. Sugestão invalidada."
      );
    }

    // 5.4 Stale check: New message arrived after snapshot
    const originSnap = suggestion.origin_snapshot || {};
    if (originSnap.lastMessageAt && threadRow.current_last_message_at) {
      const snapTime = new Date(originSnap.lastMessageAt).getTime();
      const currTime = new Date(threadRow.current_last_message_at).getTime();

      // Check if there is a newer message or if the last message ID differs
      if (currTime > snapTime || (originSnap.lastMessageId && threadRow.current_last_message_id !== originSnap.lastMessageId)) {
        await invalidateSuggestion(
          client,
          workspaceId,
          suggestionId,
          decision.decidedByUserId,
          "Nova mensagem recebida após o snapshot de origem"
        );
        throw new SuggestionDecisionRejectionError(
          suggestionId,
          "ORIGIN_STALE_NEW_MESSAGE",
          "Uma nova mensagem foi recebida na conversa após a geração da sugestão. O operador deve avaliar o contexto recente."
        );
      }
    }
  }

  // 6. Apply successful decision
  const updateRes = await client.query<IntegrationSuggestionRecord>(
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

  const updated = updateRes.rows[0];
  if (!updated) {
    throw new SuggestionDecisionRejectionError(
      suggestionId,
      "VERSION_MISMATCH",
      "Falha concorrente ao atualizar sugestão"
    );
  }

  return updated;
}

async function invalidateSuggestion(
  client: Pool | PoolClient,
  workspaceId: string,
  suggestionId: string,
  decidedByUserId: string,
  reason: string
): Promise<void> {
  await client.query(
    `UPDATE public.integration_suggestions
     SET status = 'invalidated',
         decided_by_user_id = $1,
         decided_at = clock_timestamp(),
         metadata = metadata || jsonb_build_object('invalidation_reason', $2::text),
         state_version = state_version + 1,
         updated_at = clock_timestamp()
     WHERE workspace_id = $3 AND id = $4;`,
    [decidedByUserId, reason, workspaceId, suggestionId]
  );
}

/**
 * Expires all suggestions past their expires_at timestamp.
 * Called by background worker (sos_worker_user).
 */
export async function expireStaleIntegrationSuggestions(
  client: Pool | PoolClient
): Promise<number> {
  const res = await client.query(
    `UPDATE public.integration_suggestions
     SET status = 'expired',
         decided_at = clock_timestamp(),
         state_version = state_version + 1,
         updated_at = clock_timestamp()
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at <= clock_timestamp();`
  );

  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Governed Candidate Query
// ---------------------------------------------------------------------------

export interface ListCandidatesOptions {
  minHoursSinceLastMessage?: number;
  limit?: number;
  cursor?: string;
  moduleKey?: string;
}

/**
 * Returns threads eligible for integration suggestions.
 * Contract guarantees:
 * - Stable cursor pagination with ID tie-breaking
 * - Single identity per candidate (LATERAL joins prevent row multiplication)
 * - Structured evidence, ruleVersion, moduleKey, reasonCode, snapshotRevision
 * - Strict exclusion of closed, handoff (waiting_human), opt-out contacts, and active cooldown
 */
export async function listIntegrationCandidates(
  client: Pool | PoolClient,
  workspaceId: string,
  options: ListCandidatesOptions = {}
): Promise<{ items: GovernedCandidateRecord[]; total: number; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const minHours = Math.max(options.minHoursSinceLastMessage ?? 0, 0);
  const moduleKey = options.moduleKey || "radar_m01";

  // Decode cursor if provided
  let cursorCondition = "";
  const queryParams: unknown[] = [workspaceId, minHours];
  let paramIdx = 3;

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (decoded) {
      cursorCondition = `AND (t.last_message_at, t.id) > ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`;
      queryParams.push(decoded.lastMessageAt, decoded.id);
      paramIdx += 2;
    }
  }

  // Base WHERE: active or waiting_client ONLY, contacts not opted out, no active pending suggestion in cooldown
  const baseWhere = `
    WHERE t.workspace_id = $1
      AND t.status IN ('active', 'waiting_client')
      AND c.opt_out = false
      AND EXTRACT(EPOCH FROM (now() - t.last_message_at)) / 3600 >= $2
      AND NOT EXISTS (
        SELECT 1 FROM public.integration_suggestions s
        WHERE s.workspace_id = t.workspace_id
          AND s.thread_id = t.id
          AND s.status = 'pending'
          AND (s.expires_at IS NULL OR s.expires_at > clock_timestamp())
      )
  `;

  // Count total eligible candidates
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     ${baseWhere};`,
    [workspaceId, minHours]
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  // Fetch limit + 1 to calculate nextCursor
  const dataRes = await client.query<{
    thread_id: string;
    contact_id: string;
    contact_name: string | null;
    contact_phone: string;
    thread_status: string;
    last_message_at: Date;
    last_message_at_raw: string;
    last_message_id: string | null;
    last_message_direction: string | null;
    last_message_body: string | null;
    hours_since_last_message: number;
    journey_id: string | null;
    journey_stage: string | null;
    journey_status: string | null;
  }>(
    `SELECT 
       t.id as thread_id,
       t.contact_id,
       c.name as contact_name,
       c.phone_e164 as contact_phone,
       t.status as thread_status,
       t.last_message_at,
       to_char(t.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_message_at_raw,
       last_msg.id as last_message_id,
       last_msg.direction as last_message_direction,
       last_msg.body as last_message_body,
       ROUND(EXTRACT(EPOCH FROM (now() - t.last_message_at)) / 3600)::integer as hours_since_last_message,
       j.id as journey_id,
       j.stage as journey_stage,
       j.status as journey_status
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     LEFT JOIN LATERAL (
       SELECT m.id, m.direction, m.body
       FROM public.messages m
       WHERE m.workspace_id = t.workspace_id
         AND m.thread_id = t.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) last_msg ON true
     LEFT JOIN LATERAL (
       SELECT id, stage, status
       FROM public.commercial_journeys
       WHERE workspace_id = t.workspace_id
         AND thread_id = t.id
         AND status = 'open'
       ORDER BY created_at DESC
       LIMIT 1
     ) j ON true
     ${baseWhere}
     ${cursorCondition}
     ORDER BY t.last_message_at ASC, t.id ASC
     LIMIT $${paramIdx};`,
    [...queryParams, limit + 1]
  );

  const rows = dataRes.rows;
  const hasMore = rows.length > limit;
  const resultRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && resultRows.length > 0) {
    const lastItem = resultRows[resultRows.length - 1];
    if (lastItem) {
      nextCursor = encodeCursor(lastItem.last_message_at_raw, lastItem.thread_id);
    }
  }

  const items: GovernedCandidateRecord[] = resultRows.map((r) => {
    const snapRev = crypto
      .createHash("sha256")
      .update(`${r.thread_id}:${r.last_message_at.toISOString()}:${r.last_message_id || ""}:${r.thread_status}`)
      .digest("hex");

    const reasonCode =
      r.hours_since_last_message >= 24
        ? "COLD_LEAD_REENGAGEMENT"
        : r.last_message_direction === "inbound"
        ? "UNANSWERED_CLIENT_INQUIRY"
        : "FOLLOWUP_DUE";

    return {
      candidateId: r.thread_id,
      threadId: r.thread_id,
      contactId: r.contact_id,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      moduleKey,
      ruleVersion: "1.0.0",
      reasonCode,
      evidence: {
        hoursSinceLastMessage: r.hours_since_last_message,
        lastMessageAt: r.last_message_at.toISOString(),
        lastMessageDirection: r.last_message_direction,
        lastMessageBody: r.last_message_body,
        lastMessageId: r.last_message_id,
        threadStatus: r.thread_status,
        journeyId: r.journey_id,
        journeyStage: r.journey_stage,
        journeyStatus: r.journey_status,
      },
      snapshotRevision: snapRev,
      lastMessageAt: r.last_message_at,
    };
  });

  return { items, total, nextCursor };
}
