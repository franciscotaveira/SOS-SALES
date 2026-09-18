import { describe, it, expect } from "vitest";
import { PhoneNumber } from "../phone-number.vo";

describe("PhoneNumber Value Object", () => {
  it("should normalize valid Brazilian phone numbers to E.164", () => {
    const phone = new PhoneNumber("5549999998888");
    expect(phone.toString()).toBe("+5549999998888");
  });

  it("should preserve existing + in E.164 numbers", () => {
    const phone = new PhoneNumber("+5511988887777");
    expect(phone.toString()).toBe("+5511988887777");
  });

  it("should strip spaces, dashes and parentheses", () => {
    const phone = new PhoneNumber("+55 (49) 99999-1234");
    expect(phone.toString()).toBe("+5549999991234");
  });

  it("should throw for invalid formats", () => {
    expect(() => new PhoneNumber("abc")).toThrow();
    expect(() => new PhoneNumber("000")).toThrow();
  });

  it("should correctly mask phone numbers for log privacy", () => {
    const phone = new PhoneNumber("+5549999998888");
    expect(phone.toMasked()).toBe("+55*****8888");
  });
});
