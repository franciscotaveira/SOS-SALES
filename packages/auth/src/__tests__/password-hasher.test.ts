import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password-hasher";

describe("password-hasher", () => {
  it("generates scrypt hash and verifies correct password", () => {
    const raw = "MctSecret@2026!";
    const hash = hashPassword(raw);

    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword(raw, hash)).toBe(true);
  });

  it("rejects incorrect password", () => {
    const raw = "MctSecret@2026!";
    const hash = hashPassword(raw);

    expect(verifyPassword("WrongPassword123", hash)).toBe(false);
  });

  it("rejects malformed or empty hashes safely", () => {
    expect(verifyPassword("any", "")).toBe(false);
    expect(verifyPassword("", "scrypt:abc:def")).toBe(false);
    expect(verifyPassword("any", "invalid-format")).toBe(false);
    expect(verifyPassword("any", "bcrypt:abc:def")).toBe(false);
  });

  it("produces unique salts across hashes", () => {
    const pass = "SamePasswordAcrossCalls";
    const hash1 = hashPassword(pass);
    const hash2 = hashPassword(pass);

    expect(hash1).not.toBe(hash2);
    expect(verifyPassword(pass, hash1)).toBe(true);
    expect(verifyPassword(pass, hash2)).toBe(true);
  });
});
