import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "../client";
import { recordSecurityAuditEvent, type SecurityAuditEventParams } from "../helpers";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_REGEX = /^\+[1-9][0-9]{6,14}$/;

export interface OutboundReplayProjection {
  commandId: string;
  workspaceId: string;
  channelInstanceId: string;
  messageId: string;
  threadId: string;
  contactId: string;
  payloadFingerprint: string | null;
  commandStatus: string;
  deliveryStatus: string;
  createdAt: Date;
}

export interface ChannelInstanceSummary {
  id: string;
  workspaceId: string;
  provider: string;
  phoneNumberE164: string | null;
  isActive: boolean;
}

export interface InsertOutboundMessageParams {
  workspaceId: string;
  channelInstanceId: string;
  threadId: string;
  provider: string;
  senderE164: string;
  recipientE164: string;
  contentType: string;
  body: string | null;
  mediaUrl?: string | null;
}

export interface InsertOutboundCommandParams {
  workspaceId: string;
  channelInstanceId: string;
  threadId: string;
  messageId: string;
  recipientE164: string;
  body: string;
  mediaUrl?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateComponents?: Record<string, unknown>[] | null;
  idempotencyKey: string;
  payloadFingerprint: string;
  maxRetries?: number;
}

export interface OutboundCommandCreatedRecord {
  id: string;
  workspaceId: string;
  channelInstanceId: string;
  threadId: string;
  messageId: string;
  recipientE164: string;
  body: string;
  mediaUrl: string | null;
  idempotencyKey: string;
  payloadFingerprint: string;
  status: string;
  createdAt: Date;
}

import { ChannelInstanceNotFoundError } from "./channel-instance.repository";
import { IdempotencyConflictError } from "./outbound-command.repository";

export { ChannelInstanceNotFoundError, IdempotencyConflictError };

export class IdempotencyRaceLostError extends Error {
  readonly code = "IDEMPOTENCY_RACE_LOST" as const;
  constructor(workspaceId: string, idempotencyKey: string) {
    super(
      `IDEMPOTENCY_RACE_LOST: Concurrent transaction already claimed idempotency key '${idempotencyKey}' in workspace '${workspaceId}'. Immediate rollback triggered.`
    );
    this.name = "IdempotencyRaceLostError";
  }
}

export class LegacyIdempotencyRecordError extends Error {
  readonly code = "LEGACY_IDEMPOTENCY_RECORD" as const;
  constructor(workspaceId: string, idempotencyKey: string) {
    super(
      `LEGACY_IDEMPOTENCY_RECORD: Pre-existing command with idempotency key '${idempotencyKey}' in workspace '${workspaceId}' lacks payload fingerprint. Replay fails closed.`
    );
    this.name = "LegacyIdempotencyRecordError";
  }
}


export class ChannelInstanceInactiveError extends Error {
  readonly code = "CHANNEL_INSTANCE_INACTIVE" as const;
  constructor(channelInstanceId: string) {
    super(
      `CHANNEL_INSTANCE_INACTIVE: Channel instance '${channelInstanceId}' is marked as inactive and cannot dispatch outbound messages.`
    );
    this.name = "ChannelInstanceInactiveError";
  }
}

export class OutboundProducerValidationError extends Error {
  readonly code = "OUTBOUND_PRODUCER_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(`OUTBOUND_PRODUCER_VALIDATION_ERROR: ${message}`);
    this.name = "OutboundProducerValidationError";
  }
}

/**
 * TransactionalOutboundProducerRepository
 *
 * Dedicated repository for the CH-11 Transactional Outbound Producer.
 * Operates strictly under tenant RLS (withTenantTransaction / sos_app_user).
 *
 * Invariants:
 * 1. Zero SELECT * from outbound_commands — explicit projections with relational INNER JOINs.
 * 2. Zero UPDATE on outbound_commands — uses ON CONFLICT DO NOTHING.
 * 3. Atomic message + command + audit logging in a single unit of work.
 */
export class TransactionalOutboundProducerRepository {
  private _pool?: Pool;

  constructor(pool?: Pool) {
    this._pool = pool;
  }

  private get pool(): Pool {
    if (!this._pool) {
      this._pool = getDatabasePool();
    }
    return this._pool;
  }

  /**
   * Performs canonical replay projection query joining outbound_commands, messages, and commercial_threads.
   * Resolves contactId and deliveryStatus with relational integrity under tenant RLS.
   */
  async findReplayProjection(
    params: { workspaceId: string; idempotencyKey: string },
    client?: PoolClient | Pool
  ): Promise<OutboundReplayProjection | null> {
    if (!UUID_REGEX.test(params.workspaceId)) {
      throw new OutboundProducerValidationError("Invalid workspaceId format");
    }
    if (!params.idempotencyKey || !params.idempotencyKey.trim()) {
      throw new OutboundProducerValidationError("idempotencyKey is required");
    }

    const executor = client || this.pool;


    const query = `
      SELECT 
        oc.id AS command_id,
        oc.workspace_id,
        oc.channel_instance_id,
        oc.message_id,
        oc.thread_id,
        ct.contact_id,
        oc.payload_fingerprint,
        oc.status AS command_status,
        m.delivery_status,
        oc.created_at
      FROM public.outbound_commands oc
      INNER JOIN public.messages m 
        ON oc.workspace_id = m.workspace_id 
       AND oc.channel_instance_id = m.channel_instance_id 
       AND oc.message_id = m.id
      INNER JOIN public.commercial_threads ct 
        ON oc.workspace_id = ct.workspace_id 
       AND oc.channel_instance_id = ct.channel_instance_id 
       AND oc.thread_id = ct.id
      WHERE oc.workspace_id = $1 
        AND oc.idempotency_key = $2;
    `;

    const res = await executor.query<{
      command_id: string;
      workspace_id: string;
      channel_instance_id: string;
      message_id: string;
      thread_id: string;
      contact_id: string;
      payload_fingerprint: string | null;
      command_status: string;
      delivery_status: string;
      created_at: Date;
    }>(query, [params.workspaceId, params.idempotencyKey]);

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0]!;
    return {
      commandId: row.command_id,
      workspaceId: row.workspace_id,
      channelInstanceId: row.channel_instance_id,
      messageId: row.message_id,
      threadId: row.thread_id,
      contactId: row.contact_id,
      payloadFingerprint: row.payload_fingerprint,
      commandStatus: row.command_status,
      deliveryStatus: row.delivery_status,
      createdAt: row.created_at,
    };
  }

  /**
   * Retrieves active channel instance details under tenant RLS.
   */
  async getChannelInstance(
    params: { workspaceId: string; channelInstanceId: string },
    client?: PoolClient | Pool
  ): Promise<ChannelInstanceSummary | null> {
    if (!UUID_REGEX.test(params.workspaceId)) {
      throw new OutboundProducerValidationError("Invalid workspaceId format");
    }
    if (!UUID_REGEX.test(params.channelInstanceId)) {
      throw new OutboundProducerValidationError("Invalid channelInstanceId format");
    }

    const executor = client || this.pool;
    const query = `

      SELECT id, workspace_id, provider, phone_number_e164, is_active
      FROM public.channel_instances
      WHERE workspace_id = $1 AND id = $2;
    `;

    const res = await executor.query<{
      id: string;
      workspace_id: string;
      provider: string;
      phone_number_e164: string | null;
      is_active: boolean;
    }>(query, [params.workspaceId, params.channelInstanceId]);

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      provider: row.provider,
      phoneNumberE164: row.phone_number_e164,
      isActive: row.is_active,
    };
  }

  /**
   * Upserts contact by phone_e164 within workspace under tenant RLS.
   */
  async upsertContact(
    params: { workspaceId: string; phoneE164: string },
    client: PoolClient
  ): Promise<string> {
    if (!UUID_REGEX.test(params.workspaceId)) {
      throw new OutboundProducerValidationError("Invalid workspaceId format");
    }
    if (!E164_REGEX.test(params.phoneE164)) {
      throw new OutboundProducerValidationError("Invalid phoneE164 format");
    }

    const query = `
      INSERT INTO public.contacts (workspace_id, phone_e164)
      VALUES ($1, $2)
      ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET updated_at = now()
      RETURNING id;
    `;

    const res = await client.query<{ id: string }>(query, [
      params.workspaceId,
      params.phoneE164,
    ]);
    return res.rows[0]!.id;
  }

  /**
   * Upserts commercial thread for (workspace_id, channel_instance_id, contact_id) under tenant RLS.
   */
  async upsertCommercialThread(
    params: { workspaceId: string; channelInstanceId: string; contactId: string },
    client: PoolClient
  ): Promise<string> {
    if (!UUID_REGEX.test(params.workspaceId)) {
      throw new OutboundProducerValidationError("Invalid workspaceId format");
    }
    if (!UUID_REGEX.test(params.channelInstanceId)) {
      throw new OutboundProducerValidationError("Invalid channelInstanceId format");
    }
    if (!UUID_REGEX.test(params.contactId)) {
      throw new OutboundProducerValidationError("Invalid contactId format");
    }

    const query = `
      INSERT INTO public.commercial_threads (
        workspace_id, channel_instance_id, contact_id, status, last_message_at
      ) VALUES ($1, $2, $3, 'active', now())
      ON CONFLICT (workspace_id, channel_instance_id, contact_id)
      DO UPDATE SET last_message_at = now(), updated_at = now()
      RETURNING id;
    `;

    const res = await client.query<{ id: string }>(query, [
      params.workspaceId,
      params.channelInstanceId,
      params.contactId,
    ]);
    return res.rows[0]!.id;
  }

  /**
   * Inserts an outbound message into messages table under tenant RLS.
   * Required FK constraint ensures message is inserted before outbound_command.
   */
  async insertMessage(
    params: InsertOutboundMessageParams,
    client: PoolClient
  ): Promise<{ id: string; deliveryStatus: string }> {
    if (!UUID_REGEX.test(params.workspaceId)) {
      throw new OutboundProducerValidationError("Invalid workspaceId format");
    }
    if (!UUID_REGEX.test(params.channelInstanceId)) {
      throw new OutboundProducerValidationError("Invalid channelInstanceId format");
    }
    if (!UUID_REGEX.test(params.threadId)) {
      throw new OutboundProducerValidationError("Invalid threadId format");
    }
    if (!E164_REGEX.test(params.senderE164)) {
      throw new OutboundProducerValidationError("Invalid senderE164 format");
    }
    if (!E164_REGEX.test(params.recipientE164)) {
      throw new OutboundProducerValidationError("Invalid recipientE164 format");
    }

    const query = `
      INSERT INTO public.messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, media_url,
        delivery_status, status_rank
      ) VALUES (
        $1, $2, $3, $4, 'outbound',
        $5, $6, $7, $8, $9,
        'queued', 0
      )
      RETURNING id, delivery_status;
    `;

    const res = await client.query<{ id: string; delivery_status: string }>(query, [
      params.workspaceId,
      params.channelInstanceId,
      params.threadId,
      params.provider,
      params.senderE164,
      params.recipientE164,
      params.contentType,
      params.body,
      params.mediaUrl || null,
    ]);

    return {
      id: res.rows[0]!.id,
      deliveryStatus: res.rows[0]!.delivery_status,
    };
  }

  /**
   * Inserts the outbox command into outbound_commands with ON CONFLICT DO NOTHING.
   * If a concurrent transaction won the race, returns null (caller will throw IdempotencyRaceLostError).
   */
  async insertOutboundCommand(
    params: InsertOutboundCommandParams,
    client: PoolClient
  ): Promise<OutboundCommandCreatedRecord | null> {
    if (!UUID_REGEX.test(params.workspaceId)) {
      throw new OutboundProducerValidationError("Invalid workspaceId format");
    }
    if (!UUID_REGEX.test(params.channelInstanceId)) {
      throw new OutboundProducerValidationError("Invalid channelInstanceId format");
    }
    if (!UUID_REGEX.test(params.threadId)) {
      throw new OutboundProducerValidationError("Invalid threadId format");
    }
    if (!UUID_REGEX.test(params.messageId)) {
      throw new OutboundProducerValidationError("Invalid messageId format");
    }
    if (!E164_REGEX.test(params.recipientE164)) {
      throw new OutboundProducerValidationError("Invalid recipientE164 format");
    }
    if (!params.idempotencyKey || !params.idempotencyKey.trim()) {
      throw new OutboundProducerValidationError("idempotencyKey is required");
    }
    if (!params.payloadFingerprint || !/^[0-9a-f]{64}$/.test(params.payloadFingerprint)) {
      throw new OutboundProducerValidationError("payloadFingerprint must be 64 hexadecimal characters");
    }

    const query = `
      INSERT INTO public.outbound_commands (
        workspace_id, channel_instance_id, thread_id, message_id,
        recipient_e164, body, media_url,
        template_name, template_language, template_components,
        idempotency_key, payload_fingerprint,
        status, retry_count, max_retries, next_attempt_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12,
        'pending', 0, COALESCE($13, 3), clock_timestamp()
      )
      ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
      RETURNING 
        id, workspace_id, channel_instance_id, thread_id, message_id,
        recipient_e164, body, media_url, idempotency_key, payload_fingerprint,
        status, created_at;
    `;

    const res = await client.query<{
      id: string;
      workspace_id: string;
      channel_instance_id: string;
      thread_id: string;
      message_id: string;
      recipient_e164: string;
      body: string;
      media_url: string | null;
      idempotency_key: string;
      payload_fingerprint: string;
      status: string;
      created_at: Date;
    }>(query, [
      params.workspaceId,
      params.channelInstanceId,
      params.threadId,
      params.messageId,
      params.recipientE164,
      params.body,
      params.mediaUrl || null,
      params.templateName || null,
      params.templateLanguage || null,
      params.templateComponents ? JSON.stringify(params.templateComponents) : null,
      params.idempotencyKey,
      params.payloadFingerprint,
      params.maxRetries ?? 3,
    ]);

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      channelInstanceId: row.channel_instance_id,
      threadId: row.thread_id,
      messageId: row.message_id,
      recipientE164: row.recipient_e164,
      body: row.body,
      mediaUrl: row.media_url,
      idempotencyKey: row.idempotency_key,
      payloadFingerprint: row.payload_fingerprint,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  /**
   * Records audit event synchronously on the same transaction client.
   */
  async recordAudit(
    params: SecurityAuditEventParams,
    client: PoolClient
  ): Promise<string> {
    return recordSecurityAuditEvent(params, client);
  }
}
