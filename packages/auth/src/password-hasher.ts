import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const HASH_PREFIX = "scrypt";

/**
 * Generates a cryptographically secure hash for a plaintext password using scrypt.
 * Format: scrypt:<salt_hex>:<hash_hex>
 */
export function hashPassword(password: string): string {
  if (!password || typeof password !== "string" || password.length === 0) {
    throw new Error("Password cannot be empty");
  }

  const salt = crypto.randomBytes(SALT_BYTES);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);

  return `${HASH_PREFIX}:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash using timing-safe comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
    return false;
  }

  const [, saltHex, originalHashHex] = parts;
  if (!saltHex || !originalHashHex) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const originalHash = Buffer.from(originalHashHex, "hex");

    if (salt.length !== SALT_BYTES || originalHash.length !== SCRYPT_KEYLEN) {
      return false;
    }

    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);

    return crypto.timingSafeEqual(derivedKey, originalHash);
  } catch {
    return false;
  }
}
