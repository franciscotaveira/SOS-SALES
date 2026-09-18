import type { AttributionSource } from "@sos-sales/contracts";

export type AttributionConfidence = "deterministic" | "high_probabilistic" | "low_probabilistic" | "manual";

export interface AttributionInput {
  ctwaClid?: string;
  leadId?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  trackingCode?: string;
  campaignKeyword?: string;
  manualSource?: string;
}

export interface ResolvedAttribution {
  source: AttributionSource;
  confidence: AttributionConfidence;
  evidence: string;
  eligibleForBusinessMessagingCapi: boolean;
  timestamp: string;
}

/**
 * Resolves marketing attribution following strict sovereign hierarchy.
 * Invariant: Never promote probabilistic evidence to deterministic.
 */
export function resolveAttribution(input: AttributionInput): ResolvedAttribution {
  const now = new Date().toISOString();

  // 1. CTWA Deterministic
  if (input.ctwaClid && input.ctwaClid.trim().length > 0) {
    return {
      source: "ctwa_meta",
      confidence: "deterministic",
      evidence: `ctwa_clid:${input.ctwaClid}`,
      eligibleForBusinessMessagingCapi: true,
      timestamp: now,
    };
  }

  // 2. Lead Ads Deterministic
  if (input.leadId && input.leadId.trim().length > 0) {
    return {
      source: "lead_ads_meta",
      confidence: "deterministic",
      evidence: `lead_id:${input.leadId}`,
      eligibleForBusinessMessagingCapi: false, // Lead Ads uses Graph retrieval, not business messaging CAPI
      timestamp: now,
    };
  }

  // 3. Web tracking (fbclid/fbc/fbp)
  if (input.fbclid || input.fbc || input.fbp) {
    return {
      source: "tracked_link_meta",
      confidence: "high_probabilistic",
      evidence: `fbc:${input.fbc || ""}|fbp:${input.fbp || ""}|fbclid:${input.fbclid || ""}`,
      eligibleForBusinessMessagingCapi: false,
      timestamp: now,
    };
  }

  // 4. Tracking code inside message
  if (input.trackingCode) {
    return {
      source: "organic_whatsapp",
      confidence: "low_probabilistic",
      evidence: `code:${input.trackingCode}`,
      eligibleForBusinessMessagingCapi: false,
      timestamp: now,
    };
  }

  // Default fallback: organic or manual
  return {
    source: input.manualSource ? "manual_input" : "organic_whatsapp",
    confidence: input.manualSource ? "manual" : "low_probabilistic",
    evidence: input.manualSource ? `manual:${input.manualSource}` : "none",
    eligibleForBusinessMessagingCapi: false,
    timestamp: now,
  };
}
