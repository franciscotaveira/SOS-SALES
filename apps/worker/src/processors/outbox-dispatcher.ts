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
  OutboundCommandRepository,
  FencingViolationError,
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
  constructor(
    private readonly outboundRepo: OutboundCommandRepository = new OutboundCommandRepository()
  ) {}

  /**
   * Concurrently claims a batch of eligible outbound commands using SKIP LOCKED and lease fencing.
   * Delegates entirely to OutboundCommandRepository as the sole persistence authority.
   */
  async claimBatch(
    pool: Pool,
    workerId: string,
    limit = 10
  ): Promise<ClaimedOutboxItem[]> {
    const records = await this.outboundRepo.claimPendingBatch(workerId, limit, 30, pool);
    return records as ClaimedOutboxItem[];
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
    return this.outboundRepo.markProcessing(itemId, workerId, leaseToken, extendSeconds, pool);
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
        await this.outboundRepo.markReconciliationRequired(
          item.id,
          workerId,
          item.lease_token,
          "LEASE_EXPIRED_DURING_PROCESSING: Routed to reconciliation to prevent duplicate external dispatch after crash",
          client
        );
      }, pool);
      return { success: false, status: "reconciliation_required" };
    }

    // Reset lease clock immediately upon starting item dispatch
    const initialLease = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
    if (!initialLease) {
      throw new FencingViolationError(
        item.id,
        "Lease expired or was reclaimed before execution"
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
            new FencingViolationError(
              item.id,
              "Lease expired or stolen during dispatch heartbeat"
            )
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
      // Verify that the lease is still valid and owned by this worker immediately before external send
      if (effectiveSignal.aborted) {
        throw new Error(
          `FENCING_PRE_SEND_ABORT: Dispatch aborted before external send for command ${item.id}`
        );
      }
      const preSendRenewed = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
      if (!preSendRenewed) {
        throw new FencingViolationError(
          item.id,
          "Lease expired or stolen immediately before external send"
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
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              `[${errCode}] ${errMessage}`,
              client
            );
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
            await this.outboundRepo.markReconciliationRequired(
              item.id,
              workerId,
              item.lease_token,
              `[AMBIGUOUS_ERROR] ${msg}`,
              client
            );
          }, pool);
          return { success: false, status: "reconciliation_required" };
        }

        throw err;
      }

      // 3. Handle success: Transactional finalization of command, EXACT message, and delivery event
      if (sendResult.success) {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          // Fencing: Update outbound command ensuring lease_token and worker_id match via repository
          await this.outboundRepo.markSent(
            item.id,
            workerId,
            item.lease_token,
            sendResult.externalMessageId!,
            sendResult.sentAt ?? new Date(),
            client
          );

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
          await this.outboundRepo.markReconciliationRequired(
            item.id,
            workerId,
            item.lease_token,
            errorMessage,
            client
          );
        }, pool);
        return { success: false, status: "reconciliation_required" };
      }

      if (sendResult.category === "permanent") {
        // Permanent failure: transition command to dead_letter and message to failed (-1)
        await withWorkerTransaction(item.workspace_id, async (client) => {
          await this.outboundRepo.markPermanentFailure(
            item.id,
            workerId,
            item.lease_token,
            errorMessage,
            client
          );

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
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              errorMessage,
              client
            );

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
        await this.outboundRepo.markRetryableFailure(
          item.id,
          workerId,
          item.lease_token,
          errorMessage,
          nextAttemptAt,
          client
        );
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
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              errorMessage,
              client
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
            await this.outboundRepo.markRetryableFailure(
              item.id,
              workerId,
              item.lease_token,
              errorMessage,
              decision.nextAttemptAt ?? new Date(),
              client
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
      const reconciled = await this.outboundRepo.adminReconcile(
        workspaceId,
        commandId,
        resolution,
        options,
        client
      );

      if (!reconciled) {
        return false;
      }

      if (resolution === "sent") {
        const externalId = options.externalMessageId || `manual-recon-${Date.now()}`;
        await client.query(
          `UPDATE public.messages
           SET delivery_status = 'sent', status_rank = 10, provider_message_id = $1, updated_at = clock_timestamp()
           WHERE id = $2 AND workspace_id = $3 AND channel_instance_id = $4;`,
          [externalId, reconciled.messageId, workspaceId, reconciled.channelInstanceId]
        );
      } else if (resolution === "dead_letter") {
        await client.query(
          `UPDATE public.messages
           SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
           WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
          [reconciled.messageId, workspaceId, reconciled.channelInstanceId]
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
   * 1. Claims ambiguous commands with expired/null lease using SKIP LOCKED via repository.
   * 2. Checks provider_delivery_events under tenant scope for confirmed status.
   * 3. If delivery event found: auto-resolves to 'sent' or 'dead_letter' via repository.
   * 4. If no delivery event found after ttlSeconds:
   *    - If retry_count < max_retries: reschedules to 'pending' for retry via repository.
   *    - If retry_count >= max_retries: transitions to 'dead_letter' via repository and message to 'failed'.
   */
  async reconcileBatch(
    pool: Pool,
    workerId: string,
    limit = 10,
    ttlSeconds = 60,
    signal?: AbortSignal
  ): Promise<number> {
    const items = await this.outboundRepo.claimReconciliationBatch(workerId, limit, 30, pool);
    let reconciledCount = 0;

    for (const item of items) {
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
              await this.outboundRepo.resolveReconciliationSent(
                item.id,
                workerId,
                item.lease_token,
                devEvent.external_message_id,
                "Reconciled: Delivery event confirmed by provider",
                new Date(),
                client
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
              await this.outboundRepo.resolveReconciliationDeadLetter(
                item.id,
                workerId,
                item.lease_token,
                devEvent.error_message || "Reconciled: Delivery failure confirmed by provider",
                client
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
            await this.outboundRepo.releaseReconciliationLease(
              item.id,
              workerId,
              item.lease_token,
              client
            );
            return;
          }

          // 3. TTL expired without delivery confirmation:
          if (item.retry_count < item.max_retries) {
            // Reschedule for clean retry
            const nextAttemptAt = new Date(Date.now() + 10000);
            await this.outboundRepo.resolveReconciliationRetry(
              item.id,
              workerId,
              item.lease_token,
              nextAttemptAt,
              "Reconciled: Timeout without delivery event, rescheduled for retry",
              client
            );
          } else {
            // Max retries reached: permanent dead_letter
            await this.outboundRepo.resolveReconciliationDeadLetter(
              item.id,
              workerId,
              item.lease_token,
              "Reconciled: Reconciliation TTL expired and max retries exhausted",
              client
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
