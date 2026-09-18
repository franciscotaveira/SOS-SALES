import { describe, it, expect } from "vitest";
import { resolveAttribution } from "../attribution";

describe("Marketing Attribution Resolver", () => {
  it("should prioritize CTWA clid deterministically for business messaging CAPI", () => {
    const result = resolveAttribution({
      ctwaClid: "ctwa_test_123456",
      fbclid: "fbclid_ignored_since_ctwa_is_higher_rank",
    });

    expect(result.source).toBe("ctwa_meta");
    expect(result.confidence).toBe("deterministic");
    expect(result.eligibleForBusinessMessagingCapi).toBe(true);
  });

  it("should prioritize Lead Ads deterministically over web tracking", () => {
    const result = resolveAttribution({
      leadId: "lead_987654321",
      fbclid: "fbclid_web_123",
    });

    expect(result.source).toBe("lead_ads_meta");
    expect(result.confidence).toBe("deterministic");
    expect(result.eligibleForBusinessMessagingCapi).toBe(false);
  });

  it("should classify web tracking as high_probabilistic and ineligible for business messaging CAPI", () => {
    const result = resolveAttribution({
      fbclid: "fbclid_only_777",
      fbc: "fb.1.123456.789",
    });

    expect(result.source).toBe("tracked_link_meta");
    expect(result.confidence).toBe("high_probabilistic");
    expect(result.eligibleForBusinessMessagingCapi).toBe(false);
  });

  it("should fallback gracefully to organic whatsapp when no tracking data is present", () => {
    const result = resolveAttribution({});

    expect(result.source).toBe("organic_whatsapp");
    expect(result.confidence).toBe("low_probabilistic");
    expect(result.eligibleForBusinessMessagingCapi).toBe(false);
  });
});
