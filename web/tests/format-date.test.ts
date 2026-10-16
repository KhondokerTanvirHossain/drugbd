import { describe, expect, it } from "vitest";
import { fmtDhakaDate } from "@/lib/format";

describe("fmtDhakaDate (§3.6 PAIR_REVIEWED, §5.6.6 fetched on)", () => {
  it("is the Dhaka calendar date, DD/MM/YYYY", () => {
    expect(fmtDhakaDate("2026-10-15T09:00:00Z")).toBe("15/10/2026");
    expect(fmtDhakaDate("2026-10-14T18:30:00Z")).toBe("15/10/2026");   // 00:30 next day in Dhaka (UTC+6)
    expect(fmtDhakaDate("2026-10-14T17:59:00Z")).toBe("14/10/2026");
  });
  it("returns the raw value when it does not parse", () => {
    expect(fmtDhakaDate("not a date")).toBe("not a date");
  });
});
