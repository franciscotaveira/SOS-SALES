import { describe, expect, it, vi } from "vitest";
import type { ChannelInstanceRecord } from "@sos-sales/database";
import {
  ChannelDispatchService,
  ChannelAdapterRegistry,
  ChannelInstanceNotFoundError,
  ChannelInstanceInactiveError,
  ChannelAdapterNotFoundError,
  ChannelCapabilityUnsupportedError,
  ChannelProviderUnavailableError,
  maskRecipientPhone,
  type IChannelInstanceRepository,
  type IChannelDispatchLogger,
  type IChannelAdapter,
  type ChannelSendResult,
  type OutboundSendParams,
  type ISigningSecretResolver,
} from "../index";

describe("ChannelDispatchService: Explicit Multi-Provider Outbound Routing (CH-10)", () => {
  const workspaceAlphaId = "11111111-1111-4111-8111-111111111111";
  const workspaceBetaId = "22222222-2222-4222-8222-222222222222";

  const wahaInstanceLine1: ChannelInstanceRecord = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspace_id: workspaceAlphaId,
    provider: "waha",
    display_name: "WAHA Line 1 Support",
    phone_number_e164: "+5511999991111",
    endpoint_token_hash: "a".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: "cred-alpha-1",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const wahaInstanceLine2: ChannelInstanceRecord = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspace_id: workspaceAlphaId,
    provider: "waha",
    display_name: "WAHA Line 2 Sales",
    phone_number_e164: "+5511999992222",
    endpoint_token_hash: "b".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: "cred-alpha-2",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const wabaInstance: ChannelInstanceRecord = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    workspace_id: workspaceAlphaId,
    provider: "meta_waba",
    display_name: "WABA Official Account",
    phone_number_e164: "+5511988880000",
    endpoint_token_hash: "c".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: "cred-alpha-waba",
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
    credential_id: null,
    is_active: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const betaInstance: ChannelInstanceRecord = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    workspace_id: workspaceBetaId,
    provider: "waha",
    display_name: "Beta Workspace Private Line",
    phone_number_e164: "+5511966660000",
    endpoint_token_hash: "e".repeat(64),
    previous_token_hash: null,
    previous_token_valid_until: null,
    verify_token_hash: null,
    credential_id: "cred-beta-1",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Mock repository with strict tenant-first simulation
  const mockRepo: IChannelInstanceRepository = {
    async getById(workspaceId: string, channelInstanceId: string): Promise<ChannelInstanceRecord> {
      const all = [wahaInstanceLine1, wahaInstanceLine2, wabaInstance, inactiveInstance, betaInstance];
      const match = all.find((i) => i.id === channelInstanceId && i.workspace_id === workspaceId);
      if (!match) {
        // Strict anti-enumeration: indistinguishable between non-existent and cross-tenant
        throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
      }
      return match;
    },
  };

  const mockSecretResolver: ISigningSecretResolver = {
    async useSigningSecret<T>(_c: string, _w: string, fn: (s: string) => Promise<T> | T): Promise<T | null> {
      return fn("test_secret");
    },
  };

  function createTestSetup() {
    const wahaSendMessageMock = vi.fn().mockImplementation(async (params: OutboundSendParams): Promise<ChannelSendResult> => {
      return {
        success: true,
        externalMessageId: `waha_msg_${params.channelInstanceId}_${Date.now()}`,
        sentAt: new Date(),
      };
    });

    const wabaSendMessageMock = vi.fn().mockImplementation(async (params: OutboundSendParams): Promise<ChannelSendResult> => {
      return {
        success: true,
        externalMessageId: `waba_msg_${params.channelInstanceId}_${Date.now()}`,
        sentAt: new Date(),
      };
    });

    const mockWahaAdapter: IChannelAdapter = {
      provider: "waha",
      sendMessage: wahaSendMessageMock,
    };

    const mockWabaAdapter: IChannelAdapter = {
      provider: "meta_waba",
      sendMessage: wabaSendMessageMock,
    };

    const registry = new ChannelAdapterRegistry([mockWahaAdapter, mockWabaAdapter]);

    const logEntries: Array<{ level: string; msg: string; meta?: Record<string, unknown> }> = [];
    const mockLogger: IChannelDispatchLogger = {
      info: (msg, meta) => logEntries.push({ level: "info", msg, meta }),
      warn: (msg, meta) => logEntries.push({ level: "warn", msg, meta }),
      error: (msg, meta) => logEntries.push({ level: "error", msg, meta }),
    };

    const service = new ChannelDispatchService({
      channelInstanceRepo: mockRepo,
      adapterRegistry: registry,
      secretResolver: mockSecretResolver,
      logger: mockLogger,
    });

    return {
      service,
      registry,
      wahaSendMessageMock,
      wabaSendMessageMock,
      logEntries,
    };
  }

  describe("1. Explicit Dispatch Routing & Zero Cross-Provider Fallback", () => {
    it("should dispatch via WAHA when explicit WAHA instance is requested", async () => {
      const { service, wahaSendMessageMock, wabaSendMessageMock } = createTestSetup();

      const result = await service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine1.id, {
        recipientE164: "+5511999998888",
        body: "Test message via WAHA Line 1",
        idempotencyKey: "idemp-001",
      });

      expect(result.success).toBe(true);
      expect(wahaSendMessageMock).toHaveBeenCalledTimes(1);
      expect(wabaSendMessageMock).not.toHaveBeenCalled();

      const callArgs: OutboundSendParams = wahaSendMessageMock.mock.calls[0]![0];
      expect(callArgs.channelInstanceId).toBe(wahaInstanceLine1.id);
      expect(callArgs.workspaceId).toBe(workspaceAlphaId);
      expect(callArgs.body).toBe("Test message via WAHA Line 1");
    });

    it("should dispatch via WABA when explicit WABA instance is requested", async () => {
      const { service, wahaSendMessageMock, wabaSendMessageMock } = createTestSetup();

      const result = await service.dispatchOutbound(workspaceAlphaId, wabaInstance.id, {
        recipientE164: "+5511988887777",
        body: "Hello from Meta WABA",
        idempotencyKey: "idemp-002",
      });

      expect(result.success).toBe(true);
      expect(wabaSendMessageMock).toHaveBeenCalledTimes(1);
      expect(wahaSendMessageMock).not.toHaveBeenCalled();

      const callArgs: OutboundSendParams = wabaSendMessageMock.mock.calls[0]![0];
      expect(callArgs.channelInstanceId).toBe(wabaInstance.id);
    });

    it("should differentiate between two lines of same provider without arbitrary selection", async () => {
      const { service, wahaSendMessageMock } = createTestSetup();

      // Dispatch explicitly to Line 2
      const result = await service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine2.id, {
        recipientE164: "+5511999993333",
        body: "Direct dispatch to Line 2",
        idempotencyKey: "idemp-003",
      });

      expect(result.success).toBe(true);
      expect(wahaSendMessageMock).toHaveBeenCalledTimes(1);
      const callArgs: OutboundSendParams = wahaSendMessageMock.mock.calls[0]![0];
      expect(callArgs.channelInstanceId).toBe(wahaInstanceLine2.id);
      expect(callArgs.channelInstanceId).not.toBe(wahaInstanceLine1.id);
    });

    it("should NEVER fall back to another provider if the requested provider fails", async () => {
      const { service, wahaSendMessageMock, wabaSendMessageMock } = createTestSetup();

      // Configure WAHA adapter to return failure
      wahaSendMessageMock.mockResolvedValueOnce({
        success: false,
        category: "transient",
        errorCode: "WAHA_RATE_LIMIT",
        errorMessage: "Rate limit exceeded on WAHA node",
      });

      const result = await service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine1.id, {
        recipientE164: "+5511999994444",
        body: "Attempting message",
        idempotencyKey: "idemp-fail-1",
      });

      // Assert fail-closed: result reports failure, and Meta WABA was NEVER called!
      expect(result.success).toBe(false);
      expect(wahaSendMessageMock).toHaveBeenCalledTimes(1);
      expect(wabaSendMessageMock).not.toHaveBeenCalled();
    });

    it("should NEVER attempt a second provider if the primary provider throws a network exception", async () => {
      const { service, wahaSendMessageMock, wabaSendMessageMock } = createTestSetup();

      wahaSendMessageMock.mockRejectedValueOnce(new Error("ECONNREFUSED: Connection refused at 127.0.0.1:3000"));

      await expect(
        service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine1.id, {
          recipientE164: "+5511999995555",
          body: "Network test",
          idempotencyKey: "idemp-fail-2",
        })
      ).rejects.toThrow(ChannelProviderUnavailableError);

      // Verify that no other provider was tried
      expect(wahaSendMessageMock).toHaveBeenCalledTimes(1);
      expect(wabaSendMessageMock).not.toHaveBeenCalled();
    });
  });

  describe("2. Validation & Security Invariants", () => {
    it("should REJECT dispatch when channel instance is inactive", async () => {
      const { service, wahaSendMessageMock } = createTestSetup();

      await expect(
        service.dispatchOutbound(workspaceAlphaId, inactiveInstance.id, {
          recipientE164: "+5511999996666",
          body: "Testing inactive line",
          idempotencyKey: "idemp-inact",
        })
      ).rejects.toThrow(ChannelInstanceInactiveError);

      expect(wahaSendMessageMock).not.toHaveBeenCalled();
    });

    it("should REJECT cross-tenant instance dispatch with ChannelInstanceNotFoundError (anti-enumeration)", async () => {
      const { service, wahaSendMessageMock } = createTestSetup();

      // Workspace Alpha querying Beta's instance ID
      await expect(
        service.dispatchOutbound(workspaceAlphaId, betaInstance.id, {
          recipientE164: "+5511999997777",
          body: "Cross-tenant intrusion attempt",
          idempotencyKey: "idemp-cross",
        })
      ).rejects.toThrow(ChannelInstanceNotFoundError);

      expect(wahaSendMessageMock).not.toHaveBeenCalled();
    });

    it("should REJECT unregistered provider with ChannelAdapterNotFoundError", async () => {
      const customRepo: IChannelInstanceRepository = {
        async getById(): Promise<ChannelInstanceRecord> {
          return {
            ...wahaInstanceLine1,
            provider: "unregistered_custom_provider" as any,
          };
        },
      };

      const registry = new ChannelAdapterRegistry([]);
      const service = new ChannelDispatchService({
        channelInstanceRepo: customRepo,
        adapterRegistry: registry,
        secretResolver: mockSecretResolver,
      });

      await expect(
        service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine1.id, {
          recipientE164: "+5511999998888",
          body: "Custom provider message",
          idempotencyKey: "idemp-unreg",
        })
      ).rejects.toThrow(ChannelAdapterNotFoundError);
    });

    it("should REJECT template message when dispatched to WAHA (unsupported capability)", async () => {
      const { service, wahaSendMessageMock } = createTestSetup();

      await expect(
        service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine1.id, {
          recipientE164: "+5511999998888",
          body: "Message with template",
          template: {
            name: "order_update",
            language: "pt_BR",
          },
          idempotencyKey: "idemp-tpl-waha",
        })
      ).rejects.toThrow(ChannelCapabilityUnsupportedError);

      expect(wahaSendMessageMock).not.toHaveBeenCalled();
    });

    it("should REJECT message with empty body, mediaUrl, and template", async () => {
      const { service } = createTestSetup();

      await expect(
        service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine1.id, {
          recipientE164: "+5511999998888",
          body: "   ",
          idempotencyKey: "idemp-empty",
        })
      ).rejects.toThrow(ChannelCapabilityUnsupportedError);
    });
  });

  describe("3. Observability Hygiene & Anti-Leakage", () => {
    it("should sanitize logs and NEVER log unmasked phone, body text, or tokens", async () => {
      const { service, logEntries } = createTestSetup();

      const sensitivePhone = "+5511998877665";
      const sensitiveBody = "Sensitive customer contract details";

      await service.dispatchOutbound(workspaceAlphaId, wahaInstanceLine1.id, {
        recipientE164: sensitivePhone,
        body: sensitiveBody,
        idempotencyKey: "idemp-clean-log",
      });

      expect(logEntries.length).toBeGreaterThan(0);

      // Initiation log must contain masked phone
      const initLog = logEntries.find((e) => e.msg === "Initiating outbound channel dispatch");
      expect(initLog).toBeDefined();
      expect(JSON.stringify(initLog)).toContain(maskRecipientPhone(sensitivePhone));

      // All logs must NEVER leak unmasked phone, sensitive body, or secret tokens
      for (const entry of logEntries) {
        const fullLogJson = JSON.stringify(entry);
        expect(fullLogJson).not.toContain(sensitivePhone);
        expect(fullLogJson).not.toContain(sensitiveBody);
        expect(fullLogJson).not.toContain("a".repeat(64));
        expect(fullLogJson).not.toContain("test_secret");
      }
    });

    it("should verify phone masking utility correctly redacts middle digits", () => {
      expect(maskRecipientPhone("+5511999998888")).toBe("+5511*****8888");
      expect(maskRecipientPhone("+12025550199")).toBe("+1202*****0199");
      expect(maskRecipientPhone("short")).toBe("***");
      expect(maskRecipientPhone("")).toBe("***");
    });
  });
});
