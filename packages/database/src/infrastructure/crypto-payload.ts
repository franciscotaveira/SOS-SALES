import crypto from "node:crypto";

export interface EncryptedPayload {
  readonly encryptedBase64: string;
  readonly ivBase64: string;
  readonly authTagBase64: string;
  readonly keyVersion?: number;
}

export interface CryptoOptions {
  readonly aad?: string | Buffer;
  readonly keyVersion?: number | string;
}

export type Keyring = Record<number, string>;

/**
 * Normalizes a key version representation (numeric or "v1", "v2") to a positive integer.
 */
export function normalizeKeyVersion(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") {
    if (Number.isNaN(v) || v < 1) {
      throw new Error(`UNKNOWN_KEY_VERSION: Invalid numeric key version ${v}`);
    }
    return Math.floor(v);
  }
  const clean = v.trim().replace(/^v/i, "");
  const num = parseInt(clean, 10);
  if (Number.isNaN(num) || num < 1) {
    throw new Error(`UNKNOWN_KEY_VERSION: Invalid string key version '${v}'`);
  }
  return num;
}

/**
 * Returns the highest registered key version for a keyring, or 1 for a single master key.
 */
export function getActiveKeyVersion(keyOrKeyring: string | Keyring): number {
  if (typeof keyOrKeyring === "string") {
    return 1;
  }
  const versions = Object.keys(keyOrKeyring)
    .map(Number)
    .filter((v) => !Number.isNaN(v) && v >= 1);
  if (versions.length === 0) {
    throw new Error("UNKNOWN_KEY_VERSION: Keyring is empty");
  }
  return Math.max(...versions);
}

/**
 * Parses a JSON keyring from environment variables or returns null if not configured.
 * Checks MCT_KEYRING_JSON and KEYRING_JSON by default.
 */
export function parseKeyringFromEnv(
  envVarNames: string[] = ["MCT_KEYRING_JSON", "KEYRING_JSON"]
): { keyring: Keyring; activeVersion: number } | null {
  for (const varName of envVarNames) {
    const raw = process.env[varName];
    if (raw && raw.trim().length > 0) {
      try {
        const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
        const keyring: Keyring = {};
        for (const [vStr, keyVal] of Object.entries(parsed)) {
          const vNum = normalizeKeyVersion(vStr);
          if (vNum === undefined) continue;
          if (typeof keyVal !== "string" || !/^[0-9a-fA-F]{64}$/.test(keyVal)) {
            throw new Error(`Key for version ${vStr} must be a 64-character hexadecimal string`);
          }
          keyring[vNum] = keyVal;
        }
        if (Object.keys(keyring).length === 0) {
          throw new Error("Keyring JSON does not contain any valid version entries");
        }
        const activeOverride =
          process.env.MCT_ACTIVE_KEY_VERSION || process.env.ACTIVE_KEY_VERSION;
        const activeVersion = activeOverride
          ? normalizeKeyVersion(activeOverride)!
          : getActiveKeyVersion(keyring);

        if (!keyring[activeVersion]) {
          throw new Error(
            `UNKNOWN_KEY_VERSION: Active key version ${activeVersion} is not present in the keyring`
          );
        }

        return { keyring, activeVersion };
      } catch (err: any) {
        throw new Error(`CRYPTO_PAYLOAD_ERROR: Failed to parse keyring from ${varName}: ${err.message}`);
      }
    }
  }
  return null;
}

/**
 * Resolves a 256-bit hexadecimal key from either a direct key string or a versioned keyring.
 * Fails closed with UNKNOWN_KEY_VERSION if the requested version is not registered.
 */
export function resolveKeyFromKeyring(
  keyOrKeyring: string | Keyring,
  keyVersion?: number | string
): string {
  const normVersion = normalizeKeyVersion(keyVersion);

  if (typeof keyOrKeyring === "string") {
    if (normVersion !== undefined && normVersion !== 1) {
      throw new Error(`UNKNOWN_KEY_VERSION: Key version ${keyVersion} is not configured in single-key mode`);
    }
    if (!/^[0-9a-fA-F]{64}$/.test(keyOrKeyring)) {
      throw new Error("CRYPTO_PAYLOAD_ERROR: Master key must be a 64-character hexadecimal string");
    }
    return keyOrKeyring;
  }

  let version = normVersion;
  if (version === undefined) {
    version = getActiveKeyVersion(keyOrKeyring);
  }

  const key = keyOrKeyring[version];
  if (!key) {
    throw new Error(`UNKNOWN_KEY_VERSION: Key version ${version} is not present in the keyring`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`CRYPTO_PAYLOAD_ERROR: Key for version ${version} must be a 64-character hexadecimal string`);
  }
  return key;
}

/**
 * Encrypts a string or buffer using AES-256-GCM with a 256-bit master key (or keyring) and optional AAD.
 * Automatically resolves the active key version if not explicitly passed in options.
 */
export function encryptPayload(
  data: string | Buffer,
  masterKeyOrKeyring: string | Keyring,
  options?: CryptoOptions
): EncryptedPayload {
  const version =
    options?.keyVersion !== undefined
      ? normalizeKeyVersion(options.keyVersion)!
      : getActiveKeyVersion(masterKeyOrKeyring);

  const masterKeyHex = resolveKeyFromKeyring(masterKeyOrKeyring, version);

  const keyBuffer = Buffer.from(masterKeyHex, "hex");
  const iv = crypto.randomBytes(12);

  try {
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
    if (options?.aad) {
      const aadBuffer = typeof options.aad === "string" ? Buffer.from(options.aad, "utf8") : options.aad;
      cipher.setAAD(aadBuffer);
    }

    const inputBuffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    const ciphertext = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encryptedBase64: ciphertext.toString("base64"),
      ivBase64: iv.toString("base64"),
      authTagBase64: authTag.toString("base64"),
      keyVersion: version,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("UNKNOWN_KEY_VERSION")) {
      throw err;
    }
    throw new Error("CRYPTO_PAYLOAD_ERROR: Redacted failure during payload encryption");
  } finally {
    keyBuffer.fill(0);
  }
}

function decryptWithSingleKey(
  encryptedBase64: string,
  ivBase64: string,
  authTagBase64: string,
  keyHex: string,
  aad?: string | Buffer
): string {
  const keyBuffer = Buffer.from(keyHex, "hex");
  const ivBuffer = Buffer.from(ivBase64, "base64");
  const authTagBuffer = Buffer.from(authTagBase64, "base64");
  const ciphertextBuffer = Buffer.from(encryptedBase64, "base64");

  let decryptedBuffer: Buffer | null = null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, ivBuffer);
    if (aad) {
      const aadBuffer = typeof aad === "string" ? Buffer.from(aad, "utf8") : aad;
      decipher.setAAD(aadBuffer);
    }
    decipher.setAuthTag(authTagBuffer);
    decryptedBuffer = Buffer.concat([
      decipher.update(ciphertextBuffer),
      decipher.final(),
    ]);
    return decryptedBuffer.toString("utf8");
  } finally {
    keyBuffer.fill(0);
    if (decryptedBuffer) {
      decryptedBuffer.fill(0);
    }
  }
}

/**
 * Decrypts an AES-256-GCM encrypted payload back to a UTF-8 string with optional AAD validation
 * and key resolution by version. When options.keyVersion is omitted and a Keyring is supplied,
 * attempts the active key version first and transparently tries remaining keyring versions on auth failure.
 */
export function decryptPayload(
  encryptedBase64: string,
  ivBase64: string,
  authTagBase64: string,
  masterKeyOrKeyring: string | Keyring,
  options?: { aad?: string | Buffer; keyVersion?: number | string }
): string {
  // If a specific key version was requested, use ONLY that version without fallback
  if (options?.keyVersion !== undefined) {
    const version = normalizeKeyVersion(options.keyVersion)!;
    const masterKeyHex = resolveKeyFromKeyring(masterKeyOrKeyring, version);
    try {
      return decryptWithSingleKey(encryptedBase64, ivBase64, authTagBase64, masterKeyHex, options?.aad);
    } catch {
      throw new Error("CRYPTO_PAYLOAD_ERROR: Redacted failure during payload decryption");
    }
  }

  // If single string key, decrypt directly
  if (typeof masterKeyOrKeyring === "string") {
    try {
      return decryptWithSingleKey(encryptedBase64, ivBase64, authTagBase64, masterKeyOrKeyring, options?.aad);
    } catch {
      throw new Error("CRYPTO_PAYLOAD_ERROR: Redacted failure during payload decryption");
    }
  }

  // Keyring mode with no explicit version:
  // Try active key version first, then fallback to other keys in the keyring
  const activeVersion = getActiveKeyVersion(masterKeyOrKeyring);
  const otherVersions = Object.keys(masterKeyOrKeyring)
    .map((k) => normalizeKeyVersion(k)!)
    .filter((v) => v !== undefined && v !== activeVersion)
    .sort((a, b) => b - a);

  const versionsToTry = [activeVersion, ...otherVersions];

  for (const v of versionsToTry) {
    const keyHex = masterKeyOrKeyring[v];
    if (!keyHex) continue;
    try {
      return decryptWithSingleKey(encryptedBase64, ivBase64, authTagBase64, keyHex, options?.aad);
    } catch {
      // Continue trying next key in keyring if authentication/decryption failed
    }
  }

  throw new Error("CRYPTO_PAYLOAD_ERROR: Redacted failure during payload decryption");
}

