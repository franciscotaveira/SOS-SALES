/**
 * Chat Sales — Integration Suggestions Repository (F1.1-B Radar Hardening)
 * 
 * Provides tenant-scoped CRUD for integration suggestions with:
 * - Server-owned origin snapshot (derived transactionally, client cannot spoof)
 * - Persisted invalidation and expiration (commits state before returning 409)
 * - Complete semantic idempotency (fingerprint covering validity, rules, snapshot)
 * - Governed candidates with strict cursor validation, deterministic message tie-breaking
 * - Real module enablement & cooldown across states (pending, accepted, dismissed)
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
  threadId: string;
  contactId: string;
  lastMessageAt: string;
  lastMessageId: string | null;
  threadStatus: string;
  contactOptOut: boolean;
  assignedUserId?: string | null;
  moduleKey?: string | null;
  ruleVersion?: string | null;
  reasonCode?: string | null;
  snapshotRevision: string;
  [key: string]: unknown;
}

export interface IntegrationSuggestionRecord {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  payload_fingerprint: string;
  source: SuggestionSource;
  module_key: string;
  rule_version: string;
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
  moduleKey?: string;
  ruleVersion?: string;
  reasonCode?: string | null;
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
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
// Errors & Rejection Codes
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

export class InvalidCursorError extends Error {
  public readonly code = "INVALID_CURSOR";

  constructor(message: string = "Cursor de paginação malformado ou inválido") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

export type SuggestionRejectionCode =
  | "SUGGESTION_NOT_FOUND"
  | "ALREADY_DECIDED"
  | "VERSION_MISMATCH"
  | "SUGGESTION_EXPIRED"
  | "ORIGIN_THREAD_CLOSED"
  | "ORIGIN_THREAD_HANDOFF"
  | "ORIGIN_STALE_NEW_MESSAGE"
  | "ORIGIN_CONTACT_OPT_OUT"
  | "MODULE_DISABLED"
  | "COOLDOWN_ACTIVE"
  | "INVALID_SNAPSHOT";

export class SuggestionDecisionRejectionError extends Error {
  public readonly code: SuggestionRejectionCode;
  public readonly targetId: string;

  constructor(targetId: string, code: SuggestionRejectionCode, message: string) {
    super(message);
    this.name = "SuggestionDecisionRejectionError";
    this.code = code;
    this.targetId = targetId;
  }
}

export type SuggestionDecisionResult =
  | { ok: true; suggestion: IntegrationSuggestionRecord }
  | { ok: false; code: SuggestionRejectionCode; reason: string; suggestion: IntegrationSuggestionRecord | null };

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
  expiresAt?: string | null;
  moduleKey?: string;
  ruleVersion?: string;
  reasonCode?: string | null;
  evidence?: Record<string, unknown> | null;
  snapshotRevision?: string | null;
}): string {
  const normalized = {
    body: (input.body || "").trim(),
    contactId: input.contactId || null,
    draftMessage: input.draftMessage ? input.draftMessage.trim() : null,
    evidence: input.evidence || null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    moduleKey: input.moduleKey || "radar_m01",
    priority: input.priority || "normal",
    reasonCode: input.reasonCode || null,
    ruleVersion: input.ruleVersion || "1.0.0",
    snapshotRevision: input.snapshotRevision || null,
    source: input.source || "n8n",
    suggestionType: input.suggestionType || "follow_up",
    threadId: input.threadId || null,
    title: (input.title || "").trim(),
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function encodeCursor(lastMessageAtIso: string, id: string): string {
  return Buffer.from(
    JSON.stringify({ lastMessageAt: lastMessageAtIso, id })
  ).toString("base64url");
}

export function decodeCursor(cursor: string): { lastMessageAt: string; id: string } {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new InvalidCursorError();
    }
    const { lastMessageAt, id } = parsed;
    if (!lastMessageAt || typeof lastMessageAt !== "string" || isNaN(Date.parse(lastMessageAt))) {
      throw new InvalidCursorError("Data de cursor inválida");
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!id || typeof id !== "string" || !uuidRegex.test(id)) {
      throw new InvalidCursorError("UUID de cursor inválido");
    }
    return { lastMessageAt, id };
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      throw err;
    }
    throw new InvalidCursorError();
  }
}

// ---------------------------------------------------------------------------
// Suggestion CRUD & State Machine
// ---------------------------------------------------------------------------

/**
 * Creates a suggestion with server-derived origin snapshot, module governance,
 * and semantic idempotency.
 */
export async function createIntegrationSuggestion(
  client: Pool | PoolClient,
  workspaceId: string,
  input: CreateSuggestionInput
): Promise<{ suggestion: IntegrationSuggestionRecord; created: boolean }> {
  // 1. Validate workspace and module enablement
  const wsRes = await client.query<{
    is_active: boolean;
    radar_enabled: boolean;
    radar_rule_version: string;
    radar_cooldown_seconds: number;
  }>(
    `SELECT is_active, radar_enabled, radar_rule_version, radar_cooldown_seconds
     FROM public.workspaces
     WHERE id = $1;`,
    [workspaceId]
  );

  const ws = wsRes.rows[0];
  if (!ws || !ws.is_active || !ws.radar_enabled) {
    throw new SuggestionDecisionRejectionError(
      workspaceId,
      "MODULE_DISABLED",
      "Módulo Radar desabilitado para este workspace"
    );
  }

  const moduleKey = input.moduleKey || "radar_m01";
  if (moduleKey !== "radar_m01") {
    throw new SuggestionDecisionRejectionError(
      workspaceId,
      "MODULE_DISABLED",
      `Módulo '${moduleKey}' não suportado nesta versão`
    );
  }

  const ruleVersion = input.ruleVersion || ws.radar_rule_version || "1.0.0";

  // 2. Validate origin thread and derive server-owned snapshot
  let originSnapshot: OriginSnapshot | null = null;
  let verifiedContactId: string | null = input.contactId || null;

  if (input.threadId) {
    // Cooldown check for the same thread/module/rule
    const cooldownRes = await client.query<{
      id: string;
      idempotency_key: string;
    }>(
      `SELECT id, idempotency_key
       FROM public.integration_suggestions
       WHERE workspace_id = $1
         AND thread_id = $2
         AND module_key = $3
         AND rule_version = $4
         AND created_at > clock_timestamp() - ($5 || ' seconds')::interval
       ORDER BY created_at DESC
       LIMIT 1;`,
      [workspaceId, input.threadId, moduleKey, ruleVersion, ws.radar_cooldown_seconds]
    );

    const recentSug = cooldownRes.rows[0];
    if (recentSug && recentSug.idempotency_key !== input.idempotencyKey) {
      throw new SuggestionDecisionRejectionError(
        input.threadId,
        "COOLDOWN_ACTIVE",
        "Thread em período de cooldown para este módulo"
      );
    }

    // Query thread state + contact association + latest message with deterministic tie-breaking
    const threadRes = await client.query<{
      thread_id: string;
      contact_id: string;
      thread_status: string;
      last_message_at: Date;
      last_message_at_raw: string;
      contact_opt_out: boolean;
      last_message_id: string | null;
      last_msg_created_at_raw: string | null;
    }>(
      `SELECT
         t.id as thread_id,
         t.contact_id,
         t.status as thread_status,
         t.last_message_at,
         to_char(t.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_message_at_raw,
         c.opt_out as contact_opt_out,
         m.id as last_message_id,
         to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_msg_created_at_raw
       FROM public.commercial_threads t
       JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
       LEFT JOIN LATERAL (
         SELECT id, created_at
         FROM public.messages
         WHERE workspace_id = t.workspace_id AND thread_id = t.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) m ON true
       WHERE t.workspace_id = $1 AND t.id = $2;`,
      [workspaceId, input.threadId]
    );

    const row = threadRes.rows[0];
    if (!row) {
      throw new SuggestionDecisionRejectionError(
        input.threadId,
        "INVALID_SNAPSHOT",
        "Thread ou contato de origem não encontrado ou inconsistente"
      );
    }

    if (input.contactId && input.contactId !== row.contact_id) {
      throw new SuggestionDecisionRejectionError(
        input.threadId,
        "INVALID_SNAPSHOT",
        "Contato informado não corresponde ao contato da conversa"
      );
    }
    verifiedContactId = row.contact_id;

    if (row.contact_opt_out) {
      throw new SuggestionDecisionRejectionError(
        input.threadId,
        "ORIGIN_CONTACT_OPT_OUT",
        "Contato realizou opt-out de mensagens"
      );
    }

    if (row.thread_status === "closed") {
      throw new SuggestionDecisionRejectionError(
        input.threadId,
        "ORIGIN_THREAD_CLOSED",
        "A conversa de origem está encerrada"
      );
    }

    if (row.thread_status === "waiting_human") {
      throw new SuggestionDecisionRejectionError(
        input.threadId,
        "ORIGIN_THREAD_HANDOFF",
        "A conversa de origem está em controle humano / handoff"
      );
    }

    const lastMsgAtStr = row.last_msg_created_at_raw || row.last_message_at_raw;
    const revHash = crypto
      .createHash("sha256")
      .update(`${row.thread_id}:${row.contact_id}:${lastMsgAtStr}:${row.last_message_id || ""}:${row.thread_status}:${row.contact_opt_out}`)
      .digest("hex");

    originSnapshot = {
      threadId: row.thread_id,
      contactId: row.contact_id,
      lastMessageAt: lastMsgAtStr,
      lastMessageId: row.last_message_id,
      threadStatus: row.thread_status,
      contactOptOut: row.contact_opt_out,
      moduleKey,
      ruleVersion,
      reasonCode: input.reasonCode || null,
      snapshotRevision: revHash,
    };
  }

  // 3. Compute canonical logical fingerprint
  const fingerprint = computeSuggestionFingerprint({
    source: input.source || "n8n",
    threadId: input.threadId || null,
    contactId: verifiedContactId,
    suggestionType: input.suggestionType || "follow_up",
    title: input.title,
    body: input.body,
    draftMessage: input.draftMessage || null,
    priority: input.priority || "normal",
    expiresAt: input.expiresAt || null,
    moduleKey,
    ruleVersion,
    reasonCode: input.reasonCode || null,
    evidence: input.evidence || null,
    snapshotRevision: originSnapshot?.snapshotRevision || null,
  });

  // Construct typed metadata
  const metadata: Record<string, unknown> = {
    ...(input.metadata || {}),
    moduleKey,
    ruleVersion,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };

  // 4. Attempt INSERT with ON CONFLICT DO NOTHING
  const insertRes = await client.query<IntegrationSuggestionRecord>(
    `INSERT INTO public.integration_suggestions (
      workspace_id, idempotency_key, payload_fingerprint, source,
      module_key, rule_version,
      thread_id, contact_id,
      suggestion_type, title, body, draft_message,
      priority, metadata, origin_snapshot, expires_at
    ) VALUES (
      $1, $2, $3, COALESCE($4, 'n8n'),
      $5, $6,
      $7, $8,
      COALESCE($9, 'follow_up'), $10, $11, $12,
      COALESCE($13, 'normal'), COALESCE($14, '{}'::jsonb), COALESCE($15, '{}'::jsonb), $16
    )
    ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
    RETURNING *;`,
    [
      workspaceId,
      input.idempotencyKey,
      fingerprint,
      input.source || "n8n",
      moduleKey,
      ruleVersion,
      input.threadId || null,
      verifiedContactId,
      input.suggestionType || "follow_up",
      input.title,
      input.body,
      input.draftMessage || null,
      input.priority || "normal",
      JSON.stringify(metadata),
      JSON.stringify(originSnapshot || {}),
      input.expiresAt || null,
    ]
  );

  if (insertRes.rows[0]) {
    return { suggestion: insertRes.rows[0], created: true };
  }

  // 5. Conflict: fetch existing record
  const existingRes = await client.query<IntegrationSuggestionRecord>(
    `SELECT * FROM public.integration_suggestions
     WHERE workspace_id = $1 AND idempotency_key = $2;`,
    [workspaceId, input.idempotencyKey]
  );

  const existing = existingRes.rows[0];
  if (!existing) {
    throw new Error("Idempotency conflict but existing row not found — race condition or RLS violation");
  }

  // Verify semantic fingerprint (fail-closed: empty fingerprint rejects replay)
  if (!existing.payload_fingerprint || existing.payload_fingerprint !== fingerprint) {
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
    whereClause += ` AND (status != 'pending' OR expires_at IS NULL OR expires_at > clock_timestamp())`;
  }

  if (options.threadId) {
    whereClause += ` AND thread_id = $${paramIndex}`;
    params.push(options.threadId);
    paramIndex++;
  }

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM public.integration_suggestions ${whereClause};`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

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
 * Decides a suggestion with transactional origin revalidation and safe persistence.
 * If rejected/invalidated, commits the updated row with structured reason before returning.
 * 
 * NEVER throws inside the transaction on domain rejection; returns SuggestionDecisionResult.
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
): Promise<SuggestionDecisionResult> {
  // 1. Lock and fetch target suggestion row + workspace module config
  const sugRes = await client.query<IntegrationSuggestionRecord & {
    ws_is_active: boolean;
    radar_enabled: boolean;
  }>(
    `SELECT s.*, w.is_active as ws_is_active, w.radar_enabled
     FROM public.integration_suggestions s
     JOIN public.workspaces w ON w.id = s.workspace_id
     WHERE s.workspace_id = $1 AND s.id = $2
     FOR UPDATE OF s;`,
    [workspaceId, suggestionId]
  );

  const suggestion = sugRes.rows[0];
  if (!suggestion) {
    return {
      ok: false,
      code: "SUGGESTION_NOT_FOUND",
      reason: "Sugestão não encontrada no workspace",
      suggestion: null,
    };
  }

  // 1.1 Check workspace / radar enabled
  if (!suggestion.ws_is_active || !suggestion.radar_enabled) {
    return {
      ok: false,
      code: "MODULE_DISABLED",
      reason: "Módulo Radar desabilitado para este workspace",
      suggestion,
    };
  }

  // 2. Check if already decided
  if (suggestion.status !== "pending") {
    return {
      ok: false,
      code: "ALREADY_DECIDED",
      reason: `Sugestão já foi decidida anteriormente (status: ${suggestion.status})`,
      suggestion,
    };
  }

  // 3. Optimistic concurrency check
  if (suggestion.state_version !== decision.expectedStateVersion) {
    return {
      ok: false,
      code: "VERSION_MISMATCH",
      reason: `Conflito de versão concorrente (esperado: ${decision.expectedStateVersion}, atual: ${suggestion.state_version})`,
      suggestion,
    };
  }

  // 4. Expiration check using database clock
  const expiryCheck = await client.query<{ is_expired: boolean }>(
    `SELECT (expires_at IS NOT NULL AND expires_at <= clock_timestamp()) as is_expired
     FROM public.integration_suggestions
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, suggestionId]
  );

  if (expiryCheck.rows[0]?.is_expired) {
    const expiredRes = await client.query<IntegrationSuggestionRecord>(
      `UPDATE public.integration_suggestions
       SET status = 'expired',
           decided_at = clock_timestamp(),
           metadata = metadata || jsonb_build_object('invalidation_reason', 'Sugestão expirada pelo tempo limite'),
           state_version = state_version + 1,
           updated_at = clock_timestamp()
       WHERE workspace_id = $1 AND id = $2
       RETURNING *;`,
      [workspaceId, suggestionId]
    );

    return {
      ok: false,
      code: "SUGGESTION_EXPIRED",
      reason: "Sugestão expirada pelo tempo limite e não pode mais ser aceita",
      suggestion: expiredRes.rows[0] || null,
    };
  }

  // 5. Origin revalidation if accepting and thread is present
  if (decision.status === "accepted" && suggestion.thread_id) {
    const originSnap = suggestion.origin_snapshot;
    if (!originSnap || !originSnap.lastMessageAt || !originSnap.threadId) {
      const invRes = await client.query<IntegrationSuggestionRecord>(
        `UPDATE public.integration_suggestions
         SET status = 'invalidated',
             decided_by_user_id = $1,
             decided_at = clock_timestamp(),
             metadata = metadata || jsonb_build_object('invalidation_reason', 'Snapshot de origem ausente ou incompleto'),
             state_version = state_version + 1,
             updated_at = clock_timestamp()
         WHERE workspace_id = $2 AND id = $3
         RETURNING *;`,
        [decision.decidedByUserId, workspaceId, suggestionId]
      );
      return {
        ok: false,
        code: "INVALID_SNAPSHOT",
        reason: "Snapshot de origem ausente ou incompleto. Sugestão invalidada.",
        suggestion: invRes.rows[0] || null,
      };
    }

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
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) m ON true
       WHERE t.workspace_id = $1 AND t.id = $2;`,
      [workspaceId, suggestion.thread_id]
    );

    const threadRow = threadRes.rows[0];
    if (!threadRow) {
      const invRes = await client.query<IntegrationSuggestionRecord>(
        `UPDATE public.integration_suggestions
         SET status = 'invalidated',
             decided_by_user_id = $1,
             decided_at = clock_timestamp(),
             metadata = metadata || jsonb_build_object('invalidation_reason', 'A conversa de origem não foi encontrada'),
             state_version = state_version + 1,
             updated_at = clock_timestamp()
         WHERE workspace_id = $2 AND id = $3
         RETURNING *;`,
        [decision.decidedByUserId, workspaceId, suggestionId]
      );
      return {
        ok: false,
        code: "ORIGIN_THREAD_CLOSED",
        reason: "A conversa de origem não foi encontrada",
        suggestion: invRes.rows[0] || null,
      };
    }

    // 5.1 Closed thread check
    if (threadRow.status === "closed") {
      const invRes = await client.query<IntegrationSuggestionRecord>(
        `UPDATE public.integration_suggestions
         SET status = 'invalidated',
             decided_by_user_id = $1,
             decided_at = clock_timestamp(),
             metadata = metadata || jsonb_build_object('invalidation_reason', 'A conversa de origem foi encerrada'),
             state_version = state_version + 1,
             updated_at = clock_timestamp()
         WHERE workspace_id = $2 AND id = $3
         RETURNING *;`,
        [decision.decidedByUserId, workspaceId, suggestionId]
      );
      return {
        ok: false,
        code: "ORIGIN_THREAD_CLOSED",
        reason: "A conversa de origem foi encerrada. Sugestão invalidada.",
        suggestion: invRes.rows[0] || null,
      };
    }

    // 5.2 Handoff / Human control check
    if (threadRow.status === "waiting_human") {
      const invRes = await client.query<IntegrationSuggestionRecord>(
        `UPDATE public.integration_suggestions
         SET status = 'invalidated',
             decided_by_user_id = $1,
             decided_at = clock_timestamp(),
             metadata = metadata || jsonb_build_object('invalidation_reason', 'A conversa está sob controle humano / handoff'),
             state_version = state_version + 1,
             updated_at = clock_timestamp()
         WHERE workspace_id = $2 AND id = $3
         RETURNING *;`,
        [decision.decidedByUserId, workspaceId, suggestionId]
      );
      return {
        ok: false,
        code: "ORIGIN_THREAD_HANDOFF",
        reason: "A conversa está sob controle humano / handoff ativo. Sugestão não aplicável.",
        suggestion: invRes.rows[0] || null,
      };
    }

    // 5.3 Contact opt-out check
    if (threadRow.opt_out) {
      const invRes = await client.query<IntegrationSuggestionRecord>(
        `UPDATE public.integration_suggestions
         SET status = 'invalidated',
             decided_by_user_id = $1,
             decided_at = clock_timestamp(),
             metadata = metadata || jsonb_build_object('invalidation_reason', 'Contato realizou opt-out'),
             state_version = state_version + 1,
             updated_at = clock_timestamp()
         WHERE workspace_id = $2 AND id = $3
         RETURNING *;`,
        [decision.decidedByUserId, workspaceId, suggestionId]
      );
      return {
        ok: false,
        code: "ORIGIN_CONTACT_OPT_OUT",
        reason: "O contato realizou opt-out de mensagens. Sugestão invalidada.",
        suggestion: invRes.rows[0] || null,
      };
    }

    // 5.4 Stale check: New message arrived after snapshot
    const snapTime = new Date(originSnap.lastMessageAt).getTime();
    const currTime = threadRow.current_last_message_at ? new Date(threadRow.current_last_message_at).getTime() : 0;

    const hasNewerTime = currTime > snapTime;
    const hasDifferentId = Boolean(originSnap.lastMessageId && threadRow.current_last_message_id && threadRow.current_last_message_id !== originSnap.lastMessageId);

    if (hasNewerTime || hasDifferentId) {
      const invRes = await client.query<IntegrationSuggestionRecord>(
        `UPDATE public.integration_suggestions
         SET status = 'invalidated',
             decided_by_user_id = $1,
             decided_at = clock_timestamp(),
             metadata = metadata || jsonb_build_object('invalidation_reason', 'Nova mensagem recebida após o snapshot de origem'),
             state_version = state_version + 1,
             updated_at = clock_timestamp()
         WHERE workspace_id = $2 AND id = $3
         RETURNING *;`,
        [decision.decidedByUserId, workspaceId, suggestionId]
      );
      return {
        ok: false,
        code: "ORIGIN_STALE_NEW_MESSAGE",
        reason: "Uma nova mensagem foi recebida na conversa após a geração da sugestão. O operador deve avaliar o contexto recente.",
        suggestion: invRes.rows[0] || null,
      };
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
    return {
      ok: false,
      code: "VERSION_MISMATCH",
      reason: "Falha concorrente ao atualizar sugestão",
      suggestion: null,
    };
  }

  return {
    ok: true,
    suggestion: updated,
  };
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
 * - Stable cursor pagination with ID tie-breaking (throws InvalidCursorError on malformed cursor)
 * - Single identity per candidate (LATERAL joins prevent row multiplication)
 * - Structured evidence, ruleVersion, moduleKey, reasonCode, snapshotRevision
 * - Strict exclusion of closed, handoff (waiting_human), opt-out contacts, and active cooldown
 * - Exclusion if workspace or radar module is disabled
 */
export async function listIntegrationCandidates(
  client: Pool | PoolClient,
  workspaceId: string,
  options: ListCandidatesOptions = {}
): Promise<{ items: GovernedCandidateRecord[]; total: number; nextCursor: string | null }> {
  // Check workspace and module enablement
  const wsRes = await client.query<{
    is_active: boolean;
    radar_enabled: boolean;
    radar_rule_version: string;
    radar_cooldown_seconds: number;
  }>(
    `SELECT is_active, radar_enabled, radar_rule_version, radar_cooldown_seconds
     FROM public.workspaces
     WHERE id = $1;`,
    [workspaceId]
  );

  const ws = wsRes.rows[0];
  if (!ws || !ws.is_active || !ws.radar_enabled) {
    return { items: [], total: 0, nextCursor: null };
  }

  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const minHours = Math.max(options.minHoursSinceLastMessage ?? 0, 0);
  const moduleKey = options.moduleKey || "radar_m01";
  const ruleVersion = ws.radar_rule_version || "1.0.0";
  const cooldownSeconds = ws.radar_cooldown_seconds || 86400;

  // Decode cursor if provided (throws InvalidCursorError if malformed)
  let cursorCondition = "";
  const queryParams: unknown[] = [workspaceId, minHours, cooldownSeconds];
  let paramIdx = 4;

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    cursorCondition = `AND (t.last_message_at, t.id) > ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`;
    queryParams.push(decoded.lastMessageAt, decoded.id);
    paramIdx += 2;
  }

  // Base WHERE: active or waiting_client ONLY, contacts not opted out,
  // AND no suggestion in cooldown (whether pending, accepted, or dismissed)
  const baseWhere = `
    WHERE t.workspace_id = $1
      AND t.status IN ('active', 'waiting_client')
      AND c.opt_out = false
      AND EXTRACT(EPOCH FROM (now() - t.last_message_at)) / 3600 >= $2
      AND NOT EXISTS (
        SELECT 1 FROM public.integration_suggestions s
        WHERE s.workspace_id = t.workspace_id
          AND s.thread_id = t.id
          AND s.module_key = 'radar_m01'
          AND (
            (s.status = 'pending' AND (s.expires_at IS NULL OR s.expires_at > clock_timestamp()))
            OR
            (s.created_at > clock_timestamp() - ($3 || ' seconds')::interval)
          )
      )
  `;

  // Count total eligible candidates
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM public.commercial_threads t
     JOIN public.contacts c ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     ${baseWhere};`,
    [workspaceId, minHours, cooldownSeconds]
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
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
     ) last_msg ON true
     LEFT JOIN LATERAL (
       SELECT id, stage, status
       FROM public.commercial_journeys
       WHERE workspace_id = t.workspace_id
         AND thread_id = t.id
         AND status = 'open'
       ORDER BY created_at DESC, id DESC
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
      .update(`${r.thread_id}:${r.contact_id}:${r.last_message_at_raw}:${r.last_message_id || ""}:${r.thread_status}:false`)
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
      ruleVersion,
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
