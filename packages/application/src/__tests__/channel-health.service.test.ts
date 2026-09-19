import { describe, expect, it, vi } from "vitest";
import type { ChannelInstanceRecord } from "@sos-sales/database";
import {
  ChannelHealthService,
  ChannelAdapterRegistry,
  ChannelInstanceNotFoundError,
  type IChannelInstanceRepository,
  type IHealthCheckableAdapter,
  type ISigningSecretResolver,
} from "../index";

describe("ChannelHealthService: Evidence-Based Channel Health Evaluation (CH-10)", () => {
  const workspaceAlphaId = "11111111-1111-4111-8111-111111111111";
  const workspaceBetaId = "22222222-2222-4222-8222-222222222222";

  const wahaInstance: ChannelInstanceRecord = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspace_id: workspaceAlphaId,
    provider: "waha",
    display_name: "WAHA Line Support",
    phone_number_e164: "+5511999991111",
    endpoint_token_hash: "a".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: "cred-waha-1",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const wabaInstance: ChannelInstanceRecord = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    workspace_id: workspaceAlphaId,
    provider: "meta_waba",
    display_name: "WABA Official Line",
    phone_number_e164: "+5511988880000",
    endpoint_token_hash: "c".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: "cred-waba-1",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const inactiveInstance: ChannelInstanceRecord = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    workspace_id: workspaceAlphaId,
    provider: "waha",
    display_name: "Decommissioned Line",
    phone_number_e164: "+5511977770000",
    endpoint_token_hash: "d".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: "cred-waha-inactive",
    is_active: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const unassignedCredInstance: ChannelInstanceRecord = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    workspace_id: workspaceAlphaId,
    provider: "waha",
    display_name: "Unassigned Credential Line",
    phone_number_e164: "+5511966660000",
    endpoint_token_hash: "e".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockRepo: IChannelInstanceRepository = {
    getById: vi.fn(async (workspaceId: string, channelInstanceId: string) => {
      const records = [wahaInstance, wabaInstance, inactiveInstance, unassignedCredInstance];
      const found = records.find(
        (r) => r.id === channelInstanceId && r.workspace_id === workspaceId
      );
      if (!found) {
        const err = new Error(`Channel instance ${channelInstanceId} not found in workspace ${workspaceId}`);
        (err as any).code = "CHANNEL_INSTANCE_NOT_FOUND";
        throw err;
      }
      return found;
    }),
  };

  const createSecretResolver = (options?: {
    wahaKey?: string;
    wahaSession?: string;
    wabaToken?: string;
    wabaPhoneId?: string;
  }): ISigningSecretResolver => ({
    useSigningSecret: vi.fn(async () => null),
    useWahaOutboundCredentials: vi.fn(async (_instanceId, _wsId, fn) => {
      if (options?.wahaKey) {
        return fn({
          apiKey: options.wahaKey,
          session: options.wahaSession || "default",
          endpointUrl: "http://localhost:3000",
        });
      }
      return fn(null as any);
    }),
    useWabaOutboundCredentials: vi.fn(async (_instanceId, _wsId, fn) => {
      if (options?.wabaToken && options?.wabaPhoneId) {
        return fn({
          accessToken: options.wabaToken,
          phoneNumberId: options.wabaPhoneId,
        });
      }
      return fn(null as any);
    }),
  });

  it("fails closed with ChannelInstanceNotFoundError for invalid UUID or missing instance", async () => {
    const registry = new ChannelAdapterRegistry();
    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver(),
    });

    await expect(
      service.evaluateChannelHealth("invalid-uuid", wahaInstance.id)
    ).rejects.toThrow(ChannelInstanceNotFoundError);

    await expect(
      service.evaluateChannelHealth(workspaceBetaId, wahaInstance.id)
    ).rejects.toThrow(ChannelInstanceNotFoundError);
  });

  it("reports state 'inactive' when channel instance is disabled", async () => {
    const registry = new ChannelAdapterRegistry();
    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver(),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, inactiveInstance.id);
    expect(report.state).toBe("inactive");
    expect(report.reasonCode).toBe("INSTANCE_DEACTIVATED");
    expect(report.availableCapabilities).toHaveLength(0);
  });

  it("reports state 'misconfigured' when credential_id is not assigned", async () => {
    const registry = new ChannelAdapterRegistry();
    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver(),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, unassignedCredInstance.id);
    expect(report.state).toBe("misconfigured");
    expect(report.reasonCode).toBe("CREDENTIAL_UNASSIGNED");
    expect(report.availableCapabilities).toHaveLength(0);
  });

  it("reports state 'misconfigured' when adapter is not registered in registry", async () => {
    const registry = new ChannelAdapterRegistry(); // empty registry
    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver(),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("misconfigured");
    expect(report.reasonCode).toBe("ADAPTER_NOT_REGISTERED");
    expect(report.availableCapabilities).toHaveLength(0);
  });

  it("delegates to adapter.checkHealth when custom check method is implemented", async () => {
    const registry = new ChannelAdapterRegistry();
    const customAdapter: IHealthCheckableAdapter = {
      provider: "waha",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
      checkHealth: vi.fn(async () => ({
        state: "healthy" as const,
        reasonCode: "CUSTOM_ENGINE_OK",
        reasonMessage: "Custom engine verified live",
        capabilities: ["text", "media"],
        technicalEvidence: { cluster: "node-1" },
      })),
    };
    registry.register(customAdapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver({ wahaKey: "secret" }),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("healthy");
    expect(report.reasonCode).toBe("CUSTOM_ENGINE_OK");
    expect(report.lastKnownTechnicalEvidence?.status).toBe("HEALTHY");
    expect(report.lastKnownTechnicalEvidence?.endpointReachable).toBe(true);
    expect(report.lastKnownTechnicalEvidence).not.toHaveProperty("cluster");
  });

  it("reports state 'unavailable' when adapter.checkHealth throws an unexpected error", async () => {
    const registry = new ChannelAdapterRegistry();
    const customAdapter: IHealthCheckableAdapter = {
      provider: "waha",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
      checkHealth: vi.fn(async () => {
        throw new Error("Internal adapter health check crash");
      }),
    };
    registry.register(customAdapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver({ wahaKey: "secret" }),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("unavailable");
    expect(report.reasonCode).toBe("ADAPTER_HEALTH_CHECK_FAILED");
    expect(report.reasonMessage).toBe("Adapter health check probe failed to respond");
    expect(report.reasonMessage).not.toContain("Internal adapter health check crash");
    expect(report.lastKnownTechnicalEvidence?.status).toBe("UNAVAILABLE");
    expect(report.lastKnownTechnicalEvidence?.endpointReachable).toBe(false);
    expect(report.lastKnownTechnicalEvidence).not.toHaveProperty("error");
  });

  it("WAHA: reports 'misconfigured' when apiKey cannot be resolved from vault", async () => {
    const registry = new ChannelAdapterRegistry();
    const adapter: IHealthCheckableAdapter = {
      provider: "waha",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
      getSession: vi.fn(),
    };
    registry.register(adapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver(), // No wahaKey
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("misconfigured");
    expect(report.reasonCode).toBe("CREDENTIALS_MISSING");
  });

  it("WAHA: reports 'healthy' with evidence when getSession returns status 'WORKING'", async () => {
    const registry = new ChannelAdapterRegistry();
    const adapter: IHealthCheckableAdapter = {
      provider: "waha",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
      getSession: vi.fn(async () => ({
        name: "default",
        status: "WORKING",
        me: { id: "5511999991111@c.us" },
      })),
    };
    registry.register(adapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver({ wahaKey: "valid-key", wahaSession: "default" }),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("healthy");
    expect(report.reasonCode).toBe("WAHA_SESSION_WORKING");
    expect(report.availableCapabilities).toEqual(["text", "media", "qr_code"]);
    expect(report.lastKnownTechnicalEvidence?.status).toBe("WORKING");
    expect(report.lastKnownTechnicalEvidence?.endpointReachable).toBe(true);
    expect(typeof report.lastKnownTechnicalEvidence?.checkedAt).toBe("string");
    // Verify zero PII / non-allowlisted fields
    expect(report.lastKnownTechnicalEvidence).not.toHaveProperty("me");
    expect(report.lastKnownTechnicalEvidence).not.toHaveProperty("session");
    expect(JSON.stringify(report.lastKnownTechnicalEvidence)).not.toContain("5511999991111");
  });

  it("WAHA: reports 'degraded' when getSession returns status 'SCAN_QR_CODE' or 'STARTING'", async () => {
    const registry = new ChannelAdapterRegistry();
    const adapter: IHealthCheckableAdapter = {
      provider: "waha",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
      getSession: vi.fn(async () => ({
        name: "default",
        status: "SCAN_QR_CODE",
      })),
    };
    registry.register(adapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver({ wahaKey: "valid-key" }),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("degraded");
    expect(report.reasonCode).toBe("WAHA_SESSION_SCAN_QR_CODE");
    expect(report.availableCapabilities).toEqual(["qr_code"]);
    expect(report.lastKnownTechnicalEvidence?.status).toBe("SCAN_QR_CODE");
    expect(report.lastKnownTechnicalEvidence?.endpointReachable).toBe(true);
    expect(report.lastKnownTechnicalEvidence).not.toHaveProperty("session");
  });

  it("WAHA: reports 'unavailable' when getSession returns 'STOPPED' or throws network failure", async () => {
    const registry = new ChannelAdapterRegistry();
    const adapter: IHealthCheckableAdapter = {
      provider: "waha",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
      getSession: vi.fn(async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3000");
      }),
    };
    registry.register(adapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver({ wahaKey: "valid-key" }),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("unavailable");
    expect(report.reasonCode).toBe("WAHA_NODE_UNREACHABLE");
    expect(report.reasonMessage).toBe("WAHA engine endpoint is unreachable or returned an error");
    expect(report.reasonMessage).not.toContain("ECONNREFUSED");
    expect(report.lastKnownTechnicalEvidence?.status).toBe("UNREACHABLE");
    expect(report.lastKnownTechnicalEvidence?.endpointReachable).toBe(false);
    expect(report.lastKnownTechnicalEvidence).not.toHaveProperty("error");
  });

  it("WAHA: never assumes healthy when getSession is not available; reports 'unknown'", async () => {
    const registry = new ChannelAdapterRegistry();
    const adapterWithoutProbe: IHealthCheckableAdapter = {
      provider: "waha",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
    };
    registry.register(adapterWithoutProbe);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver({ wahaKey: "valid-key" }),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wahaInstance.id);
    expect(report.state).toBe("unknown");
    expect(report.reasonCode).toBe("EVIDENCE_NOT_ACQUIRED");
  });

  it("Meta WABA: reports 'misconfigured' when accessToken or phoneNumberId is absent", async () => {
    const registry = new ChannelAdapterRegistry();
    const adapter: IHealthCheckableAdapter = {
      provider: "meta_waba",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
    };
    registry.register(adapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver(), // No waba credentials
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wabaInstance.id);
    expect(report.state).toBe("misconfigured");
    expect(report.reasonCode).toBe("CREDENTIALS_MISSING");
  });

  it("Meta WABA: never claims healthy without live external probe; reports 'unknown'", async () => {
    const registry = new ChannelAdapterRegistry();
    const adapter: IHealthCheckableAdapter = {
      provider: "meta_waba",
      sendMessage: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "msg-test",
        sentAt: new Date(),
      })),
    };
    registry.register(adapter);

    const service = new ChannelHealthService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: createSecretResolver({
        wabaToken: "EAA...",
        wabaPhoneId: "10987654321",
      }),
    });

    const report = await service.evaluateChannelHealth(workspaceAlphaId, wabaInstance.id);
    expect(report.state).toBe("unknown");
    expect(report.reasonCode).toBe("EXTERNAL_PROBE_PENDING");
    expect(report.availableCapabilities).toContain("template");
    expect(report.lastKnownTechnicalEvidence?.status).toBe("PENDING_PROBE");
    expect(report.lastKnownTechnicalEvidence?.endpointReachable).toBe(false);
    expect(report.lastKnownTechnicalEvidence).not.toHaveProperty("phoneNumberIdConfigured");
  });
});
