import type {
  PublicOutboundRequest,
  TrustedOutboundContext,
  ProduceOutboundOutput,
} from "@sos-sales/contracts";

export interface ITransactionalOutboundProducerService {
  produce(
    request: PublicOutboundRequest,
    context: TrustedOutboundContext
  ): Promise<ProduceOutboundOutput>;
}
