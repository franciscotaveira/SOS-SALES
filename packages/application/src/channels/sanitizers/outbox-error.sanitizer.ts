/**
 * Outbox Error Sanitizer — MCT OS v2.0
 *
 * Canonical allowlist sanitizer for outbound command failures and provider errors.
 *
 * P0 Invariants:
 * 1. Zero raw `err.message` or raw provider payload persistence.
 * 2. Zero recipient phone numbers, message bodies, media URLs, tokens, hashes,
 *    idempotency keys, or stack traces.
 * 3. Persist strictly canonical allowlisted error codes and safe static descriptions.
 */

export type OutboxErrorCategory =
  | "transient"
  | "permanent"
  | "ambiguous"
  | "fencing"
  | "reconciliation";

export interface CanonicalErrorDefinition {
  readonly category: OutboxErrorCategory;
  readonly code: string;
  readonly description: string;
}

export const CANONICAL_OUTBOX_ERRORS: Record<string, CanonicalErrorDefinition> = {
  ERR_PROVIDER_UNAVAILABLE: {
    category: "transient",
    code: "ERR_PROVIDER_UNAVAILABLE",
    description: "External provider service is temporarily unreachable",
  },
  ERR_RATE_LIMITED: {
    category: "transient",
    code: "ERR_RATE_LIMITED",
    description: "Rate limit threshold reached on channel provider",
  },
  ERR_RATE_LIMIT_EXCEEDED: {
    category: "transient",
    code: "ERR_RATE_LIMIT_EXCEEDED",
    description: "Rate limit threshold reached on channel provider",
  },
  ERR_NETWORK_DISPATCH_FAILED: {
    category: "transient",
    code: "ERR_NETWORK_DISPATCH_FAILED",
    description: "Network connection failure during outbound channel dispatch",
  },
  ERR_TRANSIENT_FAILURE: {
    category: "transient",
    code: "ERR_TRANSIENT_FAILURE",
    description: "Channel provider transient failure eligible for retry",
  },
  ERR_INVALID_PAYLOAD: {
    category: "permanent",
    code: "ERR_INVALID_PAYLOAD",
    description: "Message payload format is rejected by provider schema",
  },
  ERR_INVALID_TEMPLATE_PARAMETERS: {
    category: "permanent",
    code: "ERR_INVALID_TEMPLATE_PARAMETERS",
    description: "Message template parameters rejected by provider schema",
  },
  ERR_CAPABILITY_UNSUPPORTED: {
    category: "permanent",
    code: "ERR_CAPABILITY_UNSUPPORTED",
    description: "Channel provider does not support the requested message type or capability",
  },
  ERR_INSTANCE_NOT_FOUND: {
    category: "permanent",
    code: "ERR_INSTANCE_NOT_FOUND",
    description: "Target channel instance was not found in the workspace",
  },
  ERR_INSTANCE_INACTIVE: {
    category: "permanent",
    code: "ERR_INSTANCE_INACTIVE",
    description: "Target channel instance is currently inactive",
  },
  ERR_PERMANENT_REJECTION: {
    category: "permanent",
    code: "ERR_PERMANENT_REJECTION",
    description: "Permanent dispatch rejection from channel provider",
  },
  ERR_TIMEOUT_AMBIGUOUS: {
    category: "ambiguous",
    code: "ERR_TIMEOUT_AMBIGUOUS",
    description: "Ambiguous network timeout during dispatch; state must be reconciled",
  },
  ERR_NETWORK_TIMEOUT: {
    category: "ambiguous",
    code: "ERR_NETWORK_TIMEOUT",
    description: "Ambiguous network timeout during dispatch; state must be reconciled",
  },
  ERR_ETIMEDOUT_AMBIGUOUS: {
    category: "ambiguous",
    code: "ERR_ETIMEDOUT_AMBIGUOUS",
    description: "Network connection timed out (ETIMEDOUT); state must be reconciled",
  },
  ERR_SOCKET_RESET_AMBIGUOUS: {
    category: "ambiguous",
    code: "ERR_SOCKET_RESET_AMBIGUOUS",
    description: "Socket hangup or reset during dispatch; state must be reconciled",
  },
  ERR_LEASE_LOST: {
    category: "fencing",
    code: "ERR_LEASE_LOST",
    description: "Command lease expired or was reclaimed before dispatch finalization",
  },
  ERR_LEASE_EXPIRED_RECLAIMED: {
    category: "reconciliation",
    code: "ERR_LEASE_EXPIRED_RECLAIMED",
    description: "Processing lease expired during dispatch and was reclaimed for reconciliation",
  },
  ERR_LEASE_EXPIRED_DURING_PROCESSING: {
    category: "reconciliation",
    code: "ERR_LEASE_EXPIRED_DURING_PROCESSING",
    description: "Processing lease expired during dispatch and was reclaimed for reconciliation",
  },
  ERR_DELIVERY_FAILURE_CONFIRMED: {
    category: "reconciliation",
    code: "ERR_DELIVERY_FAILURE_CONFIRMED",
    description: "Provider delivery event confirmed permanent message delivery failure",
  },
  ERR_RECONCILIATION_TTL_EXPIRED: {
    category: "reconciliation",
    code: "ERR_RECONCILIATION_TTL_EXPIRED",
    description: "Reconciliation grace period expired and maximum retries exhausted",
  },
  ERR_RECONCILIATION_RETRY: {
    category: "reconciliation",
    code: "ERR_RECONCILIATION_RETRY",
    description: "Reconciliation grace period expired without confirmation; rescheduled for retry",
  },
  ERR_ADMIN_RESOLVED_DEAD_LETTER: {
    category: "reconciliation",
    code: "ERR_ADMIN_RESOLVED_DEAD_LETTER",
    description: "Reconciled as dead_letter by administrator",
  },
  ERR_ADMIN_RESOLVED_RETRY: {
    category: "reconciliation",
    code: "ERR_ADMIN_RESOLVED_RETRY",
    description: "Reconciled and reset to pending for retry by administrator",
  },
  ERR_UNKNOWN_DISPATCH_FAILURE: {
    category: "transient",
    code: "ERR_UNKNOWN_DISPATCH_FAILURE",
    description: "Unexpected exception during outbox dispatch",
  },
};

/**
 * Normalizes an arbitrary error code, exception, or provider status into an allowlisted canonical code.
 */
export function resolveCanonicalErrorCode(
  codeOrError?: unknown,
  fallbackCategory: OutboxErrorCategory = "transient"
): string {
  if (!codeOrError) {
    return defaultCodeForCategory(fallbackCategory);
  }

  let rawString = "";
  if (typeof codeOrError === "string") {
    rawString = codeOrError;
  } else if (codeOrError instanceof Error) {
    const errorWithCode = codeOrError as { code?: unknown };
    if (typeof errorWithCode.code === "string" && errorWithCode.code) {
      rawString = errorWithCode.code;
    } else {
      rawString = codeOrError.name || codeOrError.message;
    }
  } else if (typeof codeOrError === "object" && codeOrError !== null) {
    const errorObj = codeOrError as { code?: unknown; errorCode?: unknown };
    if (typeof errorObj.errorCode === "string" && errorObj.errorCode) {
      rawString = errorObj.errorCode;
    } else if (typeof errorObj.code === "string" && errorObj.code) {
      rawString = errorObj.code;
    }
  }

  const normalized = rawString.trim().toUpperCase();

  // Direct match against allowlist
  if (normalized in CANONICAL_OUTBOX_ERRORS) {
    return normalized;
  }

  // Common provider and network pattern normalization
  if (normalized.includes("RATE_LIMIT_EXCEEDED")) {
    return "ERR_RATE_LIMIT_EXCEEDED";
  }

  if (
    normalized.includes("RATE_LIMIT") ||
    normalized === "429" ||
    normalized.includes("THROTTLE")
  ) {
    return "ERR_RATE_LIMITED";
  }

  if (
    normalized.includes("ECONNREFUSED") ||
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("504") ||
    normalized.includes("PROVIDER_UNAVAILABLE") ||
    normalized.includes("SERVICE_UNAVAILABLE")
  ) {
    return "ERR_PROVIDER_UNAVAILABLE";
  }

  if (normalized.includes("ETIMEDOUT")) {
    return "ERR_ETIMEDOUT_AMBIGUOUS";
  }

  if (normalized.includes("NETWORK_TIMEOUT")) {
    return "ERR_NETWORK_TIMEOUT";
  }

  if (
    normalized.includes("TIMEOUT") ||
    normalized.includes("DEADLINE_EXCEEDED")
  ) {
    return "ERR_TIMEOUT_AMBIGUOUS";
  }

  if (
    normalized.includes("INVALID_TEMPLATE_PARAMETERS") ||
    (normalized.includes("INVALID") && normalized.includes("TEMPLATE"))
  ) {
    return "ERR_INVALID_TEMPLATE_PARAMETERS";
  }


  if (
    normalized.includes("ECONNRESET") ||
    normalized.includes("EPIPE") ||
    normalized.includes("SOCKET_RESET") ||
    normalized.includes("HANGUP")
  ) {
    return "ERR_SOCKET_RESET_AMBIGUOUS";
  }

  if (
    normalized.includes("CHANNEL_INSTANCE_NOT_FOUND") ||
    normalized.includes("INSTANCE_NOT_FOUND")
  ) {
    return "ERR_INSTANCE_NOT_FOUND";
  }

  if (
    normalized.includes("CHANNEL_INSTANCE_INACTIVE") ||
    normalized.includes("INSTANCE_INACTIVE")
  ) {
    return "ERR_INSTANCE_INACTIVE";
  }

  if (
    normalized.includes("CHANNEL_CAPABILITY_UNSUPPORTED") ||
    normalized.includes("CAPABILITY_UNSUPPORTED")
  ) {
    return "ERR_CAPABILITY_UNSUPPORTED";
  }

  if (
    normalized.includes("INVALID_PARAMETER") ||
    normalized.includes("BAD_REQUEST") ||
    normalized === "400" ||
    normalized.includes("INVALID_PAYLOAD")
  ) {
    return "ERR_INVALID_PAYLOAD";
  }

  if (
    normalized.includes("FENCING") ||
    normalized.includes("LEASE_LOST") ||
    normalized.includes("LEASE_EXPIRED")
  ) {
    return "ERR_LEASE_LOST";
  }

  return defaultCodeForCategory(fallbackCategory);
}

function defaultCodeForCategory(category: OutboxErrorCategory): string {
  switch (category) {
    case "permanent":
      return "ERR_PERMANENT_REJECTION";
    case "ambiguous":
      return "ERR_TIMEOUT_AMBIGUOUS";
    case "fencing":
      return "ERR_LEASE_LOST";
    case "reconciliation":
      return "ERR_LEASE_EXPIRED_RECLAIMED";
    case "transient":
    default:
      return "ERR_TRANSIENT_FAILURE";
  }
}

/**
 * Sanitizes any failure into an allowlisted, canonical, safe string for outbound_commands.error_message.
 *
 * Guarantees that:
 * - NO raw error message is retained.
 * - NO provider response payloads, URLs, tokens, idempotency keys, or phone numbers leak.
 * - The returned string strictly follows the format: [CATEGORY] CANONICAL_CODE: Description
 */
export function sanitizeOutboxErrorMessage(
  category: OutboxErrorCategory,
  codeOrError?: unknown
): string {
  const canonicalCode = resolveCanonicalErrorCode(codeOrError, category);
  const def = CANONICAL_OUTBOX_ERRORS[canonicalCode] || CANONICAL_OUTBOX_ERRORS.ERR_TRANSIENT_FAILURE!;

  const effectiveCategory = def.category || category;
  return `[${effectiveCategory.toUpperCase()}] ${def.code}: ${def.description}`;
}
