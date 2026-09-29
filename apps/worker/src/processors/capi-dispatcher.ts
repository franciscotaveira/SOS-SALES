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

    try {
      if (this.endpointUrl) {
        // Explicit endpoint override (e.g. mock server or reverse proxy)
        const res = await fetch(this.endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
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
      }

      // Check if workspace has dedicated Meta credentials in provider_credentials
      let effectiveDatasetId = this.datasetId;
      let effectiveAccessToken = this.accessToken;

      if (!effectiveDatasetId || !effectiveAccessToken) {
        try {
          const credRows = await withWorkerTransaction(
            item.workspace_id,
            async (client) => {
              const res = await client.query<{
                encrypted_payload: string;
                iv: string;
                auth_tag: string;
                account_id: string;
              }>(
                `SELECT encrypted_payload, iv, auth_tag, account_id
                 FROM public.provider_credentials
                 WHERE workspace_id = $1 AND provider IN ('meta_waba', 'meta_capi') AND status = 'ACTIVE'
                 ORDER BY (CASE WHEN provider = 'meta_capi' THEN 0 ELSE 1 END) ASC
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

            if (masterKey) {
              try {
                const decrypted = decryptPayload(row.encrypted_payload, row.iv, row.auth_tag, masterKey);
                const parsed = JSON.parse(decrypted) as Record<string, unknown>;
                if (parsed.access_token) {
                  effectiveAccessToken = String(parsed.access_token);
                }
                if (parsed.pixel_id || parsed.dataset_id) {
                  effectiveDatasetId = String(parsed.pixel_id || parsed.dataset_id);
                } else if (parsed.waba_account_id) {
                  effectiveDatasetId = String(parsed.waba_account_id);
                } else if (row.account_id) {
                  effectiveDatasetId = row.account_id;
                }
              } catch {
                // Ignore decryption failure, fall back to unconfigured
              }
            }
          }
        } catch {
          // Ignore query failure, fall back to unconfigured
        }
      }

      if (effectiveDatasetId && effectiveAccessToken) {
        // Official Meta Graph API v21.0
        const url = `https://graph.facebook.com/v21.0/${effectiveDatasetId}/events?access_token=${encodeURIComponent(effectiveAccessToken)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Meta Graph API responded HTTP ${res.status}: ${errText}`);
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
      } else {
        // Honest Local Dev / Sandbox fallback (Truth in Data: never simulate real fbtrace_id)
        logger.info(
          { eventId: item.id, eventName: metaEventName, valueFloat },
          "Meta CAPI credentials not configured; marking event as SIMULATED without fake fbtrace_id"
        );
        const receipt = {
          mode: "simulated_local",
          reason: "Meta CAPI credentials not configured in workspace",
          dispatched_at: new Date().toISOString(),
        };

        await withWorkerTransaction(
          item.workspace_id,
          async (client) => {
            await markConversionEventResult(client, item.id, {
              status: "SIMULATED",
              receipt,
              error: "Meta CAPI credentials not configured in workspace (modo local simulado)",
              leaseToken: item.lease_token,
            });
          },
          pool
        );

        return {
          eventId: item.id,
          status: "simulated",
        };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ eventId: item.id, error: errMsg }, "Failed to dispatch Meta CAPI conversion");

      try {
        await withWorkerTransaction(
          item.workspace_id,
          async (client) => {
            await markConversionEventResult(client, item.id, {
              success: false,
              error: errMsg,
              leaseToken: item.lease_token,
            });
          },
          pool
        );
      } catch (markErr) {
        logger.error({ eventId: item.id, markErr }, "Failed to persist CAPI failure state");
      }

      return {
        eventId: item.id,
        status: "failed",
        error: errMsg,
      };
    }
  }
}
