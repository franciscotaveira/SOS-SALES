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
  sanitizeOutboxErrorMessage,
  resolveCanonicalErrorCode,
} from "@sos-sales/application";
import {
  withWorkerTransaction,
  ChannelInstanceRepository,
  OutboundCommandRepository,
  FencingViolationError,
  encryptPayload,
  DatabaseSigningSecretResolver,
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

export interface OutboxDispatcherOptions {
  outboundRepo?: OutboundCommandRepository;
  masterKeyHex?: string;
  secretResolver?: ISigningSecretResolver | DatabaseSigningSecretResolver;
}

export class FatalCryptographicConfigError extends Error {
  readonly code = "FATAL_CRYPTOGRAPHIC_CONFIG_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "FatalCryptographicConfigError";
  }
}

export class OutboxDispatcher {
  private readonly outboundRepo: OutboundCommandRepository;
  private readonly configuredMasterKeyHex?: string;
  private readonly configuredSecretResolver?: ISigningSecretResolver | DatabaseSigningSecretResolver;

  constructor(
    outboundRepoOrOptions?: OutboundCommandRepository | OutboxDispatcherOptions
  ) {
    if (outboundRepoOrOptions && "claimPendingBatch" in outboundRepoOrOptions) {
      this.outboundRepo = outboundRepoOrOptions;
    } else if (outboundRepoOrOptions) {
      const opts = outboundRepoOrOptions as OutboxDispatcherOptions;
      this.outboundRepo = opts.outboundRepo || new OutboundCommandRepository();
      this.configuredMasterKeyHex = opts.masterKeyHex;
      this.configuredSecretResolver = opts.secretResolver;
    } else {
      this.outboundRepo = new OutboundCommandRepository();
    }
  }

  /**
   * Resolves the cryptographic master key for delivery event encryption.
   * Fail-Closed: Strict validation without hardcoded default keys.
   */
  resolveMasterKey(secretResolver?: ISigningSecretResolver | DatabaseSigningSecretResolver): string {
    const candidate =
      this.configuredMasterKeyHex ||
      (secretResolver as any)?.keyringOrKey ||
      (this.configuredSecretResolver as any)?.keyringOrKey ||
      process.env.MCT_CREDENTIALS_MASTER_KEY ||
      process.env.APP_MASTER_KEY ||
      process.env.MASTER_ENCRYPTION_KEY;

    if (typeof candidate === "string" && /^[0-9a-fA-F]{64}$/.test(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === "object") {
      const keys = Object.values(candidate) as string[];
      for (const k of keys) {
        if (typeof k === "string" && /^[0-9a-fA-F]{64}$/.test(k)) {
          return k;
        }
      }
    }

    throw new FatalCryptographicConfigError(
      "FATAL_CONFIG_ERROR: Master encryption key must be explicitly provided as a 64-character hex string for OutboxDispatcher delivery event encryption (no hardcoded fallback allowed)"
    );
  }

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
   *
   * Invariants:
   * 1. Lease Fencing: Heartbeat renews lease; if lost, aborts in-flight and rejects finalization.
   * 2. Sanitized Errors: Zero raw error messages or provider payloads stored in database.
   * 3. Zero PII Logging: Telephone numbers (masked or unmasked) are NEVER logged.
   */
  async dispatchItem(
    pool: Pool,
    item: ClaimedOutboxItem,
    workerId: string,
    dispatchServiceOrRegistry: ChannelDispatchService | ChannelAdapterRegistry,
    secretResolver?: ISigningSecretResolver,
    signal?: AbortSignal
  ): Promise<{ success: boolean; externalMessageId?: string; status: string }> {
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let inFlightHeartbeat: Promise<void> | null = null;

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
      const sanitizedCrashError = sanitizeOutboxErrorMessage("reconciliation", "ERR_LEASE_EXPIRED_DURING_PROCESSING");
      await withWorkerTransaction(item.workspace_id, async (client) => {
        await this.outboundRepo.markReconciliationRequired(
          item.id,
          workerId,
          item.lease_token,
          sanitizedCrashError,
          client
        );
      }, pool);
      return { success: false, status: "reconciliation_required" };
    }

    // Fail-Closed: Validate cryptographic master key before any dispatch or persistence
    const masterKey = this.resolveMasterKey(secretResolver);

    try {
      // Reset lease clock immediately upon starting item dispatch
      const initialLease = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
      if (!initialLease) {
        throw new FencingViolationError(
          item.id,
          "Lease expired or was reclaimed before execution"
        );
      }

      const abortController = new AbortController();
      if (signal) {
        if (signal.aborted) {
          abortController.abort(signal.reason);
        } else {
          signal.addEventListener("abort", () => abortController.abort(signal.reason), { once: true });
        }
      }
      const effectiveSignal = abortController.signal;

      // Start background heartbeat to renew lease every 10 seconds during processing
      heartbeatTimer = setInterval(() => {
        if (effectiveSignal.aborted) {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          return;
        }

        inFlightHeartbeat = (async () => {
          try {
            if (effectiveSignal.aborted) return;
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
          } catch (err: unknown) {
            logger.warn(
              { commandId: item.id, workerId, err: err instanceof Error ? err.message : String(err) },
              "Heartbeat renewal threw exception; aborting in-flight dispatch (fail-closed)"
            );
            abortController.abort(
              new FencingViolationError(
                item.id,
                `Heartbeat renewal exception: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          } finally {
            inFlightHeartbeat = null;
          }
        })();
      }, 10000);
      heartbeatTimer.unref();

      if (effectiveSignal.aborted) {
        throw new FencingViolationError(item.id, "Dispatch was aborted by signal before execution");
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
        throw new FencingViolationError(
          item.id,
          "Dispatch aborted before external send"
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
          const canonicalCode = resolveCanonicalErrorCode(err, "permanent");
          const sanitizedError = sanitizeOutboxErrorMessage("permanent", canonicalCode);
          logger.warn(
            { commandId: item.id, workerId, errorCode: canonicalCode },
            "Permanent dispatch rejection from ChannelDispatchService"
          );
          await withWorkerTransaction(item.workspace_id, async (client) => {
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              sanitizedError,
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
          const canonicalCode = resolveCanonicalErrorCode(msg, "ambiguous");
          const sanitizedError = sanitizeOutboxErrorMessage("ambiguous", canonicalCode);
          logger.warn(
            { commandId: item.id, workerId, errorCode: canonicalCode },
            "Ambiguous timeout/socket reset during dispatch. Routing to reconciliation_required to prevent duplicate dispatch."
          );
          await withWorkerTransaction(item.workspace_id, async (client) => {
            await this.outboundRepo.markReconciliationRequired(
              item.id,
              workerId,
              item.lease_token,
              sanitizedError,
              client
            );
          }, pool);
          return { success: false, status: "reconciliation_required" };
        }

        throw err;
      }

      // Await any in-flight heartbeat and stop the timer before evaluating post-send ownership
      if (inFlightHeartbeat) {
        try {
          await inFlightHeartbeat;
        } catch {
          // ignore handled error
        }
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      // POST-SEND FENCING CHECK (P0-3):
      // After provider returns, verify ownership before finalization.
      // If ownership was lost after provider confirmed delivery, route to reconciliation, NEVER retry!
      const leaseLostDuringSend = effectiveSignal.aborted;
      const postSendRenewed = !leaseLostDuringSend && (await this.renewLease(pool, item.id, workerId, item.lease_token, 30));

      if (leaseLostDuringSend || !postSendRenewed) {
        if (sendResult.success) {
          logger.warn(
            { commandId: item.id, workerId },
            "Lease lost or expired during external send after provider confirmed delivery. Routing to reconciliation_required."
          );
          const sanitizedPostSendLeaseError = sanitizeOutboxErrorMessage("reconciliation", "ERR_LEASE_LOST_AFTER_SEND");
          try {
            await withWorkerTransaction(item.workspace_id, async (client) => {
              await this.outboundRepo.markPostSendReconciliationRequired(
                item.id,
                sendResult.externalMessageId!,
                sanitizedPostSendLeaseError,
                client
              );
            }, pool);
          } catch (reconErr: unknown) {
            logger.error(
              { commandId: item.id, workerId, err: reconErr instanceof Error ? reconErr.message : String(reconErr) },
              "Critical: Failed to record post-send lease loss reconciliation state"
            );
          }
          return {
            success: false,
            externalMessageId: sendResult.externalMessageId,
            status: "reconciliation_required",
          };
        } else {
          throw new FencingViolationError(item.id, "Lease lost during dispatch execution");
        }
      }

      // 3. Handle success: Transactional finalization of command, EXACT message, and delivery event
      if (sendResult.success) {
        try {
          await withWorkerTransaction(item.workspace_id, async (client) => {
            // Step 1: Verify channel instance and provider (fail-closed, no fallback)
            const chanRes = await client.query<{ provider: string }>(
              "SELECT provider FROM public.channel_instances WHERE id = $1 AND workspace_id = $2 AND is_active = true;",
              [item.channel_instance_id, item.workspace_id]
            );
            const provider = chanRes.rows[0]?.provider;
            if (!provider) {
              throw new ChannelInstanceNotFoundError(item.channel_instance_id, item.workspace_id);
            }

            // Step 2: Fencing update to 'sent'
            await this.outboundRepo.markSent(
              item.id,
              workerId,
              item.lease_token,
              sendResult.externalMessageId!,
              sendResult.sentAt ?? new Date(),
              client
            );

            // Step 3: Strictly update single message
            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'sent', status_rank = 10, provider_message_id = $1, updated_at = clock_timestamp()
                 WHERE id = $2 AND workspace_id = $3 AND channel_instance_id = $4;`,
                [sendResult.externalMessageId, item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }

            // Step 4: Record delivery event append-only without swallowing errors
            const rawEvent = JSON.stringify({
              externalMessageId: sendResult.externalMessageId,
              sentAt: sendResult.sentAt,
              commandId: item.id,
              status: "sent",
            });
            const eventHash = crypto.createHash("sha256").update(rawEvent).digest("hex");
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
                sendResult.sentAt ?? new Date(),
              ]
            );
          }, pool);

          return { success: true, externalMessageId: sendResult.externalMessageId, status: "sent" };
        } catch (postSendErr: unknown) {
          // Provider send succeeded, but local transactional finalization failed.
          // Incomplete transaction rolled back automatically.
          // Persist state reconciliation_required in new transaction to preserve externalMessageId and prevent duplicate dispatch!
          const errorDetail = postSendErr instanceof Error ? postSendErr.message : String(postSendErr);
          logger.error(
            { commandId: item.id, workerId, err: errorDetail },
            "Post-send persistence failed after provider confirmation. Routing to reconciliation_required to preserve externalMessageId and prevent duplicate dispatch."
          );

          const sanitizedPostSendError = sanitizeOutboxErrorMessage("reconciliation", "ERR_POST_SEND_PERSISTENCE_FAILED");
          try {
            await withWorkerTransaction(item.workspace_id, async (client) => {
              await this.outboundRepo.markPostSendReconciliationRequired(
                item.id,
                sendResult.externalMessageId!,
                sanitizedPostSendError,
                client
              );
            }, pool);
          } catch (reconErr: unknown) {
            logger.error(
              { commandId: item.id, workerId, err: reconErr instanceof Error ? reconErr.message : String(reconErr) },
              "Critical: Failed to record post-send reconciliation state after rollback"
            );
          }

          return {
            success: false,
            externalMessageId: sendResult.externalMessageId,
            status: "reconciliation_required",
          };
        }
      }

      // 4. Handle non-success response with centralized sanitization
      const canonicalErrorCode = resolveCanonicalErrorCode(sendResult.errorCode, sendResult.category);
      const sanitizedErrorMessage = sanitizeOutboxErrorMessage(sendResult.category, canonicalErrorCode);

      if (sendResult.category === "ambiguous") {
        // P0: Ambiguous results (timeout, socket reset) MUST NOT enter normal retry.
        // Set reconciliation_required to prevent duplicate external messages!
        await withWorkerTransaction(item.workspace_id, async (client) => {
          await this.outboundRepo.markReconciliationRequired(
            item.id,
            workerId,
            item.lease_token,
            sanitizedErrorMessage,
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
            sanitizedErrorMessage,
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
          const maxRetrySanitized = sanitizeOutboxErrorMessage("permanent", "ERR_RECONCILIATION_TTL_EXPIRED");
          await withWorkerTransaction(item.workspace_id, async (client) => {
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              maxRetrySanitized,
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
          sanitizedErrorMessage,
          nextAttemptAt,
          client
        );
      }, pool);
      return { success: false, status: "failed" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const causeMsg = (err instanceof Error && (err as any).cause instanceof Error) ? (err as any).cause.message : "";
      if (msg.includes("FENCING") || causeMsg.includes("FENCING") || (err instanceof FencingViolationError)) {
        throw err;
      }
      const canonicalCode = resolveCanonicalErrorCode(err, "transient");
      logger.error({ commandId: item.id, workerId, errorCode: canonicalCode }, "Exception during outbox dispatch");

      const decision = QueueRetryPolicy.evaluate(item.retry_count, item.max_retries, new Date(), {
        jitterRatio: 0.15,
      });
      const sanitizedError = sanitizeOutboxErrorMessage(
        decision.nextStatus === "dead_letter" ? "permanent" : "transient",
        canonicalCode
      );

      try {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          if (decision.nextStatus === "dead_letter") {
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              sanitizedError,
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
              sanitizedError,
              decision.nextAttemptAt ?? new Date(),
              client
            );
          }
        }, pool);
      } catch {
        logger.error({ commandId: item.id, workerId }, "Failed to update failed status for outbox command");
      }

      return { success: false, status: "failed" };
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (inFlightHeartbeat) {
        try {
          await inFlightHeartbeat;
        } catch {
          // ignore
        }
      }
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
      actorId?: string;
    } = {}
  ): Promise<boolean> {
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
    }

    const sanitizedNote = options.adminNote
      ? sanitizeOutboxErrorMessage(
          resolution === "dead_letter" ? "permanent" : "reconciliation",
          resolution === "dead_letter" ? "ERR_ADMIN_RESOLVED_DEAD_LETTER" : "ERR_ADMIN_RESOLVED_RETRY"
        )
      : undefined;

    return await withWorkerTransaction(workspaceId, async (client) => {
      const reconciled = await this.outboundRepo.adminReconcile(
        workspaceId,
        commandId,
        resolution,
        {
          externalMessageId: options.externalMessageId,
          adminNote: sanitizedNote || (resolution === "sent" ? "Reconciled: Externally verified sent" : undefined),
          actorId: options.actorId,
        },
        client
      );

      return Boolean(reconciled);
    }, pool);
  }

  /**
   * Reclaims abandoned processing leases and routes them directly to reconciliation_required.
   * Does NOT touch retry_count. Guarantees expired processing items never re-enter dispatch without reconciliation.
   */
  async reclaimExpiredLeases(pool: Pool, limit = 50): Promise<number> {
    return await this.outboundRepo.reclaimExpiredLeases(limit, pool);
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
        if (msg.includes("FENCING") || (err instanceof FencingViolationError)) {
          logger.warn({ commandId: item.id, workerId }, "Fencing abort or violation during dispatch");
        } else {
          logger.error({ commandId: item.id, workerId }, "Unhandled error during dispatch item");
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
   * 4. If no delivery event found: under P0-4 policy, command remains in 'reconciliation_required'
   *    (absence of webhook/evidence NEVER auto-retries). Releases lease so future ticks can re-evaluate.
   */
  async reconcileBatch(
    pool: Pool,
    workerId: string,
    limit = 10,
    _ttlSeconds = 60,
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
              const sanitizedDevError = sanitizeOutboxErrorMessage("reconciliation", "ERR_DELIVERY_FAILURE_CONFIRMED");
              await this.outboundRepo.resolveReconciliationDeadLetter(
                item.id,
                workerId,
                item.lease_token,
                sanitizedDevError,
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

          // 2. Inconclusive delivery: no provider delivery event found.
          // Under P0-4 policy: absence of webhook/evidence NEVER triggers automatic resend.
          // Command MUST remain in 'reconciliation_required'. Release lease so future ticks
          // or late webhook arrivals can re-evaluate.
          await this.outboundRepo.releaseReconciliationLease(
            item.id,
            workerId,
            item.lease_token,
            client
          );
          return;
        }, pool);
      } catch {
        logger.warn({ commandId: item.id, workerId }, "Failed to reconcile command");
      }
    }

    return reconciledCount;
  }
}
