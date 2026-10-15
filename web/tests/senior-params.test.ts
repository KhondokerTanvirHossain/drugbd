import { describe, expect, it } from "vitest";
import { pairsHref, parsePairQuery, parseSubstanceQuery, parseSubstancesQuery, substanceHref, substancesHref } from "@/lib/senior-params";

describe("senior page parameters (§5.17.1, Review Focus 5)", () => {
  it("defaults: show todo, all pairs, any severity, page 0", () => {
    expect(parsePairQuery({})).toEqual({ show: "todo", pairs: "all", severity: null, page: 0 });
  });
  it("keeps known values and falls back to the default for each unknown one", () => {
    expect(parsePairQuery({ show: "changed", pairs: "applies", severity: "major", page: "3" }))
      .toEqual({ show: "changed", pairs: "applies", severity: "major", page: 3 });
    expect(parsePairQuery({ show: "bogus", pairs: "x", severity: "urgent", page: "-1" })).toEqual({ show: "todo", pairs: "all", severity: null, page: 0 });
    expect(parsePairQuery({ page: "10001" }).page).toBe(0);
    expect(parsePairQuery({ page: ["2", "5"] }).page).toBe(2);
  });
  it("the substance page and the substances list", () => {
    expect(parseSubstanceQuery({ pairs: "applies", severity: "unknown", page: "1" })).toEqual({ pairs: "applies", severity: "unknown", page: 1 });
    expect(parseSubstanceQuery({ show: "todo" })).toEqual({ pairs: "all", severity: null, page: 0 });
    expect(parseSubstancesQuery({ q: "  para  ", page: "2" })).toEqual({ q: "para", page: 2 });
    expect([...parseSubstancesQuery({ q: "😀".repeat(150) }).q]).toHaveLength(100);
  });
  it("links leave the defaults out", () => {
    expect(pairsHref({})).toBe("/review/pairs");
    expect(pairsHref({ show: "all", pairs: "applies", severity: "minor", page: 2 })).toBe("/review/pairs?show=all&pairs=applies&severity=minor&page=2");
    expect(substanceHref("BDS-000003")).toBe("/review/substances/BDS-000003");
    expect(substanceHref("BDS-000003", { pairs: "applies", page: 1 })).toBe("/review/substances/BDS-000003?pairs=applies&page=1");
    expect(substancesHref("", 0)).toBe("/review/substances");
    expect(substancesHref("war", 1)).toBe("/review/substances?q=war&page=1");
  });
});
