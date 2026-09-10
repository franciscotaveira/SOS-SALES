import { describe, expect, it } from "vitest";
import { formatLocalDateTimeInput } from "./localDateTime";

describe("formatLocalDateTimeInput", () => {
  it("preserves the local wall-clock value expected by datetime-local", () => {
    const value = new Date(2026, 8, 11, 10, 5, 0, 0);
    expect(formatLocalDateTimeInput(value)).toBe("2026-09-11T10:05");
  });
});
