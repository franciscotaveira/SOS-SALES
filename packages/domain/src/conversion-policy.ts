import type { CanonicalConversionEvent, CommercialOutcome } from "@sos-sales/contracts";

export interface ConversionPolicyResult {
  shouldDispatch: boolean;
  canonicalEvent?: CanonicalConversionEvent;
  reason: string;
}

/**
 * Domain policy to evaluate if a commercial outcome must produce a CAPI event.
 */
export function evaluateOutcomeConversionPolicy(outcome: CommercialOutcome): ConversionPolicyResult {
  if (outcome.status === "lost") {
    return {
      shouldDispatch: false,
      reason: "Lost outcomes do not generate positive conversion signals to Meta Ads",
    };
  }

  if (outcome.status === "won") {
    if (outcome.valueCents <= 0) {
      return {
        shouldDispatch: true,
        canonicalEvent: "ProposalAccepted",
        reason: "Won outcome without positive monetary amount classified as ProposalAccepted",
      };
    }

    return {
      shouldDispatch: true,
      canonicalEvent: "PurchaseCompleted",
      reason: "Won outcome with verified monetary value registered as PurchaseCompleted",
    };
  }

  return {
    shouldDispatch: false,
    reason: "Unrecognized outcome status",
  };
}
