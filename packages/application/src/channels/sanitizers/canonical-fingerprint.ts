import crypto from "node:crypto";
import type { PublicOutboundRequest, TrustedOutboundContext } from "@sos-sales/contracts";

/**
 * Recursively sorts object keys lexicographically for deterministic JSON serialization.
 * Arrays retain element order, but nested objects within arrays are recursively sorted.
 */
export function sortKeysDeep<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item)) as unknown as T;
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    result[key] = sortKeysDeep(obj[key]);
  }

  return result as T;
}

/**
 * Deterministic JSON stringifier with key ordering.
 */
export function canonicalJsonStringify(data: unknown): string {
  return JSON.stringify(sortKeysDeep(data));
}

/**
 * Computes a deterministic SHA-256 canonical payload fingerprint (64 hex characters).
 * Uses exact values as persisted/dispatched:
 * - Preserves user strings exactly: no trim or NFKC normalization on body, mediaUrl, or template name/language.
 * - Recursively sorts object keys lexicographically while preserving array element order.
 * - Sourced strictly from trusted context and validated payload.
 */
export function computeOutboundPayloadFingerprint(
  request: PublicOutboundRequest,
  context: Pick<TrustedOutboundContext, "workspaceId" | "channelInstanceId">
): string {
  const canonicalObject = {
    workspaceId: context.workspaceId,
    channelInstanceId: context.channelInstanceId,
    recipientPhoneE164: request.recipientPhoneE164,
    contentType: request.contentType,
    body: request.body,
    mediaUrl: request.mediaUrl ?? null,
    template: request.template
      ? {
          name: request.template.name,
          language: request.template.language,
          components: request.template.components
            ? sortKeysDeep(request.template.components)
            : null,
        }
      : null,
  };

  const serialized = canonicalJsonStringify(canonicalObject);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Constant-time comparison of two 64-character hexadecimal SHA-256 fingerprints.
 * Protects against timing attacks during idempotency verification.
 */
export function isFingerprintMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a.length !== 64 || b.length !== 64) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(a.toLowerCase(), "hex"),
      Buffer.from(b.toLowerCase(), "hex")
    );
  } catch {
    return false;
  }
}
