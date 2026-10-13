import { describe, expect, it } from "vitest";
import { fmtDhaka, fmtDhakaOn, fmtDhakaTime, fmtUtc } from "@/lib/format";

describe("§3.5 date formatters (DD/MM/YYYY, 24-hour, zone named)", () => {
  it("formats the Board DS examples", () => {
    expect(fmtUtc("2026-10-11T21:27:00Z")).toBe("11/10/2026 21:27 UTC");
    expect(fmtDhaka("2026-10-11T21:27:00Z")).toBe("12/10/2026 03:27 Dhaka");
    expect(fmtDhakaTime("2026-10-11T21:28:00Z")).toBe("12/10/2026 03:28 Dhaka time");
    expect(fmtDhakaOn("2026-10-14T05:20:00Z")).toBe("on 14/10/2026, 11:20 Dhaka time");
  });
  it("crosses the date line correctly around midnight UTC and midnight Dhaka", () => {
    expect(fmtUtc("2026-10-12T00:00:00Z")).toBe("12/10/2026 00:00 UTC");
    expect(fmtDhaka("2026-10-12T00:00:00Z")).toBe("12/10/2026 06:00 Dhaka");
    expect(fmtDhaka("2026-10-12T17:59:00Z")).toBe("12/10/2026 23:59 Dhaka");
    expect(fmtDhaka("2026-10-12T18:00:00Z")).toBe("13/10/2026 00:00 Dhaka");
    expect(fmtUtc("2026-12-31T23:59:00Z")).toBe("31/12/2026 23:59 UTC");
    expect(fmtDhaka("2026-12-31T23:59:00Z")).toBe("01/01/2027 05:59 Dhaka");
  });
  it("accepts an offset timestamp and returns an unparseable value unchanged", () => {
    expect(fmtUtc("2026-10-12T03:27:00+06:00")).toBe("11/10/2026 21:27 UTC");
    expect(fmtDhaka("not a date")).toBe("not a date");
  });
});
