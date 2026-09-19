export class ChannelDispatchBaseError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ChannelInstanceNotFoundError extends ChannelDispatchBaseError {
  constructor(channelInstanceId: string, workspaceId: string) {
    super(
      `Channel instance '${channelInstanceId}' not found for workspace '${workspaceId}'`,
      "CHANNEL_INSTANCE_NOT_FOUND"
    );
  }
}

export class ChannelInstanceInactiveError extends ChannelDispatchBaseError {
  constructor(channelInstanceId: string, workspaceId: string) {
    super(
      `Channel instance '${channelInstanceId}' in workspace '${workspaceId}' is inactive`,
      "CHANNEL_INSTANCE_INACTIVE"
    );
  }
}

export class ChannelAdapterNotFoundError extends ChannelDispatchBaseError {
  constructor(provider: string) {
    super(
      `No registered channel adapter found for provider '${provider}'`,
      "CHANNEL_ADAPTER_NOT_FOUND"
    );
  }
}

export class ChannelCapabilityUnsupportedError extends ChannelDispatchBaseError {
  constructor(capability: string, provider: string, details?: string) {
    super(
      `Capability '${capability}' is not supported by channel provider '${provider}'${details ? `: ${details}` : ""}`,
      "CHANNEL_CAPABILITY_UNSUPPORTED"
    );
  }
}

export class ChannelDispatchFailedError extends ChannelDispatchBaseError {
  constructor(message: string, cause?: unknown) {
    super(message, "CHANNEL_DISPATCH_FAILED", cause);
  }
}

export class ChannelProviderUnavailableError extends ChannelDispatchBaseError {
  constructor(provider: string, message = "Channel provider is temporarily unavailable", cause?: unknown) {
    super(
      `Provider '${provider}' unavailable: ${message}`,
      "CHANNEL_PROVIDER_UNAVAILABLE",
      cause
    );
  }
}
