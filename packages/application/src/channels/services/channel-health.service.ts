import type { ChannelProvider } from "@sos-sales/contracts";
import type { ChannelInstanceRecord } from "@sos-sales/database";
import type { ChannelAdapterRegistry } from "../registry/channel-adapter.registry";
import type { ISigningSecretResolver } from "./signature-verification.service";
import type { IChannelAdapter } from "../adapters/channel-adapter.interface";
import { ChannelInstanceNotFoundError } from "../errors/channel-dispatch.errors";
import type { IChannelInstanceRepository } from "./channel-dispatch.service";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChannelHealthState =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "misconfigured"
  | "inactive"
  | "unknown";

export interface ChannelHealthReport {
  readonly workspaceId: string;
  readonly channelInstanceId: string;
  readonly provider: ChannelProvider;
  readonly state: ChannelHealthState;
  readonly timestamp: string;
  readonly reasonCode: string;
  readonly reasonMessage?: string;
  readonly availableCapabilities: readonly string[];
  readonly lastKnownTechnicalEvidence?: Record<string, unknown>;
}

export interface ChannelHealthServiceOptions {
  readonly channelInstanceRepo: IChannelInstanceRepository;
  readonly adapterRegistry: ChannelAdapterRegistry;
  readonly secretResolver: ISigningSecretResolver;
}

export interface IHealthCheckableAdapter extends IChannelAdapter {
  checkHealth?(
    channelInstanceId: string,
    workspaceId: string,
    secretResolver: ISigningSecretResolver
  ): Promise<{
    state: ChannelHealthState;
    reasonCode: string;
    reasonMessage?: string;
    capabilities?: readonly string[];
    technicalEvidence?: Record<string, unknown>;
  }>;
  getSession?(
    session: string,
    secretResolver: ISigningSecretResolver,
    workspaceId: string,
    channelInstanceId: string
  ): Promise<{ name?: string; status?: string; me?: Record<string, unknown> }>;
}

export class ChannelHealthService {
  private readonly repo: IChannelInstanceRepository;
  private readonly registry: ChannelAdapterRegistry;
  private readonly secretResolver: ISigningSecretResolver;

  constructor(options: ChannelHealthServiceOptions) {
    this.repo = options.channelInstanceRepo;
    this.registry = options.adapterRegistry;
    this.secretResolver = options.secretResolver;
  }

  /**
   * Evaluates operational health of a channel instance.
   *
   * Invariant: Never states "healthy" merely because a row exists in the database.
   * Requires recent, verified technical evidence from the engine/adapter; otherwise
   * marks as "unknown" or "degraded".
   */
  async evaluateChannelHealth(
    workspaceId: string,
    channelInstanceId: string
  ): Promise<ChannelHealthReport> {
    const timestamp = new Date().toISOString();

    // 1. Validate UUIDs
    if (!UUID_REGEX.test(workspaceId) || !UUID_REGEX.test(channelInstanceId)) {
      throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
    }

    // 2. Fetch instance record
    let instance: ChannelInstanceRecord;
    try {
      instance = await this.repo.getById(workspaceId, channelInstanceId);
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "CHANNEL_INSTANCE_NOT_FOUND") {
        throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
      }
      throw err;
    }

    // 3. Inactive instance check
    if (!instance.is_active) {
      return {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        state: "inactive",
        timestamp,
        reasonCode: "INSTANCE_DEACTIVATED",
        reasonMessage: "Channel instance is explicitly disabled in workspace settings",
        availableCapabilities: [],
      };
    }

    // 4. Missing credential reference check
    if (!instance.credential_id) {
      return {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        state: "misconfigured",
        timestamp,
        reasonCode: "CREDENTIAL_UNASSIGNED",
        reasonMessage: "No credential record associated with channel instance",
        availableCapabilities: [],
      };
    }

    // 5. Check adapter registration
    if (!this.registry.has(instance.provider)) {
      return {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        state: "misconfigured",
        timestamp,
        reasonCode: "ADAPTER_NOT_REGISTERED",
        reasonMessage: `No adapter registered for provider '${instance.provider}'`,
        availableCapabilities: [],
      };
    }

    const adapter = this.registry.get(instance.provider) as IHealthCheckableAdapter;

    // 6. Delegate to adapter checkHealth if implemented
    if (typeof adapter.checkHealth === "function") {
      try {
        const custom = await adapter.checkHealth(instance.id, workspaceId, this.secretResolver);
        return {
          workspaceId,
          channelInstanceId: instance.id,
          provider: instance.provider,
          state: custom.state,
          timestamp,
          reasonCode: custom.reasonCode,
          reasonMessage: custom.reasonMessage,
          availableCapabilities: custom.capabilities || (instance.provider === "meta_waba" ? ["text", "media", "template"] : ["text", "media"]),
          lastKnownTechnicalEvidence: custom.technicalEvidence,
        };
      } catch (err) {
        return {
          workspaceId,
          channelInstanceId: instance.id,
          provider: instance.provider,
          state: "unavailable",
          timestamp,
          reasonCode: "ADAPTER_HEALTH_CHECK_FAILED",
          reasonMessage: err instanceof Error ? err.message : String(err),
          availableCapabilities: [],
          lastKnownTechnicalEvidence: { error: String(err) },
        };
      }
    }

    // 7. Provider-specific evidence verification
    if (instance.provider === "waha") {
      return this.evaluateWahaHealth(instance, workspaceId, adapter, timestamp);
    }

    if (instance.provider === "meta_waba") {
      return this.evaluateWabaHealth(instance, workspaceId, timestamp);
    }

    // Default unknown if no evidence provider
    return {
      workspaceId,
      channelInstanceId: instance.id,
      provider: instance.provider,
      state: "unknown",
      timestamp,
      reasonCode: "EVIDENCE_NOT_ACQUIRED",
      reasonMessage: "No technical evidence could be retrieved for channel instance",
      availableCapabilities: ["text"],
    };
  }

  private async evaluateWahaHealth(
    instance: ChannelInstanceRecord,
    workspaceId: string,
    adapter: IHealthCheckableAdapter,
    timestamp: string
  ): Promise<ChannelHealthReport> {
    // Verify credentials resolution
    let hasValidCreds = false;
    let targetSession = "default";

    if (this.secretResolver.useWahaOutboundCredentials) {
      await this.secretResolver.useWahaOutboundCredentials(instance.id, workspaceId, (creds) => {
        if (creds?.apiKey) {
          hasValidCreds = true;
          if (creds.session) targetSession = creds.session;
        }
      });
    }

    if (!hasValidCreds) {
      return {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        state: "misconfigured",
        timestamp,
        reasonCode: "CREDENTIALS_MISSING",
        reasonMessage: "WAHA apiKey or session could not be resolved from credential vault",
        availableCapabilities: [],
      };
    }

    // Query technical evidence via getSession if available
    if (typeof adapter.getSession === "function") {
      try {
        const sessionInfo = await adapter.getSession(targetSession, this.secretResolver, workspaceId, instance.id);
        const rawStatus = (sessionInfo.status || "UNKNOWN").toUpperCase();

        if (rawStatus === "WORKING") {
          return {
            workspaceId,
            channelInstanceId: instance.id,
            provider: instance.provider,
            state: "healthy",
            timestamp,
            reasonCode: "WAHA_SESSION_WORKING",
            reasonMessage: "WAHA session is authenticated and connected to WhatsApp engine",
            availableCapabilities: ["text", "media", "qr_code"],
            lastKnownTechnicalEvidence: {
              session: sessionInfo.name || targetSession,
              status: rawStatus,
              me: sessionInfo.me,
            },
          };
        }

        if (rawStatus === "STARTING" || rawStatus === "SCAN_QR_CODE") {
          return {
            workspaceId,
            channelInstanceId: instance.id,
            provider: instance.provider,
            state: "degraded",
            timestamp,
            reasonCode: `WAHA_SESSION_${rawStatus}`,
            reasonMessage: `WAHA session is in '${rawStatus}' state (awaiting QR scan or boot)`,
            availableCapabilities: ["qr_code"],
            lastKnownTechnicalEvidence: {
              session: targetSession,
              status: rawStatus,
            },
          };
        }

        return {
          workspaceId,
          channelInstanceId: instance.id,
          provider: instance.provider,
          state: "unavailable",
          timestamp,
          reasonCode: `WAHA_SESSION_${rawStatus}`,
          reasonMessage: `WAHA session is disconnected or stopped (status: ${rawStatus})`,
          availableCapabilities: [],
          lastKnownTechnicalEvidence: {
            session: targetSession,
            status: rawStatus,
          },
        };
      } catch (err) {
        return {
          workspaceId,
          channelInstanceId: instance.id,
          provider: instance.provider,
          state: "unavailable",
          timestamp,
          reasonCode: "WAHA_NODE_UNREACHABLE",
          reasonMessage: `Failed to query WAHA engine: ${err instanceof Error ? err.message : String(err)}`,
          availableCapabilities: [],
          lastKnownTechnicalEvidence: {
            error: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    // If getSession is not available, cannot declare healthy without evidence
    return {
      workspaceId,
      channelInstanceId: instance.id,
      provider: instance.provider,
      state: "unknown",
      timestamp,
      reasonCode: "EVIDENCE_NOT_ACQUIRED",
      reasonMessage: "WAHA adapter does not expose live session query method; status cannot be verified",
      availableCapabilities: ["text", "media"],
    };
  }

  private async evaluateWabaHealth(
    instance: ChannelInstanceRecord,
    workspaceId: string,
    timestamp: string
  ): Promise<ChannelHealthReport> {
    let hasValidCreds = false;
    let phoneNumberId = "";

    if (this.secretResolver.useWabaOutboundCredentials) {
      await this.secretResolver.useWabaOutboundCredentials(instance.id, workspaceId, (creds) => {
        if (creds?.accessToken && creds?.phoneNumberId) {
          hasValidCreds = true;
          phoneNumberId = creds.phoneNumberId;
        }
      });
    }

    if (!hasValidCreds) {
      return {
        workspaceId,
        channelInstanceId: instance.id,
        provider: instance.provider,
        state: "misconfigured",
        timestamp,
        reasonCode: "CREDENTIALS_MISSING",
        reasonMessage: "Meta WABA accessToken or phoneNumberId could not be resolved from credential vault",
        availableCapabilities: [],
      };
    }

    // For WABA in hermetic CI: without live Graph API probe, state cannot be assumed healthy
    // It is reported as unknown or degraded pending live external probe (EXT-03)
    return {
      workspaceId,
      channelInstanceId: instance.id,
      provider: instance.provider,
      state: "unknown",
      timestamp,
      reasonCode: "EXTERNAL_PROBE_PENDING",
      reasonMessage: "WABA credentials structurally valid; external Graph API probe requires EXT-03",
      availableCapabilities: ["text", "media", "template"],
      lastKnownTechnicalEvidence: {
        phoneNumberIdConfigured: Boolean(phoneNumberId),
      },
    };
  }
}
