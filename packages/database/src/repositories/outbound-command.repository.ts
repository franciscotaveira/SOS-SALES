import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "../client";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164_REGEX = /^\+[1-9][0-9]{6,14}$/;

export type OutboundCommandStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "dead_letter"
  | "reconciliation_required";

export interface OutboundCommandRecord {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  thread_id: string | null;
  message_id: string;
  recipient_e164: string;
  body: string;
  media_url: string | null;
  template_name: string | null;
  template_language: string | null;
  template_components: Record<string, unknown>[] | null;
  interactive_payload?: Record<string, unknown> | null;
  idempotency_key: string;
  status: OutboundCommandStatus;
  retry_count: number;
  max_retries: number;
  next_attempt_at: Date;
  external_message_id: string | null;
  sent_at: Date | null;
  lease_until: Date | null;
  lease_token: string | null;
  worker_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClaimedOutboundCommand extends OutboundCommandRecord {
  previous_status: OutboundCommandStatus;
}

export interface ClaimedReconciliationCommand {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  message_id: string;
  recipient_e164: string;
  external_message_id: string | null;
  created_at: Date;
  retry_count: number;
  max_retries: number;
  lease_token: string;
}

export interface EnqueueOutboundCommandParams {
  workspaceId: string;
  channelInstanceId: string;
  messageId: string;
  threadId?: string | null;
  recipientE164: string;
  body: string;
  mediaUrl?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateComponents?: Record<string, unknown>[] | null;
  interactivePayload?: Record<string, unknown> | null;
  idempotencyKey: string;
  maxRetries?: number;
  nextAttemptAt?: Date;
}

export class FencingViolationError extends Error {
  readonly code = "FENCING_VIOLATION" as const;
  constructor(commandId: string, details = "Command lease expired or was reclaimed by another worker") {
    super(`FENCING_VIOLATION: Outbound command '${commandId}' update rejected: ${details}`);
    this.name = "FencingViolationError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT" as const;
  constructor(workspaceId: string, idempotencyKey: string, details = "Payload mismatch for existing idempotency key") {
    super(`IDEMPOTENCY_CONFLICT: Idempotency key '${idempotencyKey}' already exists in workspace '${workspaceId}' with different parameters (${details})`);
    this.name = "IdempotencyConflictError";
  }
}

export class OutboundCommandValidationError extends Error {
  readonly code = "OUTBOUND_COMMAND_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(`OUTBOUND_COMMAND_VALIDATION_ERROR: ${message}`);
    this.name = "OutboundCommandValidationError";
  }
}

export type PostSendReconciliationOutcomeType =
  | "transitioned_to_reconciliation"
  | "already_sent"
  | "already_dead_letter"
  | "ownership_lost"
  | "invalid_state";

export interface PostSendReconciliationOutcome {
  outcome: PostSendReconciliationOutcomeType;
  persistedExternalMessageId: string | null;
  persistedStatus: string | null;
}

export interface MarkPostSendReconciliationParams {
  workspaceId: string;
  commandId: string;
  workerId: string;
  leaseToken: string;
  externalMessageId: string;
  errorMessage: string;
}

/**
 * OutboundCommandRepository
 *
 * Transactional repository for guaranteed outbound message dispatch queue (public.outbound_commands).
 *
 * Guarantees:
 * 1. Multi-tenant RLS safety: all mutations validate workspace ownership.
 * 2. High-concurrency claiming with FOR UPDATE SKIP LOCKED.
 * 3. Lease-token fencing: markSent, markProcessing, markRetryableFailure, and markPermanentFailure
 *    verify worker_id and lease_token to eliminate split-brain dual writes.
 * 4. Persistent idempotency via UNIQUE (workspace_id, idempotency_key).
 * 5. Safe lease recovery without blind duplicate external dispatch.
 */
export class OutboundCommandRepository {
  constructor(private readonly pool: Pool = getDatabasePool()) {}

  /**
   * Enqueues an outbound dispatch command with persistent idempotency.
   * If a command with the same (workspace_id, idempotency_key) already exists:
   * - If message_id and channel_instance_id match: returns existing record (idempotent no-op).
   * - If message_id or channel_instance_id mismatch: throws IdempotencyConflictError.
   */
  async enqueueOutboundCommand(
    params: EnqueueOutboundCommandParams,
    client?: Pool | PoolClient
  ): Promise<OutboundCommandRecord> {
    if (!UUID_REGEX.test(params.workspaceId)) {
      throw new OutboundCommandValidationError("Invalid workspaceId format");
    }
    if (!UUID_REGEX.test(params.channelInstanceId)) {
      throw new OutboundCommandValidationError("Invalid channelInstanceId format");
    }
    if (!UUID_REGEX.test(params.messageId)) {
      throw new OutboundCommandValidationError("Invalid messageId format");
    }
    if (params.threadId && !UUID_REGEX.test(params.threadId)) {
      throw new OutboundCommandValidationError("Invalid threadId format");
    }
    if (!E164_REGEX.test(params.recipientE164)) {
      throw new OutboundCommandValidationError("Invalid recipientE164 format (must be E.164 format e.g. +5511999998888)");
    }
    if (!params.idempotencyKey || typeof params.idempotencyKey !== "string" || !params.idempotencyKey.trim()) {
      throw new OutboundCommandValidationError("idempotencyKey is required");
    }

    const executor = client || this.pool;

    const query = `
      INSERT INTO public.outbound_commands (
        workspace_id, channel_instance_id, message_id, thread_id,
        recipient_e164, body, media_url,
        template_name, template_language, template_components,
        interactive_payload,
        idempotency_key, max_retries, next_attempt_at, status
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11,
        $12, COALESCE($13, 3), COALESCE($14, clock_timestamp()), 'pending'
      )
      ON CONFLICT (workspace_id, idempotency_key)
      DO UPDATE SET updated_at = public.outbound_commands.updated_at
      RETURNING *;
    `;

    const res = await executor.query<OutboundCommandRecord>(query, [
      params.workspaceId,
      params.channelInstanceId,
      params.messageId,
      params.threadId || null,
      params.recipientE164,
      params.body,
      params.mediaUrl || null,
      params.templateName || null,
      params.templateLanguage || null,
      params.templateComponents ? JSON.stringify(params.templateComponents) : null,
      params.interactivePayload ? JSON.stringify(params.interactivePayload) : null,
      params.idempotencyKey,
      params.maxRetries ?? 3,
      params.nextAttemptAt || null,
    ]);

    const record = res.rows[0]!;

    // Verify idempotency payload consistency
    if (
      record.channel_instance_id !== params.channelInstanceId ||
      record.message_id !== params.messageId
    ) {
      throw new IdempotencyConflictError(
        params.workspaceId,
        params.idempotencyKey,
        `channel_instance_id or message_id differs from existing command ${record.id}`
      );
    }

    return record;
  }

  /**
   * Concurrently claims a batch of eligible outbound commands using FOR UPDATE SKIP LOCKED.
   *
   * Eligible items:
   * 1. status IN ('pending', 'failed') AND next_attempt_at <= clock_timestamp() AND (lease_until IS NULL OR lease_until < clock_timestamp())
   * 2. status = 'processing' AND lease_until < clock_timestamp() (expired lease recovery)
   *
   * Enforces retry boundary check:
   * Only claims pending/failed items if retry_count < max_retries to ensure
   * LEAST(retry_count + 1, max_retries) never violates CHECK (retry_count <= max_retries).
   */
  async claimPendingBatch(
    workerId: string,
    limit = 10,
    leaseSeconds = 30,
    client?: Pool | PoolClient
  ): Promise<ClaimedOutboundCommand[]> {
    const executor = client || this.pool;

    const query = `
      WITH claimed AS (
        SELECT id, status AS previous_status
        FROM public.outbound_commands
        WHERE status IN ('pending', 'failed')
          AND next_attempt_at <= clock_timestamp()
          AND (lease_until IS NULL OR lease_until < clock_timestamp())
          AND retry_count < max_retries
        ORDER BY next_attempt_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.outbound_commands o
      SET 
        status = 'processing',
        worker_id = $1,
        lease_token = gen_random_uuid(),
        lease_until = clock_timestamp() + ($3 || ' seconds')::interval,
        retry_count = LEAST(o.retry_count + 1, o.max_retries),
        updated_at = clock_timestamp()
      FROM claimed
      WHERE o.id = claimed.id
      RETURNING o.id, o.workspace_id, o.channel_instance_id, o.thread_id, o.message_id,
                o.recipient_e164, o.body, o.media_url, o.idempotency_key,
                o.status, o.retry_count, o.max_retries, o.next_attempt_at,
                o.external_message_id, o.sent_at, o.lease_until,
                o.lease_token::text, o.worker_id, o.error_message,
                o.created_at, o.updated_at,
                o.template_name, o.template_language, o.template_components,
                o.interactive_payload,
                claimed.previous_status;
    `;

    const res = await executor.query<ClaimedOutboundCommand>(query, [
      workerId,
      Math.max(1, limit),
      Math.max(1, leaseSeconds),
    ]);
    return res.rows;
  }

  /**
   * Extends the lease for an in-flight command (heartbeat).
   * Strictly requires unexpired lease (lease_until >= clock_timestamp()) to prevent resurrecting abandoned leases.
   */
  async markProcessing(
    commandId: string,
    workerId: string,
    leaseToken: string,
    extendSeconds = 30,
    client?: Pool | PoolClient
  ): Promise<boolean> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET lease_until = clock_timestamp() + ($1 || ' seconds')::interval,
           updated_at = clock_timestamp()
       WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid AND lease_until >= clock_timestamp();`,
      [Math.max(1, extendSeconds), commandId, workerId, leaseToken]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Finalizes an outbound command as successfully sent.
   *
   * Invariant: Must be executed under tenant RLS context (e.g. within withWorkerTransaction)
   * because RLS policy blocks status = 'sent' when app.current_workspace_id is NULL.
   * Requires active, unexpired lease (lease_until >= clock_timestamp()).
   */
  async markSent(
    commandId: string,
    workerId: string,
    leaseToken: string,
    externalMessageId: string,
    sentAt: Date = new Date(),
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET status = 'sent',
           external_message_id = $1,
           sent_at = $2,
           lease_until = NULL,
           error_message = NULL,
           updated_at = clock_timestamp()
       WHERE id = $3 AND status = 'processing' AND worker_id = $4 AND lease_token = $5::uuid AND lease_until >= clock_timestamp();`,
      [externalMessageId, sentAt, commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(commandId, "Failed to transition to 'sent' (lease expired or reclaimed)");
    }
  }

  /**
   * Marks a command for retry with exponential backoff after a transient failure.
   * Requires active, unexpired lease (lease_until >= clock_timestamp()).
   */
  async markRetryableFailure(
    commandId: string,
    workerId: string,
    leaseToken: string,
    errorMessage: string,
    nextAttemptAt: Date,
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET status = 'failed',
           next_attempt_at = $1,
           error_message = $2,
           lease_until = NULL,
           updated_at = clock_timestamp()
       WHERE id = $3 AND status = 'processing' AND worker_id = $4 AND lease_token = $5::uuid AND lease_until >= clock_timestamp();`,
      [nextAttemptAt, errorMessage, commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(commandId, "Failed to transition to 'failed' (lease expired or reclaimed)");
    }
  }

  /**
   * Permanently marks a command as dead_letter (unrecoverable or exhausted retries).
   * Requires active, unexpired lease (lease_until >= clock_timestamp()).
   */
  async markPermanentFailure(
    commandId: string,
    workerId: string,
    leaseToken: string,
    errorMessage: string,
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET status = 'dead_letter',
           error_message = $1,
           lease_until = NULL,
           updated_at = clock_timestamp()
       WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid AND lease_until >= clock_timestamp();`,
      [errorMessage, commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(commandId, "Failed to transition to 'dead_letter' (lease expired or reclaimed)");
    }
  }

  /**
   * Marks a command as reconciliation_required when external response was ambiguous
   * (e.g. network timeout or socket reset where external provider may have received the message).
   * Requires active, unexpired lease (lease_until >= clock_timestamp()).
   */
  async markReconciliationRequired(
    commandId: string,
    workerId: string,
    leaseToken: string,
    errorMessage: string,
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET status = 'reconciliation_required',
           error_message = $1,
           lease_until = NULL,
           updated_at = clock_timestamp()
       WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid AND lease_until >= clock_timestamp();`,
      [errorMessage, commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(commandId, "Failed to transition to 'reconciliation_required' (lease expired or reclaimed)");
    }
  }

  /**
   * Monotonically transitions an outbound command to 'reconciliation_required' post-send,
   * strictly preventing terminal state regression ('sent' or 'dead_letter'),
   * enforcing atomic fencing, and preserving confirmed externalMessageId.
   */
  async markPostSendReconciliationRequired(
    params: MarkPostSendReconciliationParams,
    client?: Pool | PoolClient
  ): Promise<PostSendReconciliationOutcome>;
  async markPostSendReconciliationRequired(
    workspaceId: string,
    commandId: string,
    workerId: string,
    leaseToken: string,
    externalMessageId: string,
    errorMessage: string,
    client?: Pool | PoolClient
  ): Promise<PostSendReconciliationOutcome>;
  async markPostSendReconciliationRequired(
    workspaceIdOrParams: string | MarkPostSendReconciliationParams,
    commandIdOrClient?: string | Pool | PoolClient,
    workerId?: string,
    leaseToken?: string,
    externalMessageId?: string,
    errorMessage?: string,
    client?: Pool | PoolClient
  ): Promise<PostSendReconciliationOutcome> {
    let workspaceId: string;
    let commandId: string;
    let wId: string;
    let lToken: string;
    let extMsgId: string;
    let errMsg: string;
    let executor: Pool | PoolClient;

    if (typeof workspaceIdOrParams === "object") {
      workspaceId = workspaceIdOrParams.workspaceId;
      commandId = workspaceIdOrParams.commandId;
      wId = workspaceIdOrParams.workerId;
      lToken = workspaceIdOrParams.leaseToken;
      extMsgId = workspaceIdOrParams.externalMessageId;
      errMsg = workspaceIdOrParams.errorMessage;
      executor = (commandIdOrClient as Pool | PoolClient) || this.pool;
    } else {
      workspaceId = workspaceIdOrParams;
      commandId = commandIdOrClient as string;
      wId = workerId!;
      lToken = leaseToken!;
      extMsgId = externalMessageId!;
      errMsg = errorMessage!;
      executor = client || this.pool;
    }

    const isValidUuid = (val?: string): boolean =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    if (!isValidUuid(commandId) || !isValidUuid(workspaceId)) {
      return {
        outcome: "invalid_state",
        persistedExternalMessageId: null,
        persistedStatus: null,
      };
    }

    const query = `
      WITH current_row AS (
        SELECT id, workspace_id, status, worker_id, lease_token, lease_until, external_message_id
        FROM public.outbound_commands
        WHERE id = $1 AND workspace_id = $2
        FOR UPDATE
      ),
      updated AS (
        UPDATE public.outbound_commands o
        SET status = 'reconciliation_required',
            external_message_id = COALESCE(o.external_message_id, NULLIF($3, '')),
            error_message = $4,
            lease_until = NULL,
            lease_token = NULL,
            worker_id = NULL,
            updated_at = clock_timestamp()
        FROM current_row c
        WHERE o.id = c.id
          AND c.worker_id = $5
          AND c.lease_token::text = $6
          AND (
            c.status = 'processing'
            OR c.status = 'reconciliation_required'
          )
        RETURNING o.id, o.status AS new_status, o.external_message_id AS new_ext_id
      )
      SELECT 
        c.status AS initial_status,
        c.worker_id AS initial_worker_id,
        c.lease_token::text AS initial_lease_token,
        c.external_message_id AS initial_ext_id,
        u.new_status,
        u.new_ext_id
      FROM current_row c
      LEFT JOIN updated u ON u.id = c.id;
    `;

    const res = await executor.query<{
      initial_status: string;
      initial_worker_id: string | null;
      initial_lease_token: string | null;
      initial_ext_id: string | null;
      new_status: string | null;
      new_ext_id: string | null;
    }>(query, [commandId, workspaceId, extMsgId, errMsg, wId, lToken]);

    if (res.rows.length === 0) {
      return {
        outcome: "invalid_state",
        persistedExternalMessageId: null,
        persistedStatus: null,
      };
    }

    const row = res.rows[0]!;

    if (row.initial_status === "sent") {
      return {
        outcome: "already_sent",
        persistedExternalMessageId: row.initial_ext_id,
        persistedStatus: "sent",
      };
    }

    if (row.initial_status === "dead_letter") {
      return {
        outcome: "already_dead_letter",
        persistedExternalMessageId: row.initial_ext_id,
        persistedStatus: "dead_letter",
      };
    }

    if (row.new_status === "reconciliation_required") {
      return {
        outcome: "transitioned_to_reconciliation",
        persistedExternalMessageId: row.new_ext_id,
        persistedStatus: "reconciliation_required",
      };
    }

    if (row.initial_status === "processing" || row.initial_status === "reconciliation_required") {
      return {
        outcome: "ownership_lost",
        persistedExternalMessageId: row.initial_ext_id,
        persistedStatus: row.initial_status,
      };
    }

    return {
      outcome: "invalid_state",
      persistedExternalMessageId: row.initial_ext_id,
      persistedStatus: row.initial_status,
    };
  }

  /**
   * Reclaims abandoned processing leases and routes them safely to reconciliation_required
   * to guarantee zero blind duplicate external dispatches after crashes.
   */
  async reclaimExpiredLeases(
    limit = 10,
    client?: Pool | PoolClient
  ): Promise<number> {
    const executor = client || this.pool;
    const query = `
      WITH expired AS (
        SELECT id
        FROM public.outbound_commands
        WHERE status = 'processing'
          AND lease_until < clock_timestamp()
        ORDER BY lease_until ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.outbound_commands o
      SET status = 'reconciliation_required',
          error_message = 'ERR_LEASE_EXPIRED_DURING_PROCESSING',
          lease_until = NULL,
          lease_token = NULL,
          worker_id = NULL,
          updated_at = clock_timestamp()
      FROM expired
      WHERE o.id = expired.id
      RETURNING o.id;
    `;

    const res = await executor.query(query, [Math.max(1, limit)]);
    return res.rowCount ?? 0;
  }

  /**
   * Claims a batch of ambiguous outbound commands requiring reconciliation using SKIP LOCKED.
   */
  async claimReconciliationBatch(
    workerId: string,
    limit = 10,
    leaseSeconds = 30,
    client?: Pool | PoolClient
  ): Promise<ClaimedReconciliationCommand[]> {
    const executor = client || this.pool;
    const query = `
      WITH claimed AS (
        SELECT id
        FROM public.outbound_commands
        WHERE status = 'reconciliation_required'
          AND (lease_until IS NULL OR lease_until < clock_timestamp())
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.outbound_commands o
      SET lease_until = clock_timestamp() + ($3 || ' seconds')::interval,
          lease_token = gen_random_uuid(),
          worker_id = $1,
          updated_at = clock_timestamp()
      FROM claimed
      WHERE o.id = claimed.id
      RETURNING o.id, o.workspace_id, o.channel_instance_id, o.message_id,
                o.recipient_e164, o.external_message_id, o.created_at,
                o.retry_count, o.max_retries, o.lease_token::text;
    `;

    const res = await executor.query<ClaimedReconciliationCommand>(query, [
      workerId,
      Math.max(1, limit),
      Math.max(1, leaseSeconds),
    ]);
    return res.rows;
  }

  /**
   * Resolves a reconciliation command as sent when delivery event confirmed provider acceptance.
   */
  async resolveReconciliationSent(
    commandId: string,
    workerId: string,
    leaseToken: string,
    externalMessageId: string,
    errorMessage = "Reconciled: Delivery event confirmed by provider",
    sentAt: Date = new Date(),
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET status = 'sent',
           external_message_id = COALESCE(external_message_id, $1),
           sent_at = COALESCE(sent_at, $2),
           lease_until = NULL,
           error_message = $3,
           updated_at = clock_timestamp()
       WHERE id = $4 AND status = 'reconciliation_required' AND worker_id = $5 AND lease_token = $6::uuid;`,
      [externalMessageId, sentAt, errorMessage, commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(
        commandId,
        "Failed to resolve reconciliation to 'sent' (lease expired or reclaimed)"
      );
    }
  }

  /**
   * Resolves a reconciliation command as dead_letter when delivery event confirms delivery failure
   * or when reconciliation TTL has expired with retries exhausted.
   */
  async resolveReconciliationDeadLetter(
    commandId: string,
    workerId: string,
    leaseToken: string,
    errorMessage: string,
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET status = 'dead_letter',
           lease_until = NULL,
           error_message = $1,
           updated_at = clock_timestamp()
       WHERE id = $2 AND status = 'reconciliation_required' AND worker_id = $3 AND lease_token = $4::uuid;`,
      [errorMessage, commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(
        commandId,
        "Failed to resolve reconciliation to 'dead_letter' (lease expired or reclaimed)"
      );
    }
  }

  /**
   * Reschedules a reconciliation command back to 'pending' after grace period when retries remain.
   */
  async resolveReconciliationRetry(
    commandId: string,
    workerId: string,
    leaseToken: string,
    nextAttemptAt: Date,
    errorMessage: string,
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET status = 'pending',
           retry_count = LEAST(retry_count + 1, max_retries),
           next_attempt_at = $1,
           lease_until = NULL,
           error_message = $2,
           updated_at = clock_timestamp()
       WHERE id = $3 AND status = 'reconciliation_required' AND worker_id = $4 AND lease_token = $5::uuid;`,
      [nextAttemptAt, errorMessage, commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(
        commandId,
        "Failed to resolve reconciliation to 'pending' (lease expired or reclaimed)"
      );
    }
  }

  /**
   * Releases lease on a reconciliation command still within its grace period.
   */
  async releaseReconciliationLease(
    commandId: string,
    workerId: string,
    leaseToken: string,
    client?: Pool | PoolClient
  ): Promise<void> {
    const executor = client || this.pool;
    const res = await executor.query(
      `UPDATE public.outbound_commands
       SET lease_until = NULL,
           updated_at = clock_timestamp()
       WHERE id = $1 AND status = 'reconciliation_required' AND worker_id = $2 AND lease_token = $3::uuid;`,
      [commandId, workerId, leaseToken]
    );

    if ((res.rowCount ?? 0) === 0) {
      throw new FencingViolationError(
        commandId,
        "Failed to release reconciliation lease (lease expired or reclaimed)"
      );
    }
  }

  /**
   * Administrative reconciliation update on a command in reconciliation_required.
   * Generates tamper-proof audit_events log.
   */
  async adminReconcile(
    workspaceId: string,
    commandId: string,
    resolution: "sent" | "dead_letter" | "retry",
    options: {
      externalMessageId?: string;
      adminNote?: string;
      actorId?: string;
    } = {},
    client?: Pool | PoolClient
  ): Promise<{ messageId: string; channelInstanceId: string } | null> {
    const executor = client || this.pool;
    const cmdRes = await executor.query<{ message_id: string; channel_instance_id: string }>(
      `SELECT message_id, channel_instance_id FROM public.outbound_commands
       WHERE id = $1 AND workspace_id = $2 AND status = 'reconciliation_required'
       FOR UPDATE;`,
      [commandId, workspaceId]
    );

    const cmd = cmdRes.rows[0];
    if (!cmd) {
      return null;
    }

    if (resolution === "sent") {
      if (
        !options.externalMessageId ||
        typeof options.externalMessageId !== "string" ||
        !options.externalMessageId.trim()
      ) {
        throw new Error("ADMIN_RECONCILE_ERROR: externalMessageId is mandatory for manual 'sent' resolution");
      }
      if (options.externalMessageId.startsWith("manual-recon-")) {
        throw new Error("ADMIN_RECONCILE_ERROR: Artificial externalMessageId is strictly prohibited for 'sent' resolution");
      }
      await executor.query(
        `UPDATE public.outbound_commands
         SET status = 'sent', external_message_id = $1, sent_at = clock_timestamp(),
             error_message = $2, lease_until = NULL, updated_at = clock_timestamp()
         WHERE id = $3;`,
        [options.externalMessageId, options.adminNote || "Reconciled externally verified sent", commandId]
      );
      if (cmd.message_id) {
        await executor.query(
          `UPDATE public.messages
           SET delivery_status = 'sent', status_rank = 10, provider_message_id = $1, updated_at = clock_timestamp()
           WHERE id = $2 AND workspace_id = $3;`,
          [options.externalMessageId, cmd.message_id, workspaceId]
        );
      }
    } else if (resolution === "dead_letter") {
      await executor.query(
        `UPDATE public.outbound_commands
         SET status = 'dead_letter', error_message = $1, lease_until = NULL, updated_at = clock_timestamp()
         WHERE id = $2;`,
        [options.adminNote || "Reconciled as dead_letter by administrator", commandId]
      );
      if (cmd.message_id) {
        await executor.query(
          `UPDATE public.messages
           SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
           WHERE id = $1 AND workspace_id = $2;`,
          [cmd.message_id, workspaceId]
        );
      }
    } else if (resolution === "retry") {
      await executor.query(
        `UPDATE public.outbound_commands
         SET status = 'pending', retry_count = 0, next_attempt_at = clock_timestamp(),
             error_message = $1, lease_until = NULL, updated_at = clock_timestamp()
         WHERE id = $2;`,
        [options.adminNote || "Reconciled: reset to pending for retry by administrator", commandId]
      );
    }

    // Insert immutable audit event
    const actorId = options.actorId || "00000000-0000-0000-0000-000000000000";
    await executor.query(
      `INSERT INTO public.audit_events (
         workspace_id, actor_id, actor_type, action, resource_type, resource_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        workspaceId,
        actorId,
        "admin",
        `outbox.reconcile.${resolution}`,
        "outbound_commands",
        commandId,
        JSON.stringify({
          resolution,
          externalMessageId: options.externalMessageId || null,
          adminNote: options.adminNote || null,
        }),
      ]
    );

    return { messageId: cmd.message_id, channelInstanceId: cmd.channel_instance_id };
  }
}

