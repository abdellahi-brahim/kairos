import { describe, expect, it } from "vitest";
import { dayRange, formatDuration, monthYear, shiftDay } from "./date";

describe("date helpers", () => {
  it("shifts day keys forward and backward", () => {
    expect(shiftDay("2026-08-15", 1)).toBe("2026-08-16");
    expect(shiftDay("2026-08-15", -2)).toBe("2026-08-13");
  });

  it("builds an inclusive forward day range", () => {
    expect(dayRange("2026-08-15", 4)).toEqual([
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
    ]);
  });

  it("formats minute durations", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(135)).toBe("2h 15m");
  });

  it("formats a month title for the native toolbar", () => {
    expect(monthYear("2026-08-18")).toBe("August 2026");
  });
});
