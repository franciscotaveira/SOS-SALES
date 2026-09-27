import { describe, it, expect, vi } from "vitest";
import { EvolutionAdapter, validateEvolutionBaseUrl } from "../channels/adapters/evolution.adapter";
import type { OutboundSendParams } from "../channels/adapters/channel-adapter.interface";

describe("EvolutionAdapter (Evolution API v2 Outbound)", () => {
  const dummyParams: OutboundSendParams = {
    workspaceId: "22222222-2222-4222-8222-222222222222",
    channelInstanceId: "11111111-1111-4111-8111-111111111111",
    commandId: "cmd-1",
    messageId: "msg-1",
    recipientE164: "+5549999998888",
    body: "Olá do SOS Sales V3!",
    idempotencyKey: "idem-1",
  };

  const mockSecretResolver = {
    resolveSigningSecret: vi.fn(),
    resolveChannelSecret: vi.fn().mockResolvedValue({
      apiKey: "test-evolution-key",
      baseUrl: "http://evolution:8080",
      instance: "test-instance",
    }),
  };

  it("sends a text message successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        key: {
          id: "EVO_OUTBOUND_MSG_123",
          remoteJid: "5549999998888@s.whatsapp.net",
          fromMe: true,
        },
      }),
    });

    const adapter = new EvolutionAdapter({
      fetchFn: mockFetch as any,
      allowLocalTest: true,
    });

    const result = await adapter.sendMessage(dummyParams, mockSecretResolver as any);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.externalMessageId).toBe("EVO_OUTBOUND_MSG_123");
      expect(result.sentAt).toBeInstanceOf(Date);
    }

    expect(mockFetch).toHaveBeenCalledWith(
      "http://evolution:8080/message/sendText/test-instance",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "test-evolution-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          number: "5549999998888",
          text: "Olá do SOS Sales V3!",
        }),
      })
    );
  });

  it("handles authentication failure (HTTP 401)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized token" }),
    });

    const adapter = new EvolutionAdapter({
      fetchFn: mockFetch as any,
      allowLocalTest: true,
    });

    const result = await adapter.sendMessage(dummyParams, mockSecretResolver as any);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.category).toBe("permanent");
      expect(result.errorCode).toBe("AUTHENTICATION_FAILED");
    }
  });

  it("blocks SSRF attempts to cloud metadata IP", () => {
    expect(() => validateEvolutionBaseUrl("http://169.254.169.254")).toThrow(/SSRF_VIOLATION/);
    expect(() => validateEvolutionBaseUrl("http://metadata.google.internal")).toThrow(/SSRF_VIOLATION/);
  });

  it("allows internal docker hostname evolution", () => {
    const valid = validateEvolutionBaseUrl("http://evolution:8080");
    expect(valid).toBe("http://evolution:8080");
  });
});
