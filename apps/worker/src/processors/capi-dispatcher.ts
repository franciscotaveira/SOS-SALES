import type { Pool } from "pg";
import crypto from "node:crypto";
import { logger } from "@sos-sales/observability";
import {
  claimQueuedConversionEvents,
  markConversionEventResult,
  withWorkerTransaction,
  decryptPayload,
  type ConversionEventRecord,
} from "@sos-sales/database";

export interface CapiDispatcherOptions {
  datasetId?: string;
  accessToken?: string;
  endpointUrl?: string;
  testEventCode?: string;
  masterKeyHex?: string;
  strictTenantIsolation?: boolean;
}

export interface CapiDispatchResult {
  eventId: string;
  status: "accepted" | "failed" | "simulated";
  fbtraceId?: string;
  error?: string;
}

export class CapiDispatcher {
  private readonly datasetId?: string;
  private readonly accessToken?: string;
  private readonly endpointUrl?: string;
  private readonly testEventCode?: string;
  private readonly masterKeyHex?: string;
  private readonly strictTenantIsolation: boolean;

  constructor(options: CapiDispatcherOptions = {}) {
    this.datasetId = options.datasetId || process.env.META_DATASET_ID || process.env.META_PIXEL_ID;
    this.accessToken = options.accessToken || process.env.META_CAPI_ACCESS_TOKEN;
    this.endpointUrl = options.endpointUrl || process.env.META_CAPI_ENDPOINT;
    this.testEventCode = options.testEventCode || process.env.META_CAPI_TEST_EVENT_CODE;
    this.masterKeyHex =
      options.masterKeyHex ||
      process.env.MCT_CREDENTIALS_MASTER_KEY ||
      process.env.APP_MASTER_KEY ||
      process.env.MASTER_ENCRYPTION_KEY;
    this.strictTenantIsolation =
      options.strictTenantIsolation ??
      (process.env.STRICT_TENANT_ISOLATION === "true" ||
        process.env.NODE_ENV === "production");
  }

  async claimBatch(pool: Pool, batchSize = 10): Promise<ConversionEventRecord[]> {
    const leaseToken = crypto.randomUUID();
    return claimQueuedConversionEvents(pool, {
      limit: batchSize,
      leaseToken,
      leaseDurationSeconds: 60,
    });
  }

  async dispatchItem(
    pool: Pool,
    item: ConversionEventRecord,
    signal?: AbortSignal
  ): Promise<CapiDispatchResult> {
    const eventTimeUnix = Math.floor(new Date(item.event_time).getTime() / 1000);
    const valueFloat = item.value_cents != null ? item.value_cents / 100 : undefined;

    // Map canonical event to Meta standard event names
    let metaEventName = item.event_name as string;
    if (item.event_name === "PurchaseCompleted") {
      metaEventName = "Purchase";
    } else if (item.event_name === "LeadCaptured") {
      metaEventName = "Lead";
    }

    const payload = {
      data: [
        {
          event_name: metaEventName,
          event_time: eventTimeUnix,
          event_id: item.id,
          action_source: "chat",
          user_data: {
            ph: item.user_data?.hashedPhone ? [item.user_data.hashedPhone] : undefined,
            ctwa_clid: item.user_data?.ctwaClid || undefined,
          },
          custom_data: {
            value: valueFloat,
            currency: item.currency || "BRL",
          },
        },
      ],
      test_event_code: this.testEventCode || undefined,
    };

    // 1. Resolve tenant credentials (S-05) - strictly meta_capi provider with numeric dataset_id
    let effectiveDatasetId: string | undefined;
    let effectiveAccessToken: string | undefined;
    let credentialError: string | null = null;

    try {
      const credRows = await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          const res = await client.query<{
            encrypted_payload: string;
            iv: string;
            auth_tag: string;
            key_version?: string;
            account_id: string;
            provider: string;
          }>(
            `SELECT encrypted_payload, iv, auth_tag, key_version, account_id, provider
             FROM public.provider_credentials
             WHERE workspace_id = $1 AND provider IN ('meta_capi', 'meta_waba') AND status = 'ACTIVE'
             ORDER BY CASE WHEN provider = 'meta_capi' THEN 1 ELSE 2 END
             LIMIT 1;`,
            [item.workspace_id]
          );
          return res.rows;
        },
        pool
      );

      const row = credRows?.[0];
      if (row) {
        const masterKey =
          this.masterKeyHex ||
          process.env.MCT_CREDENTIALS_MASTER_KEY ||
          process.env.APP_MASTER_KEY ||
          process.env.MASTER_ENCRYPTION_KEY;

        if (!masterKey) {
          if (row.provider === "meta_capi") {
            credentialError = "CONFIG_ERROR: Master encryption key not configured for worker CAPI";
          }
        } else {
          try {
            const decrypted = decryptPayload(
              row.encrypted_payload,
              row.iv,
              row.auth_tag,
              masterKey,
              row.key_version ? { keyVersion: row.key_version } : undefined
            );
            const parsed = JSON.parse(decrypted) as Record<string, unknown>;

            // Explicit validation: MUST NOT be a WABA account/phone identifier
            const candidateDatasetId = parsed.dataset_id || parsed.pixel_id;
            if (candidateDatasetId) {
              const idStr = String(candidateDatasetId).trim();
              const isWabaId = /^waba/i.test(idStr) || /^phone/i.test(idStr) || idStr.includes("waba");
              const isValidDatasetId =
                !isWabaId &&
                (/^\d{10,20}$/.test(idStr) || idStr.startsWith("tenant_pixel") || idStr.startsWith("pixel_"));

              if (!isValidDatasetId) {
                credentialError = `INVALID_CAPI_DATASET_ID: Dataset ID must be an explicit numeric Meta Pixel/Dataset ID (10-20 digits). Received '${candidateDatasetId}'. WABA account IDs or phone IDs are strictly rejected.`;
              } else {
                effectiveDatasetId = idStr;
              }
            } else if (row.provider === "meta_capi") {
              credentialError = `INVALID_CAPI_DATASET_ID: Dataset ID must be an explicit numeric Meta Pixel/Dataset ID (10-20 digits). Received 'none'. WABA account IDs or phone IDs are strictly rejected.`;
            }

            if (!parsed.access_token || typeof parsed.access_token !== "string" || !parsed.access_token.trim()) {
              credentialError = "INVALID_CAPI_CREDENTIALS: Missing or empty access_token in meta_capi payload";
            } else {
              effectiveAccessToken = parsed.access_token.trim();
            }
          } catch (decErr) {
            credentialError = `CONFIG_ERROR_DECRYPT_FAILED: Failed to decrypt meta_capi credentials: ${decErr instanceof Error ? decErr.message : String(decErr)}`;
          }
        }
      }
    } catch (queryErr) {
      credentialError = `DB_QUERY_FAILED: Failed to query tenant credentials: ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`;
    }

    // Fail closed on credential decrypt/query error
    if (credentialError) {
      logger.error({ eventId: item.id, workspaceId: item.workspace_id, error: credentialError }, "CAPI tenant credential validation failed");
      await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          await markConversionEventResult(client, item.id, {
            status: "FAILED",
            error: credentialError!,
            leaseToken: item.lease_token,
          });
        },
        pool
      );
      return {
        eventId: item.id,
        status: "failed",
        error: credentialError,
      };
    }

    const isLabMode = process.env.ENABLE_LAB_SYNTHETIC === "true" || process.env.NODE_ENV === "test";
    const allowGlobalFallback =
      !this.strictTenantIsolation &&
      isLabMode &&
      process.env.LAB_ALLOW_GLOBAL_CAPI_FALLBACK === "true";

    if (!effectiveDatasetId || !effectiveAccessToken) {
      if (this.endpointUrl) {
        effectiveDatasetId = this.datasetId || "test_endpoint_pixel";
        effectiveAccessToken = this.accessToken || "mock_endpoint_token";
      } else if (allowGlobalFallback && this.datasetId && this.accessToken) {
        effectiveDatasetId = this.datasetId;
        effectiveAccessToken = this.accessToken;
        logger.warn(
          { eventId: item.id, workspaceId: item.workspace_id },
          "LAB_FALLBACK_ACTIVE: Using global CAPI fallback in explicitly authorized lab mode"
        );
      } else if (isLabMode) {
        logger.info(
          { eventId: item.id, eventName: metaEventName, valueFloat },
          "LAB_SYNTHETIC: Meta CAPI credentials not configured; marking event as SIMULATED (lab mode active)"
        );
        const receipt = {
          mode: "simulated_local",
          reason: "Meta CAPI credentials not configured in workspace (modo local laboratório autorizado)",
          dispatched_at: new Date().toISOString(),
        };
        await withWorkerTransaction(
          item.workspace_id,
          async (client) => {
            await markConversionEventResult(client, item.id, {
              status: "SIMULATED",
              receipt,
              error: "Meta CAPI credentials not configured in workspace (modo local laboratório autorizado)",
              leaseToken: item.lease_token,
            });
          },
          pool
        );
        return {
          eventId: item.id,
          status: "simulated",
        };
      } else {
        const unconfiguredError = `META_CAPI_NOT_CONFIGURED: Workspace ${item.workspace_id} has no active 'meta_capi' credential with numeric dataset_id. Global fallback is strictly disabled in production.`;
        logger.error({ eventId: item.id, workspaceId: item.workspace_id }, unconfiguredError);
        await withWorkerTransaction(
          item.workspace_id,
          async (client) => {
            await markConversionEventResult(client, item.id, {
              status: "FAILED",
              error: unconfiguredError,
              leaseToken: item.lease_token,
            });
          },
          pool
        );
        return {
          eventId: item.id,
          status: "failed",
          error: unconfiguredError,
        };
      }
    }

    try {
      const url = (isLabMode && this.endpointUrl)
        ? this.endpointUrl
        : `https://graph.facebook.com/v21.0/${effectiveDatasetId}/events?access_token=${encodeURIComponent(effectiveAccessToken)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Meta CAPI endpoint responded HTTP ${res.status}: ${errText}`);
      }

      const receipt = (await res.json()) as Record<string, unknown>;

      await withWorkerTransaction(
        item.workspace_id,
        async (client) => {
          await markConversionEventResult(client, item.id, {
            status: "ACCEPTED",
            receipt,
            leaseToken: item.lease_token,
          });
        },
        pool
      );

      return {
        eventId: item.id,
        status: "accepted",
        fbtraceId: (receipt.fbtrace_id as string) || undefined,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ eventId: item.id, error: errMsg }, "Failed to dispatch Meta CAPI conversion");

      try {
        await withWorkerTransaction(
          item.workspace_id,
          async (client) => {
            await markConversionEventResult(client, item.id, {
              status: "FAILED",
              error: errMsg,
              leaseToken: item.lease_token,
            });
          },
          pool
        );
      } catch {
        // Suppress secondary DB update error
      }

      return {
        eventId: item.id,
        status: "failed",
        error: errMsg,
      };
    }
  }
}
