import { describe, it, expect } from "vitest";
import { sanitizeBrazilianPhoneE164 } from "../pages/templates/BroadcastTemplateDialog";

describe("Spreadsheet & Phone Sanitizer Suite (MCT OS v2.0)", () => {
  it("should sanitize valid Brazilian mobile with full DDD", () => {
    const res = sanitizeBrazilianPhoneE164("(49) 99999-8888");
    expect(res).toEqual({ phoneE164: "+5549999998888" });
  });

  it("should sanitize mobile starting with 55", () => {
    const res = sanitizeBrazilianPhoneE164("5549988447562");
    expect(res).toEqual({ phoneE164: "+5549988447562" });
  });

  it("should sanitize mobile starting with leading 0 (trunk code)", () => {
    const res = sanitizeBrazilianPhoneE164("049988447562");
    expect(res).toEqual({ phoneE164: "+5549988447562" });
  });

  it("should append 9 to legacy 8-digit Brazilian mobile", () => {
    const res = sanitizeBrazilianPhoneE164("4988447562");
    expect(res).toEqual({ phoneE164: "+5549988447562" });
  });

  it("should reject Brazilian fixed landlines (starting with 2, 3, 4, 5)", () => {
    const res = sanitizeBrazilianPhoneE164("4933221100");
    expect(res).toHaveProperty("error");
    if ("error" in res) {
      expect(res.error).toBe("Telefone fixo descartado");
    }
  });

  it("should reject numbers without DDD", () => {
    const res = sanitizeBrazilianPhoneE164("999998888");
    expect(res).toHaveProperty("error");
    if ("error" in res) {
      expect(res.error).toContain("DDD ausente");
    }
  });

  it("should reject empty or invalid strings", () => {
    expect(sanitizeBrazilianPhoneE164("")).toHaveProperty("error");
    expect(sanitizeBrazilianPhoneE164("abcdef")).toHaveProperty("error");
  });
});
