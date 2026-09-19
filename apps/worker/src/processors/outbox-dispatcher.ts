import crypto from "node:crypto";
import type { Pool } from "pg";
import type {
  ChannelAdapterRegistry,
  ISigningSecretResolver,
  ChannelSendResult,
} from "@sos-sales/application";
import {
  ChannelDispatchService,
  ChannelInstanceNotFoundError,
  ChannelInstanceInactiveError,
  ChannelCapabilityUnsupportedError,
  QueueRetryPolicy,
} from "@sos-sales/application";
import {
  withWorkerTransaction,
  ChannelInstanceRepository,
  encryptPayload,
} from "@sos-sales/database";
import { logger } from "@sos-sales/observability";

export interface ClaimedOutboxItem {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  thread_id: string | null;
  message_id: string;
  recipient_e164: string;
  body: string;
  media_url: string | null;
  template_name?: string | null;
  template_language?: string | null;
  template_components?: Record<string, unknown>[] | null;
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  lease_token: string;
  previous_status?: string;
}

export class OutboxDispatcher {
  /**
   * Concurrently claims a batch of eligible outbound commands using SKIP LOCKED and lease fencing.
   * Eligible items:
   * 1. status = 'pending' AND next_attempt_at <= clock_timestamp()
   * 2. status = 'failed' AND next_attempt_at <= clock_timestamp()
   * 3. status = 'processing' AND lease_until < clock_timestamp() (expired lease recovery)
   *
   * Crucial safety: Only claims if retry_count < max_retries to ensure that
   * incrementing retry_count never violates the CHECK (retry_count <= max_retries) constraint.
   */
  async claimBatch(
    pool: Pool,
    workerId: string,
    limit = 10
  ): Promise<ClaimedOutboxItem[]> {
    const query = `
      WITH claimed AS (
        SELECT id, status AS previous_status
        FROM public.outbound_commands
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
      UPDATE public.outbound_commands o
      SET 
        status = 'processing',
        worker_id = $1,
        lease_token = gen_random_uuid(),
        lease_until = clock_timestamp() + INTERVAL '30 seconds',
        retry_count = LEAST(o.retry_count + 1, o.max_retries)
      FROM claimed
      WHERE o.id = claimed.id
      RETURNING o.id, o.workspace_id, o.channel_instance_id, o.thread_id, o.message_id,
                o.recipient_e164, o.body, o.media_url, o.idempotency_key,
                o.retry_count, o.max_retries, o.lease_token::text,
                o.template_name, o.template_language, o.template_components,
                claimed.previous_status;
    `;

    const res = await pool.query<ClaimedOutboxItem>(query, [workerId, limit]);
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
      `UPDATE public.outbound_commands
       SET lease_until = clock_timestamp() + ($1 || ' seconds')::interval
       WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
      [extendSeconds, itemId, workerId, leaseToken]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Dispatches a single outbound command explicitly via ChannelDispatchService.
   */
  async dispatchItem(
    pool: Pool,
    item: ClaimedOutboxItem,
    workerId: string,
    dispatchServiceOrRegistry: ChannelDispatchService | ChannelAdapterRegistry,
    secretResolver?: ISigningSecretResolver,
    signal?: AbortSignal
  ): Promise<{ success: boolean; externalMessageId?: string; status: string }> {
    // 0. Crash recovery protection:
    // If the command was claimed from 'processing' (lease had expired), a previous worker
    // may have crashed AFTER the external provider accepted the message.
    // Blindly re-sending would cause duplicate external messages to the customer.
    // Instead, route this ambiguous state directly to 'reconciliation_required'.
    if (item.previous_status === "processing") {
      logger.warn(
        { commandId: item.id, workerId },
        "Outbox command lease expired while in processing (potential worker crash). Routing to reconciliation_required to prevent duplicate dispatch."
      );
      await withWorkerTransaction(item.workspace_id, async (client) => {
        const res = await client.query(
          `UPDATE public.outbound_commands
           SET status = 'reconciliation_required',
               error_message = 'LEASE_EXPIRED_DURING_PROCESSING: Routed to reconciliation to prevent duplicate external dispatch after crash',
               lease_until = NULL
           WHERE id = $1 AND status = 'processing' AND worker_id = $2 AND lease_token = $3::uuid;`,
          [item.id, workerId, item.lease_token]
        );
        if ((res.rowCount ?? 0) === 0) {
          throw new Error(
            `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
          );
        }
      }, pool);
      return { success: false, status: "reconciliation_required" };
    }

    // Reset lease clock immediately upon starting item dispatch
    const initialLease = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
    if (!initialLease) {
      throw new Error(
        `FENCING_VIOLATION: Outbound command ${item.id} lease expired or was reclaimed before execution`
      );
    }

    const abortController = new AbortController();
    const effectiveSignal = signal
      ? AbortSignal.any([signal, abortController.signal])
      : abortController.signal;

    // Start background heartbeat to renew lease every 10 seconds during processing
    const heartbeatTimer = setInterval(async () => {
      try {
        const renewed = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
        if (!renewed) {
          logger.warn(
            { commandId: item.id, workerId },
            "Lease lost during heartbeat renewal, aborting in-flight dispatch"
          );
          abortController.abort(
            new Error(`FENCING_LEASE_LOST: Outbound command ${item.id} lease expired or stolen during dispatch`)
          );
        }
      } catch (hbErr) {
        logger.warn({ commandId: item.id, hbErr }, "Failed to renew lease in outbox heartbeat");
      }
    }, 10000);

    try {
      if (effectiveSignal.aborted) {
        throw new Error("FENCING_PRE_SEND_ABORT: Dispatch was aborted by signal before execution");
      }

      // Resolve ChannelDispatchService
      let dispatchService: ChannelDispatchService;
      if ("dispatchOutbound" in dispatchServiceOrRegistry) {
        dispatchService = dispatchServiceOrRegistry as ChannelDispatchService;
      } else {
        if (!secretResolver) {
          throw new Error("SECRET_RESOLVER_REQUIRED: Must provide secretResolver when passing ChannelAdapterRegistry to dispatchItem");
        }
        const channelRepo = new ChannelInstanceRepository(pool);
        dispatchService = new ChannelDispatchService({
          channelInstanceRepo: channelRepo,
          adapterRegistry: dispatchServiceOrRegistry as ChannelAdapterRegistry,
          secretResolver,
        });
      }

      // 1. Fetch optional 24h window timestamp under tenant scope
      let lastInboundAt: Date | null = null;
      if (item.thread_id) {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          const lastInboundRes = await client.query<{ created_at: Date }>(
            `SELECT created_at FROM public.messages 
             WHERE thread_id = $1 AND direction = 'inbound' 
             ORDER BY created_at DESC LIMIT 1;`,
            [item.thread_id]
          );
          if (lastInboundRes.rows.length > 0) {
            lastInboundAt = lastInboundRes.rows[0]!.created_at;
          }
        }, pool);
      }

      // Construct WABA template object if template_name is present
      const template = item.template_name
        ? {
            name: item.template_name,
            language: item.template_language || "pt_BR",
            components: (item.template_components as any) || undefined,
          }
        : undefined;

      // PRE-SEND FENCING VALIDATION (CH-02):
      // Crucial: verify that the lease is still valid and owned by this worker immediately before external send!
      if (effectiveSignal.aborted) {
        throw new Error(
          `FENCING_PRE_SEND_ABORT: Dispatch aborted before external send for command ${item.id}`
        );
      }
      const preSendRenewed = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
      if (!preSendRenewed) {
        throw new Error(
          `FENCING_PRE_SEND_ABORT: Lease expired or stolen immediately before external send for command ${item.id}`
        );
      }

      // 2. Perform outbound dispatch via ChannelDispatchService
      let sendResult: ChannelSendResult;
      try {
        sendResult = await dispatchService.dispatchOutbound(
          item.workspace_id,
          item.channel_instance_id,
          {
            recipientE164: item.recipient_e164,
            body: item.body,
            mediaUrl: item.media_url,
            template,
            idempotencyKey: item.idempotency_key,
            commandId: item.id,
            messageId: item.message_id,
            lastInboundMessageAt: lastInboundAt,
            signal: effectiveSignal,
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const causeMsg = (err instanceof Error && (err as any).cause instanceof Error) ? (err as any).cause.message : "";
        if (msg.includes("FENCING") || causeMsg.includes("FENCING") || effectiveSignal.aborted) {
          throw err;
        }

        if (
          err instanceof ChannelInstanceNotFoundError ||
          err instanceof ChannelInstanceInactiveError ||
          err instanceof ChannelCapabilityUnsupportedError
        ) {
          const errCode = (err as any).code || "PERMANENT_DISPATCH_REJECTION";
          const errMessage = err instanceof Error ? err.message : String(err);
          logger.warn(
            { commandId: item.id, workerId, errorCode: errCode },
            "Permanent dispatch rejection from ChannelDispatchService"
          );
          await withWorkerTransaction(item.workspace_id, async (client) => {
            const res = await client.query(
              `UPDATE public.outbound_commands
               SET status = 'dead_letter', error_message = $1, lease_until = NULL
               WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
              [`[${errCode}] ${errMessage}`, item.id, workerId, item.lease_token]
            );
            if ((res.rowCount ?? 0) === 0) {
              throw new Error(
                `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
              );
            }
            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
                [item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }
          }, pool);
          return { success: false, status: "dead_letter" };
        }

        if (
          msg.includes("ETIMEDOUT") ||
          msg.includes("ECONNRESET") ||
          msg.includes("timeout") ||
          msg.includes("ambiguous")
        ) {
          logger.warn(
            { commandId: item.id, workerId },
            "Ambiguous timeout/socket reset during dispatch. Routing to reconciliation_required to prevent duplicate dispatch."
          );
          await withWorkerTransaction(item.workspace_id, async (client) => {
            const res = await client.query(
              `UPDATE public.outbound_commands
               SET status = 'reconciliation_required', error_message = $1, lease_until = NULL
               WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
              [`[AMBIGUOUS_ERROR] ${msg}`, item.id, workerId, item.lease_token]
            );
            if ((res.rowCount ?? 0) === 0) {
              throw new Error(
                `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
              );
            }
          }, pool);
          return { success: false, status: "reconciliation_required" };
        }

        throw err;
      }

      // 3. Handle success: Transactional finalization of command, EXACT message, and delivery event
      if (sendResult.success) {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          // Fencing: Update outbound command ensuring lease_token and worker_id match
          const cmdUpdateRes = await client.query(
            `UPDATE public.outbound_commands
             SET status = 'sent', external_message_id = $1, sent_at = $2, lease_until = NULL, error_message = NULL
             WHERE id = $3 AND status = 'processing' AND worker_id = $4 AND lease_token = $5::uuid;`,
            [sendResult.externalMessageId, sendResult.sentAt, item.id, workerId, item.lease_token]
          );

          if ((cmdUpdateRes.rowCount ?? 0) === 0) {
            throw new Error(
              `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
            );
          }

          // P0: STRICTLY update ONLY the exact single message associated with this command
          if (item.message_id) {
            await client.query(
              `UPDATE public.messages
               SET delivery_status = 'sent', status_rank = 10, provider_message_id = $1, updated_at = clock_timestamp()
               WHERE id = $2 AND workspace_id = $3 AND channel_instance_id = $4;`,
              [sendResult.externalMessageId, item.message_id, item.workspace_id, item.channel_instance_id]
            );
          }

          // Step 6: Record delivery event append-only
          try {
            const chanRes = await client.query<{ provider: string }>(
              "SELECT provider FROM public.channel_instances WHERE id = $1 AND workspace_id = $2;",
              [item.channel_instance_id, item.workspace_id]
            );
            const provider = chanRes.rows[0]?.provider || "meta_waba";

            const rawEvent = JSON.stringify({
              externalMessageId: sendResult.externalMessageId,
              sentAt: sendResult.sentAt,
              commandId: item.id,
              status: "sent",
            });
            const eventHash = crypto.createHash("sha256").update(rawEvent).digest("hex");
            const masterKey =
              process.env.MCT_CREDENTIALS_MASTER_KEY ||
              process.env.APP_MASTER_KEY ||
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            const enc = encryptPayload(rawEvent, masterKey);

            await client.query(
              `INSERT INTO public.provider_delivery_events (
                 workspace_id, channel_instance_id, message_id, external_message_id,
                 external_event_id, recipient_e164, provider, status,
                 raw_payload_hash, encrypted_payload, payload_iv, payload_auth_tag, occurred_at
               ) VALUES (
                 $1, $2, $3, $4,
                 $5, $6, $7, 'sent',
                 $8, $9, $10, $11, $12
               )
               ON CONFLICT (channel_instance_id, external_event_id) DO NOTHING;`,
              [
                item.workspace_id,
                item.channel_instance_id,
                item.message_id,
                sendResult.externalMessageId,
                `send-${item.id}`,
                item.recipient_e164,
                provider,
                eventHash,
                enc.encryptedBase64,
                enc.ivBase64,
                enc.authTagBase64,
                sendResult.sentAt,
              ]
            );
          } catch (evtErr) {
            logger.warn({ commandId: item.id, workerId, err: evtErr }, "Failed to record outbound delivery event");
          }
        }, pool);

        return { success: true, externalMessageId: sendResult.externalMessageId, status: "sent" };
      }

      // 4. Handle non-success response
      const errorMessage = `[${sendResult.category.toUpperCase()}] ${sendResult.errorCode}: ${sendResult.errorMessage}`;

      if (sendResult.category === "ambiguous") {
        // P0: Ambiguous results (timeout, socket reset) MUST NOT enter normal retry.
        // Set reconciliation_required to prevent duplicate external messages!
        await withWorkerTransaction(item.workspace_id, async (client) => {
          const res = await client.query(
            `UPDATE public.outbound_commands
             SET status = 'reconciliation_required', error_message = $1, lease_until = NULL
             WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
            [errorMessage, item.id, workerId, item.lease_token]
          );
          if ((res.rowCount ?? 0) === 0) {
            throw new Error(
              `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
            );
          }
        }, pool);
        return { success: false, status: "reconciliation_required" };
      }

      if (sendResult.category === "permanent") {
        // Permanent failure: transition command to dead_letter and message to failed (-1)
        await withWorkerTransaction(item.workspace_id, async (client) => {
          const res = await client.query(
            `UPDATE public.outbound_commands
             SET status = 'dead_letter', error_message = $1, lease_until = NULL
             WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
            [errorMessage, item.id, workerId, item.lease_token]
          );
          if ((res.rowCount ?? 0) === 0) {
            throw new Error(
              `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
            );
          }

          if (item.message_id) {
            await client.query(
              `UPDATE public.messages
               SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
               WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
              [item.message_id, item.workspace_id, item.channel_instance_id]
            );
          }
        }, pool);
        return { success: false, status: "dead_letter" };
      }

      // Transient failure with exponential backoff and jitter
      let nextAttemptAt: Date;
      if (sendResult.retryAfterSeconds && sendResult.retryAfterSeconds > 0) {
        nextAttemptAt = new Date(Date.now() + sendResult.retryAfterSeconds * 1000);
      } else {
        const decision = QueueRetryPolicy.evaluate(item.retry_count, item.max_retries, new Date(), {
          jitterRatio: 0.15,
        });
        if (decision.nextStatus === "dead_letter") {
          await withWorkerTransaction(item.workspace_id, async (client) => {
            const res = await client.query(
              `UPDATE public.outbound_commands
               SET status = 'dead_letter', error_message = $1, lease_until = NULL
               WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
              [errorMessage, item.id, workerId, item.lease_token]
            );
            if ((res.rowCount ?? 0) === 0) {
              throw new Error(
                `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
              );
            }

            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
                [item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }
          }, pool);
          return { success: false, status: "dead_letter" };
        }
        nextAttemptAt = decision.nextAttemptAt ?? new Date();
      }

      await withWorkerTransaction(item.workspace_id, async (client) => {
        const res = await client.query(
          `UPDATE public.outbound_commands
           SET status = 'failed', next_attempt_at = $1, error_message = $2, lease_until = NULL
           WHERE id = $3 AND status = 'processing' AND worker_id = $4 AND lease_token = $5::uuid;`,
          [nextAttemptAt, errorMessage, item.id, workerId, item.lease_token]
        );
        if ((res.rowCount ?? 0) === 0) {
          throw new Error(
            `FENCING_VIOLATION: Outbound command ${item.id} was recovered by another worker or lease expired.`
          );
        }
      }, pool);
      return { success: false, status: "failed" };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const causeMsg = (err instanceof Error && (err as any).cause instanceof Error) ? (err as any).cause.message : "";
      if (errorMessage.includes("FENCING") || causeMsg.includes("FENCING") || effectiveSignal.aborted) {
        throw err;
      }
      logger.error({ commandId: item.id, workerId, err }, "Exception during outbox dispatch");

      const decision = QueueRetryPolicy.evaluate(item.retry_count, item.max_retries, new Date(), {
        jitterRatio: 0.15,
      });
      try {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          if (decision.nextStatus === "dead_letter") {
            await client.query(
              `UPDATE public.outbound_commands
               SET status = 'dead_letter', error_message = $1, lease_until = NULL
               WHERE id = $2 AND status = 'processing' AND worker_id = $3 AND lease_token = $4::uuid;`,
              [errorMessage, item.id, workerId, item.lease_token]
            );
            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
                [item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }
          } else {
            await client.query(
              `UPDATE public.outbound_commands
               SET status = 'failed', next_attempt_at = $1, error_message = $2, lease_until = NULL
               WHERE id = $3 AND status = 'processing' AND worker_id = $4 AND lease_token = $5::uuid;`,
              [decision.nextAttemptAt, errorMessage, item.id, workerId, item.lease_token]
            );
          }
        }, pool);
      } catch (innerErr) {
        logger.error({ commandId: item.id, innerErr }, "Failed to update failed status for outbox command");
      }

      return { success: false, status: "failed" };
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  /**
   * Administrative reconciliation action for commands in 'reconciliation_required'.
   */
  async reconcileItem(
    pool: Pool,
    workspaceId: string,
    commandId: string,
    resolution: "sent" | "dead_letter" | "retry",
    options: {
      externalMessageId?: string;
      adminNote?: string;
    } = {}
  ): Promise<boolean> {
    return await withWorkerTransaction(workspaceId, async (client) => {
      const cmdRes = await client.query<{ message_id: string; channel_instance_id: string }>(
        `SELECT message_id, channel_instance_id FROM public.outbound_commands
         WHERE id = $1 AND workspace_id = $2 AND status = 'reconciliation_required'
         FOR UPDATE;`,
        [commandId, workspaceId]
      );

      const cmd = cmdRes.rows[0];
      if (!cmd) {
        return false;
      }

      if (resolution === "sent") {
        const externalId = options.externalMessageId || `manual-recon-${Date.now()}`;
        await client.query(
          `UPDATE public.outbound_commands
           SET status = 'sent', external_message_id = $1, sent_at = clock_timestamp(),
               error_message = $2, lease_until = NULL
           WHERE id = $3;`,
          [externalId, options.adminNote || "Reconciled externally verified sent", commandId]
        );
        await client.query(
          `UPDATE public.messages
           SET delivery_status = 'sent', status_rank = 10, provider_message_id = $1, updated_at = clock_timestamp()
           WHERE id = $2 AND workspace_id = $3 AND channel_instance_id = $4;`,
          [externalId, cmd.message_id, workspaceId, cmd.channel_instance_id]
        );
      } else if (resolution === "dead_letter") {
        await client.query(
          `UPDATE public.outbound_commands
           SET status = 'dead_letter', error_message = $1, lease_until = NULL
           WHERE id = $2;`,
          [options.adminNote || "Reconciled as dead_letter by administrator", commandId]
        );
        await client.query(
          `UPDATE public.messages
           SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
           WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
          [cmd.message_id, workspaceId, cmd.channel_instance_id]
        );
      } else if (resolution === "retry") {
        await client.query(
          `UPDATE public.outbound_commands
           SET status = 'pending', retry_count = 0, next_attempt_at = clock_timestamp(),
               error_message = $1, lease_until = NULL
           WHERE id = $2;`,
          [options.adminNote || "Reconciled: reset to pending for retry", commandId]
        );
      }
      return true;
    }, pool);
  }

  /**
   * Executes a single claim-and-dispatch iteration.
   */
  async runOnce(
    pool: Pool,
    workerId: string,
    dispatchServiceOrRegistry: ChannelDispatchService | ChannelAdapterRegistry,
    secretResolver?: ISigningSecretResolver,
    limit = 10,
    signal?: AbortSignal
  ): Promise<number> {
    const items = await this.claimBatch(pool, workerId, limit);
    for (const item of items) {
      if (signal?.aborted) break;
      try {
        await this.dispatchItem(pool, item, workerId, dispatchServiceOrRegistry, secretResolver, signal);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("FENCING")) {
          logger.warn({ commandId: item.id, workerId, msg }, "Fencing abort or violation during dispatch");
        } else {
          logger.error({ commandId: item.id, workerId, err }, "Unhandled error during dispatch item");
        }
      }
    }
    return items.length;
  }

  /**
   * Automated periodic reconciliation of outbound commands in 'reconciliation_required'.
   * 1. Claims ambiguous commands with expired/null lease using SKIP LOCKED.
   * 2. Checks provider_delivery_events under tenant scope for confirmed status.
   * 3. If delivery event found: auto-resolves to 'sent' or 'dead_letter'.
   * 4. If no delivery event found after ttlSeconds:
   *    - If retry_count < max_retries: reschedules to 'pending' for retry.
   *    - If retry_count >= max_retries: transitions to 'dead_letter' and message to 'failed'.
   */
  async reconcileBatch(
    pool: Pool,
    workerId: string,
    limit = 10,
    ttlSeconds = 60,
    signal?: AbortSignal
  ): Promise<number> {
    const claimQuery = `
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
      SET lease_until = clock_timestamp() + INTERVAL '30 seconds',
          lease_token = gen_random_uuid(),
          worker_id = $1
      FROM claimed
      WHERE o.id = claimed.id
      RETURNING o.id, o.workspace_id, o.channel_instance_id, o.message_id,
                o.recipient_e164, o.external_message_id, o.created_at,
                o.retry_count, o.max_retries, o.lease_token::text;
    `;

    const res = await pool.query<{
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
    }>(claimQuery, [workerId, limit]);

    let reconciledCount = 0;

    for (const item of res.rows) {
      if (signal?.aborted) break;

      try {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          // 1. Check if provider_delivery_events contains a matching delivery event
          const eventRes = await client.query<{
            status: string;
            external_message_id: string;
            error_message: string | null;
          }>(
            `SELECT status, external_message_id, error_message
             FROM public.provider_delivery_events
             WHERE workspace_id = $1
               AND (
                 message_id = $2
                 OR (external_message_id = $3 AND $3 IS NOT NULL)
                 OR ($3 IS NULL AND message_id IS NULL AND channel_instance_id = $4 AND recipient_e164 = $5 AND occurred_at >= ($6::timestamptz - INTERVAL '10 seconds'))
               )
             ORDER BY occurred_at DESC
             LIMIT 1;`,
            [
              item.workspace_id,
              item.message_id,
              item.external_message_id,
              item.channel_instance_id,
              item.recipient_e164,
              item.created_at,
            ]
          );

          if (eventRes.rows.length > 0) {
            const devEvent = eventRes.rows[0]!;
            if (devEvent.status !== "failed") {
              const rank = devEvent.status === "read" ? 30 : devEvent.status === "delivered" ? 20 : 10;
              await client.query(
                `UPDATE public.outbound_commands
                 SET status = 'sent',
                     external_message_id = COALESCE(external_message_id, $1),
                     sent_at = COALESCE(sent_at, clock_timestamp()),
                     lease_until = NULL,
                     error_message = 'Reconciled: Delivery event confirmed by provider'
                 WHERE id = $2 AND status = 'reconciliation_required' AND worker_id = $3 AND lease_token = $4::uuid;`,
                [devEvent.external_message_id, item.id, workerId, item.lease_token]
              );
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = $1, status_rank = $2,
                     provider_message_id = COALESCE(provider_message_id, $3),
                     updated_at = clock_timestamp()
                 WHERE id = $4 AND workspace_id = $5;`,
                [devEvent.status, rank, devEvent.external_message_id, item.message_id, item.workspace_id]
              );
            } else {
              await client.query(
                `UPDATE public.outbound_commands
                 SET status = 'dead_letter',
                     lease_until = NULL,
                     error_message = COALESCE($1, 'Reconciled: Delivery failure confirmed by provider')
                 WHERE id = $2 AND status = 'reconciliation_required' AND worker_id = $3 AND lease_token = $4::uuid;`,
                [devEvent.error_message, item.id, workerId, item.lease_token]
              );
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2;`,
                [item.message_id, item.workspace_id]
              );
            }
            reconciledCount++;
            return;
          }

          // 2. If no delivery event found, check elapsed time against ttlSeconds
          const ageSeconds = (Date.now() - new Date(item.created_at).getTime()) / 1000;
          if (ageSeconds < ttlSeconds) {
            // Still within webhook grace period: release lease so future tick can re-evaluate
            await client.query(
              `UPDATE public.outbound_commands
               SET lease_until = NULL
               WHERE id = $1 AND status = 'reconciliation_required' AND worker_id = $2 AND lease_token = $3::uuid;`,
              [item.id, workerId, item.lease_token]
            );
            return;
          }

          // 3. TTL expired without delivery confirmation:
          if (item.retry_count < item.max_retries) {
            // Reschedule for clean retry
            await client.query(
              `UPDATE public.outbound_commands
               SET status = 'pending',
                   retry_count = LEAST(retry_count + 1, max_retries),
                   next_attempt_at = clock_timestamp() + INTERVAL '10 seconds',
                   lease_until = NULL,
                   error_message = 'Reconciled: Timeout without delivery event, rescheduled for retry'
               WHERE id = $1 AND status = 'reconciliation_required' AND worker_id = $2 AND lease_token = $3::uuid;`,
              [item.id, workerId, item.lease_token]
            );
          } else {
            // Max retries reached: permanent dead_letter
            await client.query(
              `UPDATE public.outbound_commands
               SET status = 'dead_letter',
                   lease_until = NULL,
                   error_message = 'Reconciled: Reconciliation TTL expired and max retries exhausted'
               WHERE id = $1 AND status = 'reconciliation_required' AND worker_id = $2 AND lease_token = $3::uuid;`,
              [item.id, workerId, item.lease_token]
            );
            await client.query(
              `UPDATE public.messages
               SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
               WHERE id = $1 AND workspace_id = $2;`,
              [item.message_id, item.workspace_id]
            );
          }
          reconciledCount++;
        }, pool);
      } catch (reconErr) {
        logger.warn({ commandId: item.id, workerId, reconErr }, "Failed to reconcile command");
      }
    }

    return reconciledCount;
  }
}
