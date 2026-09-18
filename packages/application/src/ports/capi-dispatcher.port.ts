import type { ConversionEvent } from "@sos-sales/contracts";

export interface CapiDispatchResult {
  accepted: boolean;
  fbtraceId?: string;
  eventsReceived?: number;
  errorMessage?: string;
  retryable: boolean;
}

export interface ICapiDispatcher {
  dispatchConversion(event: ConversionEvent): Promise<CapiDispatchResult>;
}
