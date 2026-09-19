import { describe, it, expect } from "vitest";
import { ChannelAdapterRegistry } from "../channels/registry/channel-adapter.registry";
import type { IChannelAdapter, OutboundSendParams, ChannelSendResult } from "../channels/adapters/channel-adapter.interface";
import type { ISigningSecretResolver } from "../channels/services/signature-verification.service";

class DummyAdapter implements IChannelAdapter {
  constructor(public readonly provider: "meta_waba" | "waha") {}

  async sendMessage(
    _params: OutboundSendParams,
    _secretResolver: ISigningSecretResolver
  ): Promise<ChannelSendResult> {
    return {
      success: true,
      externalMessageId: `msg_${this.provider}_${Date.now()}`,
      sentAt: new Date(),
    };
  }
}

describe("ChannelAdapterRegistry: Multi-Provider Dual-Engine (CH-10 / AC-CH10-001)", () => {
  it("should register and retrieve distinct adapters for waha and meta_waba", () => {
    const registry = new ChannelAdapterRegistry();
    const wabaAdapter = new DummyAdapter("meta_waba");
    const wahaAdapter = new DummyAdapter("waha");

    registry.register(wabaAdapter);
    registry.register(wahaAdapter);

    expect(registry.has("meta_waba")).toBe(true);
    expect(registry.has("waha")).toBe(true);

    const resolvedWaba = registry.get("meta_waba");
    const resolvedWaha = registry.get("waha");

    expect(resolvedWaba).toBe(wabaAdapter);
    expect(resolvedWaha).toBe(wahaAdapter);
    expect(resolvedWaba.provider).toBe("meta_waba");
    expect(resolvedWaha.provider).toBe("waha");
  });

  it("should REJECT duplicate adapter registration for the same provider", () => {
    const registry = new ChannelAdapterRegistry();
    const adapter1 = new DummyAdapter("waha");
    const adapter2 = new DummyAdapter("waha");

    registry.register(adapter1);

    expect(() => registry.register(adapter2)).toThrowError(
      /ADAPTER_ALREADY_REGISTERED: Adapter for provider 'waha' is already registered/
    );
  });

  it("should REJECT retrieval of an unknown/unregistered provider", () => {
    const registry = new ChannelAdapterRegistry();

    expect(registry.has("evolution")).toBe(false);
    expect(() => registry.get("evolution")).toThrowError(
      /CHANNEL_ADAPTER_NOT_FOUND: No registered channel adapter for provider 'evolution'/
    );
  });

  it("should support constructor initialization with initial adapter collection", () => {
    const waba = new DummyAdapter("meta_waba");
    const waha = new DummyAdapter("waha");

    const registry = new ChannelAdapterRegistry([waba, waha]);

    expect(registry.has("meta_waba")).toBe(true);
    expect(registry.has("waha")).toBe(true);
    expect(registry.get("meta_waba")).toBe(waba);
    expect(registry.get("waha")).toBe(waha);
  });
});
