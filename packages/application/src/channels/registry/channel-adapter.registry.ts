import type { IChannelAdapter } from "../adapters/channel-adapter.interface";

export class ChannelAdapterRegistry {
  private readonly adapters = new Map<string, IChannelAdapter>();

  constructor(initialAdapters: IChannelAdapter[] = []) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  register(adapter: IChannelAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(
        `ADAPTER_ALREADY_REGISTERED: Adapter for provider '${adapter.provider}' is already registered`
      );
    }
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string): IChannelAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(
        `CHANNEL_ADAPTER_NOT_FOUND: No registered channel adapter for provider '${provider}'`
      );
    }
    return adapter;
  }

  has(provider: string): boolean {
    return this.adapters.has(provider);
  }
}
