import { describe, it, expect } from "vitest";
import { evaluateOutcomeConversionPolicy } from "../conversion-policy";
import type { CommercialOutcome } from "@sos-sales/contracts";

describe("Conversion Policy Domain Evaluator", () => {
  const baseOutcome: CommercialOutcome = {
    id: "a0000000-0000-0000-0000-000000000001",
    workspaceId: "w0000000-0000-0000-0000-000000000001",
    journeyId: "j0000000-0000-0000-0000-000000000001",
    status: "won",
    valueCents: 49700, // R$ 497,00
    currency: "BRL",
    registeredByUserId: "u0000000-0000-0000-0000-000000000001",
    timestamp: new Date().toISOString(),
  };

  it("should generate PurchaseCompleted when outcome is won with positive value", () => {
    const evaluation = evaluateOutcomeConversionPolicy(baseOutcome);

    expect(evaluation.shouldDispatch).toBe(true);
    expect(evaluation.canonicalEvent).toBe("PurchaseCompleted");
  });

  it("should generate ProposalAccepted when outcome is won with zero value", () => {
    const evaluation = evaluateOutcomeConversionPolicy({
      ...baseOutcome,
      valueCents: 0,
    });

    expect(evaluation.shouldDispatch).toBe(true);
    expect(evaluation.canonicalEvent).toBe("ProposalAccepted");
  });

  it("should NOT dispatch conversion event for lost outcomes", () => {
    const evaluation = evaluateOutcomeConversionPolicy({
      ...baseOutcome,
      status: "lost",
      reason: "Lead opted for competitor",
    });

    expect(evaluation.shouldDispatch).toBe(false);
    expect(evaluation.canonicalEvent).toBeUndefined();
  });
});
