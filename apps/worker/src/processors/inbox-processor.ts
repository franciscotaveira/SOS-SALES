import type { Pool } from "pg";
import {
  decryptPayload,
  parseKeyringFromEnv,
  withWorkerTransaction,
  type Keyring,
} from "@sos-sales/database";
import {
  DELIVERY_STATUS_RANK,
  type MessageDeliveryStatus,
  type NormalizedInboundEvent,
} from "@sos-sales/contracts";
import {
  WabaWebhookNormalizer,
  WahaWebhookNormalizer,
  EvolutionWebhookNormalizer,
  QueueRetryPolicy,
} from "@sos-sales/application";
import { logger } from "@sos-sales/observability";
import {
  AiReceptionistProcessor,
  type AiReceptionistInboundEvent,
} from "./ai-receptionist.processor";

export interface ClaimedInboxItem {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  encrypted_payload: string;
  payload_iv: string;
  payload_auth_tag: string;
  key_version: number;
  retry_count: number;
  max_retries: number;
  raw_payload_hash: string;
  lease_token: string;
  received_at?: string | Date;
}

export interface InboxProcessorOptions {
  readonly masterKeyHex?: string;
  readonly keyring?: Keyring;
  readonly aiReceptionistProcessor?: AiReceptionistProcessor;
}

function coerceWahaJid(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record._serialized === "string") return record._serialized;
  if (typeof record.id === "string") return record.id;
  if (typeof record.user === "string" && typeof record.server === "string") {
    return `${record.user}@${record.server}`;
  }
  return "";
}

async function resolveWahaLid(jid: string, session: string): Promise<string> {
  if (!jid.endsWith("@lid")) return jid;
  const baseUrl = process.env.WAHA_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("WAHA_LID_RESOLUTION_ERROR: WAHA_BASE_URL and WAHA_API_KEY are required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `${baseUrl}/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(jid)}`,
      { headers: { "X-Api-Key": apiKey }, signal: controller.signal }
    );
    if (!response.ok) {
      throw new Error(`WAHA_LID_RESOLUTION_ERROR: WAHA returned HTTP ${response.status}`);
    }
    const data = (await response.json()) as { pn?: string };
    const resolved = coerceWahaJid(data.pn);
    if (!resolved || resolved.endsWith("@lid")) {
      throw new Error("WAHA_LID_RESOLUTION_ERROR: WAHA did not return a phone JID");
    }
    return resolved;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichWahaPayload(
  rawPayload: Record<string, unknown>,
  channelPhoneE164?: string | null
): Promise<Record<string, unknown>> {
  if (rawPayload.event !== "message") return rawPayload;
  const payload = rawPayload.payload;
  if (!payload || typeof payload !== "object") return rawPayload;
  const source = payload as Record<string, unknown>;
  const session = String(source.session ?? rawPayload.session ?? process.env.WAHA_DEFAULT_SESSION ?? "default");
  const fromMe = Boolean(source.fromMe);
  const channelJid = channelPhoneE164
    ? `${channelPhoneE164.replace(/\D/g, "")}@c.us`
    : "";
  const from = coerceWahaJid(source.from) || (fromMe ? channelJid : "");
  const to = coerceWahaJid(source.to) || (!fromMe ? channelJid : "");

  return {
    ...rawPayload,
    payload: {
      ...source,
      from: await resolveWahaLid(from, session),
      to: await resolveWahaLid(to, session),
      session,
    },
  };
}

export class InboxProcessor {
  private readonly keyringOrKey: string | Keyring;
  private readonly aiReceptionistProcessor: AiReceptionistProcessor;

  constructor(options: InboxProcessorOptions = {}) {
    this.aiReceptionistProcessor =
      options.aiReceptionistProcessor || new AiReceptionistProcessor();

    if (options.keyring && Object.keys(options.keyring).length > 0) {
      this.keyringOrKey = options.keyring;
    } else {
      const parsedEnv = parseKeyringFromEnv();
      if (parsedEnv) {
        this.keyringOrKey = parsedEnv.keyring;
      } else {
        const key =
          options.masterKeyHex ||
          process.env.MCT_CREDENTIALS_MASTER_KEY ||
          process.env.APP_MASTER_KEY;
        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          throw new Error(
            "INBOX_PROCESSOR_ERROR: Master key must be provided as a 64-character hex string or versioned keyring"
          );
        }
        this.keyringOrKey = key;
      }
    }
  }

  /**
   * Concurrently claims a batch of eligible inbox items using SKIP LOCKED and lease fencing.
   * Eligible items:
   * 1. status = 'pending' AND next_attempt_at <= clock_timestamp()
   * 2. status = 'failed' AND next_attempt_at <= clock_timestamp()
   * 3. status = 'processing' AND lease_until < clock_timestamp() (expired lease recovery)
   *
   * Invariant: Strictly select retry_count < max_retries to NEVER violate check constraint.
   */
  async claimBatch(
    pool: Pool,
    workerId: string,
    limit = 10
  ): Promise<ClaimedInboxItem[]> {
    const query = `
      WITH claimed AS (
        SELECT id
        FROM public.channel_webhook_inbox
        WHERE (
          (status IN ('pending', 'failed') AND next_attempt_at <= clock_timestamp() AND (lease_until IS NULL OR lease_until < clock_timestamp()))
          OR
          (status = 'processing' AND lease_until < clock_timestamp())
        )
        AND (
          (status IN ('pending', 'failed') AND retry_count < max_retries)
          OR
          (status = 'processing')
        )
        ORDER BY next_attempt_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.channel_webhook_inbox i
      SET 
        status = 'processing',
        worker_id = $1,
        lease_token = gen_random_uuid(),
        lease_until = clock_timestamp() + INTERVAL '30 seconds',
        retry_count = LEAST(i.retry_count + 1, i.max_retries)
      FROM claimed
      WHERE i.id = claimed.id
      RETURNING i.id, i.workspace_id, i.channel_instance_id, i.encrypted_payload, 
                i.payload_iv, i.payload_auth_tag, i.key_version, i.retry_count, i.max_retries, 
                i.raw_payload_hash, i.lease_token::text, i.received_at;
    `;

    const res = await pool.query<ClaimedInboxItem>(query, [workerId, limit]);
    return res.rows;
  }

  /**
   * Renews the lease for a currently running task to prevent lease expiry during long processing.
   */
  async renewLease(
    pool: Pool,
    itemId: string,
    workerId: string,
    leaseToken: string,
    extendSeconds = 30
  ): Promise<boolean> {
    const res = await pool.query(
      `UPDATE public.channel_webhook_inbox
       SET lease_until = clock_timestamp() + ($1 || ' seconds')::interval
       WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
      [extendSeconds, itemId, workerId, leaseToken]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Processes a single claimed inbox item through decryption (with AAD), normalization,
   * tenant-scoped transaction, status finalization, and fencing validation.
   */
  async processItem(
    pool: Pool,
    item: ClaimedInboxItem,
    workerId: string,
    signal?: AbortSignal
  ): Promise<{ success: boolean; eventCount: number }> {
    // Reset lease clock so the item gets a fresh 30-second window when execution begins
    const initialLease = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
    if (!initialLease) {
      logger.warn(
        { inboxId: item.id, workerId },
        "Fencing violation: Inbox item lease expired or was reclaimed before execution"
      );
      return { success: false, eventCount: 0 };
    }

    const abortController = new AbortController();
    const effectiveSignal = signal
      ? AbortSignal.any([signal, abortController.signal])
      : abortController.signal;

    // Active heartbeat: renew lease every 10 seconds while item is being processed
    const heartbeatInterval = setInterval(async () => {
      try {
        const renewed = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
        if (!renewed) {
          logger.warn(
            { inboxId: item.id, workerId },
            "Lease lost during inbox heartbeat renewal, aborting in-flight processing"
          );
          abortController.abort(
            new Error(`FENCING_LEASE_LOST: Inbox item ${item.id} lease expired or stolen during processing`)
          );
        }
      } catch (err) {
        logger.warn({ inboxId: item.id, workerId, err }, "Heartbeat lease renewal failed");
      }
    }, 10_000);

    try {
      if (effectiveSignal.aborted) {
        throw new Error("FENCING_PRE_PROCESS_ABORT: Processing was aborted by signal before execution");
      }
      // 1. Decrypt raw payload validating AAD and resolving key from keyring by version
      const aad = `${item.workspace_id}:${item.channel_instance_id}:${item.raw_payload_hash}`;
      const rawPayloadStr = decryptPayload(
        item.encrypted_payload,
        item.payload_iv,
        item.payload_auth_tag,
        this.keyringOrKey,
        { aad, keyVersion: item.key_version }
      );
      let rawPayload = JSON.parse(rawPayloadStr) as Record<string, unknown>;

      let eventCount = 0;
      const pendingAiEvents: AiReceptionistInboundEvent[] = [];

      // 2. Ingest normalized events within tenant transaction under sos_worker_user
      await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          // Look up channel instance details inside tenant scope with RLS active
          const channelRes = await client.query<{
            provider: string;
            is_active: boolean;
            phone_number_e164: string | null;
          }>(
            `SELECT provider, is_active, phone_number_e164 FROM public.channel_instances WHERE id = $1 AND workspace_id = $2 LIMIT 1;`,
            [item.channel_instance_id, item.workspace_id]
          );

          if (channelRes.rows.length === 0) {
            throw new Error(
              `Channel instance ${item.channel_instance_id} not found in workspace ${item.workspace_id}`
            );
          }

          const channel = channelRes.rows[0]!;
          const provider = channel.provider;

          // Normalize inbound events based on provider (FAIL-CLOSED on unknown provider)
          let events: NormalizedInboundEvent[] = [];
          const context = {
            channelInstanceId: item.channel_instance_id,
            workspaceId: item.workspace_id,
            rawPayloadHash: item.raw_payload_hash,
            receivedAt: item.received_at ? new Date(item.received_at).toISOString() : new Date().toISOString(),
          };

          if (provider === "meta_waba") {
            events = WabaWebhookNormalizer.normalize(rawPayload, context);
          } else if (provider === "waha") {
            rawPayload = await enrichWahaPayload(rawPayload, channel.phone_number_e164);
            events = WahaWebhookNormalizer.normalize(rawPayload, context);
          } else if (provider === "evolution") {
            events = EvolutionWebhookNormalizer.normalize(rawPayload, context);
          } else {
            throw new Error(
              `FAIL_CLOSED: Unsupported or unknown channel provider '${provider}' for inbox item ${item.id}`
            );
          }

          if (events.length === 0) {
            logger.info({ inboxId: item.id, provider }, "Inbox item produced zero normalized events");
          }

          eventCount = events.length;
          for (const normEvent of events) {
            if (normEvent.kind === "message") {
              const event = normEvent.event;
              const direction = event.metadata?.direction === "outbound" ? "outbound" : "inbound";
              const contactPhoneE164 = direction === "outbound"
                ? event.recipientPhoneE164
                : event.senderPhoneE164;
              // Upsert contact (BSUID / Username / Phone E.164)
              const contactName = direction === "inbound"
                ? ((event.metadata?.contactName as string) || (event.metadata?.senderName as string) || null)
                : null;
              const bsuid = (event.metadata?.bsuid as string) || (event.metadata?.userId as string) || null;
              const username = (event.metadata?.username as string) || null;

              let contactId: string;
              if (bsuid) {
                const bsuidRes = await client.query<{ id: string }>(
                  `INSERT INTO public.contacts (workspace_id, phone_e164, name, bsuid, username)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (workspace_id, bsuid) WHERE bsuid IS NOT NULL
                   DO UPDATE SET 
                     name = COALESCE(EXCLUDED.name, contacts.name),
                     phone_e164 = COALESCE(EXCLUDED.phone_e164, contacts.phone_e164),
                     username = COALESCE(EXCLUDED.username, contacts.username),
                     updated_at = clock_timestamp()
                   RETURNING id;`,
                  [item.workspace_id, contactPhoneE164, contactName, bsuid, username]
                );
                contactId = bsuidRes.rows[0]!.id;
              } else {
                const contactRes = await client.query<{ id: string }>(
                  `INSERT INTO public.contacts (workspace_id, phone_e164, name, username)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (workspace_id, phone_e164)
                   DO UPDATE SET 
                     name = COALESCE(EXCLUDED.name, contacts.name),
                     username = COALESCE(EXCLUDED.username, contacts.username),
                     updated_at = clock_timestamp()
                   RETURNING id;`,
                  [item.workspace_id, contactPhoneE164, contactName, username]
                );
                contactId = contactRes.rows[0]!.id;
              }

              // Upsert commercial thread
              const threadRes = await client.query<{ id: string }>(
                `INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
                 VALUES ($1, $2, $3, 'active', $4::timestamptz)
                 ON CONFLICT (workspace_id, channel_instance_id, contact_id)
                 DO UPDATE SET
                   last_message_at = GREATEST(commercial_threads.last_message_at, EXCLUDED.last_message_at),
                   updated_at = clock_timestamp()
                 RETURNING id;`,
                [item.workspace_id, item.channel_instance_id, contactId, event.timestamp]
              );
              const threadRow = threadRes.rows[0];
              if (!threadRow) {
                throw new Error("Failed to retrieve upserted thread id");
              }
              const threadId = threadRow.id;

              // Correlate CTWA attribution (referral.ctwa_clid) and evolve commercial journey under tenant scope
              const inboundCtwaClid =
                typeof event.metadata?.ctwaClid === "string" && event.metadata.ctwaClid.trim().length > 0
                  ? event.metadata.ctwaClid.trim()
                  : undefined;

              const existingJourneyRes = await client.query<{ id: string; stage: string; ctwa_clid: string | null }>(
                `SELECT id, stage, ctwa_clid FROM public.commercial_journeys
                 WHERE workspace_id = $1 AND thread_id = $2
                 ORDER BY created_at DESC
                 LIMIT 1;`,
                [item.workspace_id, threadId]
              );

              const journey = existingJourneyRes.rows[0];
              if (journey) {
                // If lead sends message while in 'lead' stage, advance to 'qualified'
                const shouldAdvance = direction === "inbound" && journey.stage === "lead";
                const nextStage = shouldAdvance ? "qualified" : journey.stage;
                const shouldSetCtwa = inboundCtwaClid && !journey.ctwa_clid;

                if (shouldAdvance || shouldSetCtwa) {
                  await client.query(
                    `UPDATE public.commercial_journeys
                     SET stage = $1,
                         ctwa_clid = COALESCE($2, ctwa_clid),
                         attribution_source = CASE WHEN $2 IS NOT NULL THEN 'ctwa_meta' ELSE attribution_source END,
                         fep_expires_at = CASE WHEN $2 IS NOT NULL THEN COALESCE(fep_expires_at, clock_timestamp() + INTERVAL '7 days') ELSE fep_expires_at END,
                         updated_at = clock_timestamp()
                     WHERE workspace_id = $3 AND id = $4;`,
                    [nextStage, shouldSetCtwa ? inboundCtwaClid : null, item.workspace_id, journey.id]
                  );
                }
              } else if (inboundCtwaClid || direction === "inbound") {
                await client.query(
                  `INSERT INTO public.commercial_journeys (
                     workspace_id, contact_id, thread_id, title, stage, status, attribution_source, ctwa_clid, fep_expires_at
                   ) VALUES (
                     $1, $2, $3, $4, 'lead', 'open', $5, $6, $7
                   );`,
                  [
                    item.workspace_id,
                    contactId,
                    threadId,
                    inboundCtwaClid ? "Oportunidade Comercial (CTWA)" : "Oportunidade WhatsApp",
                    inboundCtwaClid ? "ctwa_meta" : "organic_whatsapp",
                    inboundCtwaClid || null,
                    inboundCtwaClid ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
                  ]
                );
              }

              // Insert message idempotently
              const msgInsertRes = await client.query<{ id: string }>(
                `INSERT INTO public.messages (
                   workspace_id, channel_instance_id, thread_id, provider, direction,
                   sender_e164, recipient_e164, content_type, body, media_url,
                   metadata, provider_message_id, delivery_status, status_rank, created_at, updated_at
                 ) VALUES (
                   $1, $2, $3, $4, $5,
                   $6, $7, $8, $9, $10,
                   $11::jsonb, $12, $13, $14, $15::timestamptz, $15::timestamptz
                 )
                 ON CONFLICT (channel_instance_id, provider_message_id) DO NOTHING
                 RETURNING id;`,
                [
                  item.workspace_id,
                  item.channel_instance_id,
                  threadId,
                  provider,
                  direction,
                  event.senderPhoneE164,
                  event.recipientPhoneE164,
                  event.contentType,
                  event.body || null,
                  event.mediaUrl ||
                    (event.metadata?.mediaId
                      ? `/v1/workspaces/${item.workspace_id}/media/proxy?mediaId=${encodeURIComponent(String(event.metadata.mediaId))}&channelInstanceId=${item.channel_instance_id}`
                      : null),
                  JSON.stringify(event.metadata ?? {}),
                  event.externalMessageId,
                  direction === "outbound" ? "sent" : "delivered",
                  direction === "outbound" ? 10 : 20,
                  event.timestamp,
                ]
              );

              const insertedMsgId = msgInsertRes.rows[0]?.id;

              if (direction === "inbound" && insertedMsgId && event.body?.trim()) {
                pendingAiEvents.push({
                  workspaceId: item.workspace_id,
                  channelInstanceId: item.channel_instance_id,
                  contactId,
                  threadId,
                  inboundMessageId: insertedMsgId,
                  inboundBody: event.body.trim(),
                  senderPhoneE164: event.senderPhoneE164,
                  recipientPhoneE164: event.recipientPhoneE164,
                });
              }

              // Reconcile if a delivery status event arrived BEFORE this message
              if (insertedMsgId) {
                const priorDeliveryRes = await client.query<{ status: MessageDeliveryStatus }>(
                  `SELECT status FROM public.provider_delivery_events
                   WHERE channel_instance_id = $1 AND external_message_id = $2
                   ORDER BY occurred_at DESC LIMIT 1;`,
                  [item.channel_instance_id, event.externalMessageId]
                );

                if (priorDeliveryRes.rows.length > 0) {
                  const priorStatus = priorDeliveryRes.rows[0]!.status;
                  const priorRank = DELIVERY_STATUS_RANK[priorStatus] ?? 0;
                  await client.query(
                    `UPDATE public.messages
                     SET delivery_status = $1, status_rank = $2, updated_at = clock_timestamp()
                     WHERE id = $3;`,
                    [priorStatus, priorRank, insertedMsgId]
                  );
                  await client.query(
                    `UPDATE public.provider_delivery_events
                     SET message_id = $1
                     WHERE channel_instance_id = $2 AND external_message_id = $3 AND message_id IS NULL;`,
                    [insertedMsgId, item.channel_instance_id, event.externalMessageId]
                  );
                }
              }
            } else if (normEvent.kind === "delivery_status") {
              const event = normEvent.event;
              const newStatus: MessageDeliveryStatus = event.status;
              const newRank = DELIVERY_STATUS_RANK[newStatus] ?? 0;

              // Find message id if exists
              const msgRes = await client.query<{ id: string }>(
                `SELECT id FROM public.messages WHERE channel_instance_id = $1 AND provider_message_id = $2 LIMIT 1;`,
                [item.channel_instance_id, event.externalMessageId]
              );
              let messageId = msgRes.rows[0]?.id || null;

              // If message was not matched by provider_message_id (e.g. initial HTTP dispatch timed out before
              // provider_message_id was stored), correlate via recent outbound_command in reconciliation_required
              if (!messageId) {
                const pendingCmdRes = await client.query<{ id: string; message_id: string }>(
                  `SELECT id, message_id FROM public.outbound_commands
                   WHERE channel_instance_id = $1 
                     AND workspace_id = $2
                     AND recipient_e164 = $3
                     AND status = 'reconciliation_required'
                     AND external_message_id IS NULL
                     AND created_at >= clock_timestamp() - INTERVAL '15 minutes'
                   ORDER BY created_at DESC
                   LIMIT 1;`,
                  [item.channel_instance_id, item.workspace_id, event.recipientPhoneE164]
                );

                if (pendingCmdRes.rows.length > 0) {
                  const correlatedCmd = pendingCmdRes.rows[0]!;
                  messageId = correlatedCmd.message_id;

                  // Update provider_message_id on the message
                  await client.query(
                    `UPDATE public.messages
                     SET provider_message_id = $1, updated_at = clock_timestamp()
                     WHERE id = $2 AND workspace_id = $3;`,
                    [event.externalMessageId, messageId, item.workspace_id]
                  );
                }
              }

              // Update message status monotonically if message exists
              if (messageId) {
                if (newStatus === "failed") {
                  await client.query(
                    `UPDATE public.messages
                     SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                     WHERE id = $1 AND status_rank = 0;`,
                    [messageId]
                  );
                } else {
                  await client.query(
                    `UPDATE public.messages
                     SET delivery_status = $1, status_rank = $2, updated_at = clock_timestamp()
                     WHERE id = $3 AND status_rank < $2;`,
                    [newStatus, newRank, messageId]
                  );
                }

                // CH-03: Late Webhook Auto-Reconciliation for outbound_commands
                // Automatically reconcile any outbound_command associated with this message that is in reconciliation_required!
                if (newStatus !== "failed") {
                  await client.query(
                    `UPDATE public.outbound_commands
                     SET status = 'sent', external_message_id = COALESCE(external_message_id, $1),
                         sent_at = COALESCE(sent_at, clock_timestamp()), lease_until = NULL,
                         error_message = NULL
                     WHERE message_id = $2 AND workspace_id = $3 AND status = 'reconciliation_required';`,
                    [event.externalMessageId, messageId, item.workspace_id]
                  );
                } else {
                  await client.query(
                    `UPDATE public.outbound_commands
                     SET status = 'dead_letter', lease_until = NULL,
                         error_message = COALESCE($1, 'RECONCILED_FAILED: Delivery failure confirmed by provider webhook')
                     WHERE message_id = $2 AND workspace_id = $3 AND status = 'reconciliation_required';`,
                    [event.errorMessage || event.errorCode, messageId, item.workspace_id]
                  );
                }
              }

              // Record delivery event append-only
              await client.query(
                `INSERT INTO public.provider_delivery_events (
                   workspace_id, channel_instance_id, message_id, external_message_id,
                   external_event_id, recipient_e164, provider, status,
                   error_code, error_message, raw_payload_hash,
                   encrypted_payload, payload_iv, payload_auth_tag, occurred_at
                 ) VALUES (
                   $1, $2, $3, $4,
                   $5, $6, $7, $8,
                   $9, $10, $11,
                   $12, $13, $14, $15
                 )
                 ON CONFLICT (channel_instance_id, external_event_id) DO NOTHING;`,
                [
                  item.workspace_id,
                  item.channel_instance_id,
                  messageId,
                  event.externalMessageId,
                  event.externalEventId,
                  event.recipientPhoneE164,
                  provider,
                  newStatus,
                  event.errorCode || null,
                  event.errorMessage || null,
                  item.raw_payload_hash,
                  item.encrypted_payload,
                  item.payload_iv,
                  item.payload_auth_tag,
                  event.timestamp,
                ]
              );
            } else if (normEvent.kind === "lifecycle") {
              const event = normEvent.event;
              let channelStatus: "connected" | "error" | "pairing" | null = null;
              if (event.eventType === "connected") {
                channelStatus = "connected";
              } else if (event.eventType === "disconnected" || event.eventType === "auth_failure") {
                channelStatus = "error";
              } else if (event.eventType === "qr_received") {
                channelStatus = "pairing";
              }

              if (channelStatus) {
                const isActive = channelStatus === "connected";
                await client.query(
                  `UPDATE public.channel_instances
                   SET status = $1, is_active = $2, updated_at = clock_timestamp()
                   WHERE id = $3 AND workspace_id = $4;`,
                  [channelStatus, isActive, item.channel_instance_id, item.workspace_id]
                );
              }
              logger.info(
                { inboxId: item.id, eventType: event.eventType, channelStatus },
                "Processed channel lifecycle event"
              );
            } else {
              throw new Error(`FAIL_CLOSED: Unrecognized event kind in normalized payload`);
            }
          }

          // Fencing: Mark inbox item as processed ONLY if lease_token and worker_id still match
          const finalizeRes = await client.query(
            `UPDATE public.channel_webhook_inbox
             SET status = 'processed', processed_at = clock_timestamp(), lease_until = NULL, error_message = NULL
             WHERE id = $1 AND status = 'processing' AND worker_id = $2 AND lease_token = $3::uuid;`,
            [item.id, workerId, item.lease_token]
          );

          if ((finalizeRes.rowCount ?? 0) === 0) {
            throw new Error(
              `FENCING_VIOLATION: Inbox item ${item.id} was recovered by another worker or lease expired.`
            );
          }
        },
        pool
      );

      // 3. Autonomously execute AI Receptionist for incoming customer messages
      for (const aiEvent of pendingAiEvents) {
        try {
          await this.aiReceptionistProcessor.processInboundMessage(pool, aiEvent, workerId);
        } catch (aiErr: unknown) {
          logger.error(
            { aiErr, aiEvent, workerId },
            "Error executing autonomous AI Receptionist on inbound message"
          );
        }
      }

      return { success: true, eventCount };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("FENCING")) {
        logger.warn({ inboxId: item.id, workerId, errorMessage }, "Fencing error during inbox processing");
        return { success: false, eventCount: 0 };
      }
      logger.error({ inboxId: item.id, workerId, err }, "Failed to process inbox item");

      // Calculate next attempt using QueueRetryPolicy
      const decision = QueueRetryPolicy.evaluate(
        item.retry_count,
        item.max_retries,
        new Date()
      );

      // Fencing update on failure: requires matching lease_token and tenant context
      try {
        await withWorkerTransaction(
          item.workspace_id,
          async (client) => {
            if (decision.nextStatus === "dead_letter") {
              await client.query(
                `UPDATE public.channel_webhook_inbox
                 SET status = 'dead_letter', error_message = $1, lease_until = NULL
                 WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
                [errorMessage, item.id, workerId, item.lease_token]
              );
            } else {
              await client.query(
                `UPDATE public.channel_webhook_inbox
                 SET status = 'failed', next_attempt_at = $1, error_message = $2, lease_until = NULL
                 WHERE id = $3 AND status = 'processing' AND worker_id = $4 AND lease_token = $5::uuid;`,
                [decision.nextAttemptAt, errorMessage, item.id, workerId, item.lease_token]
              );
            }
          },
          pool
        );
      } catch (updateErr) {
        logger.error({ inboxId: item.id, workerId, updateErr }, "Failed to update inbox status on failure");
      }

      return { success: false, eventCount: 0 };
    } finally {
      clearInterval(heartbeatInterval);
    }
  }

  /**
   * Executes a single claim-and-process iteration.
   */
  async runOnce(
    pool: Pool,
    workerId: string,
    limit = 10,
    signal?: AbortSignal
  ): Promise<number> {
    const items = await this.claimBatch(pool, workerId, limit);
    for (const item of items) {
      if (signal?.aborted) break;
      try {
        await this.processItem(pool, item, workerId, signal);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("FENCING")) {
          logger.warn({ inboxId: item.id, workerId, msg }, "Fencing abort or violation during inbox processing");
        } else {
          logger.error({ inboxId: item.id, workerId, err }, "Unhandled error during inbox process item");
        }
      }
    }
    return items.length;
  }
}
