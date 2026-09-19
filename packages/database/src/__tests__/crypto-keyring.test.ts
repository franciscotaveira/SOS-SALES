import { describe, expect, it } from "vitest";
import {
  encryptPayload,
  decryptPayload,
  resolveKeyFromKeyring,
  getActiveKeyVersion,
  normalizeKeyVersion,
  parseKeyringFromEnv,
} from "../infrastructure/crypto-payload";

describe("Cryptographic Keyring & key_version Rotation", () => {
  const keyV1 = "1111111111111111111111111111111111111111111111111111111111111111";
  const keyV2 = "2222222222222222222222222222222222222222222222222222222222222222";
  const keyV3 = "3333333333333333333333333333333333333333333333333333333333333333";

  const keyring = {
    1: keyV1,
    2: keyV2,
    3: keyV3,
  };

  it("should resolve active key (highest version) when keyVersion is omitted", () => {
    const resolvedHex = resolveKeyFromKeyring(keyring);
    expect(resolvedHex).toBe(keyV3);
  });

  it("should resolve exact requested key version from keyring", () => {
    const resolved1 = resolveKeyFromKeyring(keyring, 1);
    expect(resolved1).toBe(keyV1);

    const resolved2 = resolveKeyFromKeyring(keyring, 2);
    expect(resolved2).toBe(keyV2);
  });

  it("should throw UNKNOWN_KEY_VERSION when requested version is not in keyring", () => {
    expect(() => resolveKeyFromKeyring(keyring, 99)).toThrowError(
      "UNKNOWN_KEY_VERSION: Key version 99 is not present in the keyring"
    );
  });

  it("should encrypt with specified key version and decrypt with keyring seamlessly", () => {
    const secretData = JSON.stringify({ customerPhone: "+5511999998888", orderTotal: 1500 });

    // Encrypt specifying keyVersion: 3
    const encrypted = encryptPayload(secretData, keyring, { keyVersion: 3 });
    expect(encrypted.keyVersion).toBe(3);

    // Decrypt using the keyring with matching keyVersion
    const decrypted = decryptPayload(
      encrypted.encryptedBase64,
      encrypted.ivBase64,
      encrypted.authTagBase64,
      keyring,
      { keyVersion: encrypted.keyVersion }
    );
    expect(decrypted).toEqual(secretData);
  });

  it("should decrypt historical payload encrypted with older key version (rotation compatibility)", () => {
    const historicalData = JSON.stringify({ note: "Encrypted under older key version 1" });

    // Encrypt specifically with key version 1
    const encryptedV1 = encryptPayload(historicalData, keyV1, { keyVersion: 1 });
    expect(encryptedV1.keyVersion).toBe(1);

    // Decrypt using full keyring that includes version 1 and version 2
    const rotatedKeyring = {
      1: keyV1,
      2: keyV2,
    };

    const decrypted = decryptPayload(
      encryptedV1.encryptedBase64,
      encryptedV1.ivBase64,
      encryptedV1.authTagBase64,
      rotatedKeyring,
      { keyVersion: encryptedV1.keyVersion }
    );
    expect(decrypted).toEqual(historicalData);
  });

  it("should fail explicitly when trying to decrypt payload with an unknown key version", () => {
    const activeKeyring = {
      1: keyV1,
      2: keyV2,
    };

    expect(() =>
      decryptPayload("YWJj", "ZGVm", "Z2hp", activeKeyring, { keyVersion: 42 })
    ).toThrowError(/UNKNOWN_KEY_VERSION: Key version 42 is not present in the keyring/);
  });

  it("should preserve backward compatibility when a single hex key string is passed", () => {
    const simpleData = JSON.stringify({ legacy: true });

    const encrypted = encryptPayload(simpleData, keyV1);
    expect(encrypted.keyVersion).toBe(1);

    const decrypted = decryptPayload(
      encrypted.encryptedBase64,
      encrypted.ivBase64,
      encrypted.authTagBase64,
      keyV1
    );
    expect(decrypted).toEqual(simpleData);
  });

  it("should normalize numeric and string key versions correctly", () => {
    expect(normalizeKeyVersion(undefined)).toBeUndefined();
    expect(normalizeKeyVersion(1)).toBe(1);
    expect(normalizeKeyVersion(2)).toBe(2);
    expect(normalizeKeyVersion("v1")).toBe(1);
    expect(normalizeKeyVersion("V2")).toBe(2);
    expect(normalizeKeyVersion("3")).toBe(3);
    expect(() => normalizeKeyVersion(0)).toThrowError(/Invalid numeric key version/);
    expect(() => normalizeKeyVersion("invalid")).toThrowError(/Invalid string key version/);
  });

  it("should get active key version for single key or keyring", () => {
    expect(getActiveKeyVersion(keyV1)).toBe(1);
    expect(getActiveKeyVersion(keyring)).toBe(3);
    expect(getActiveKeyVersion({ 1: keyV1, 2: keyV2 })).toBe(2);
    expect(() => getActiveKeyVersion({})).toThrowError(/Keyring is empty/);
  });

  it("should automatically encrypt with the highest active version when keyVersion is omitted", () => {
    const data = JSON.stringify({ autoActive: true });
    const encrypted = encryptPayload(data, keyring);
    expect(encrypted.keyVersion).toBe(3);

    const decrypted = decryptPayload(
      encrypted.encryptedBase64,
      encrypted.ivBase64,
      encrypted.authTagBase64,
      keyring
    );
    expect(decrypted).toEqual(data);
  });

  it("should accept string key versions like 'v1' and 'v2' transparently", () => {
    const data = JSON.stringify({ stringVersion: "v2" });
    const encrypted = encryptPayload(data, keyring, { keyVersion: "v2" as any });
    expect(encrypted.keyVersion).toBe(2);

    const decrypted = decryptPayload(
      encrypted.encryptedBase64,
      encrypted.ivBase64,
      encrypted.authTagBase64,
      keyring,
      { keyVersion: "v2" as any }
    );
    expect(decrypted).toEqual(data);
  });

  it("should parse valid keyring JSON from environment variables", () => {
    const originalEnv = process.env.MCT_KEYRING_JSON;
    try {
      process.env.MCT_KEYRING_JSON = JSON.stringify({
        "1": keyV1,
        "2": keyV2,
      });

      const parsed = parseKeyringFromEnv();
      expect(parsed).not.toBeNull();
      expect(parsed?.activeVersion).toBe(2);
      expect(parsed?.keyring[1]).toBe(keyV1);
      expect(parsed?.keyring[2]).toBe(keyV2);
    } finally {
      if (originalEnv !== undefined) {
        process.env.MCT_KEYRING_JSON = originalEnv;
      } else {
        delete process.env.MCT_KEYRING_JSON;
      }
    }
  });

  it("should support active version override from environment variable", () => {
    const originalJson = process.env.MCT_KEYRING_JSON;
    const originalActive = process.env.MCT_ACTIVE_KEY_VERSION;
    try {
      process.env.MCT_KEYRING_JSON = JSON.stringify({
        "1": keyV1,
        "2": keyV2,
        "3": keyV3,
      });
      process.env.MCT_ACTIVE_KEY_VERSION = "2";

      const parsed = parseKeyringFromEnv();
      expect(parsed).not.toBeNull();
      expect(parsed?.activeVersion).toBe(2);
    } finally {
      if (originalJson !== undefined) {
        process.env.MCT_KEYRING_JSON = originalJson;
      } else {
        delete process.env.MCT_KEYRING_JSON;
      }
      if (originalActive !== undefined) {
        process.env.MCT_ACTIVE_KEY_VERSION = originalActive;
      } else {
        delete process.env.MCT_ACTIVE_KEY_VERSION;
      }
    }
  });
});
