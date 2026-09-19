/**
 * Sanitization helpers for authentication error logging and connection strings.
 * Enforces sovereign privacy: zero PII (email, sub, claims) and zero credentials in logs.
 */

export interface SanitizedAuthError {
  name: string;
  code?: string;
  provider: "local-jwt" | "supabase-jwks";
  messageCategory: string;
}

/**
 * Strips all claims, payload, tokens and PII from a JWT/JWKS error before logging.
 */
export function sanitizeAuthError(
  err: unknown,
  provider: "local-jwt" | "supabase-jwks"
): SanitizedAuthError {
  const name = err instanceof Error ? err.name : "AuthenticationError";
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as any).code === "string"
      ? (err as any).code
      : undefined;

  let messageCategory = "invalid_token";
  if (name === "JWTExpired" || code === "ERR_JWT_EXPIRED") {
    messageCategory = "token_expired";
  } else if (name === "JWTClaimValidationFailed" || code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
    messageCategory = "claim_validation_failed";
  } else if (name === "JOSEAlgNotAllowed" || code === "ERR_JOSE_ALG_NOT_ALLOWED") {
    messageCategory = "algorithm_not_allowed";
  } else if (name === "JWSSignatureVerificationFailed" || code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
    messageCategory = "signature_verification_failed";
  } else if (name === "JWKSTimeout" || code === "ERR_JWKS_TIMEOUT") {
    messageCategory = "jwks_timeout";
  } else if (err instanceof Error && (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED"))) {
    messageCategory = "jwks_network_unreachable";
  }

  return {
    name,
    code,
    provider,
    messageCategory,
  };
}

/**
 * Sanitizes a URL or connection string, completely stripping passwords and credentials.
 * Protects against credential leaks when parsing malformed URLs.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "<empty>";
  }

  // First apply regex-based credential masking to protect against malformed URLs
  // that fail URL parser but still carry embedded passwords
  const masked = rawUrl.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:]+):([^@]+)@/g,
    "$1$2:***@"
  );

  try {
    const parsed = new URL(masked);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    // If standard URL parsing fails, return the regex-masked string
    return masked;
  }
}
