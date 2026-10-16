import { describe, expect, it } from "vitest";
import { checkHref, parseCheckIds, parseIndex, parseQuery, parseSearchPage, parseSeverity } from "@/lib/public-params";

describe("search query (§6.3 validation)", () => {
  it("trims, measures in characters, and names the problem", () => {
    expect(parseQuery("  napa ")).toEqual({ q: "napa", problem: null });
    expect(parseQuery("a")).toEqual({ q: "a", problem: "short" });
    expect(parseQuery(undefined)).toEqual({ q: "", problem: "short" });
    expect(parseQuery("x".repeat(101))).toEqual({ q: "x".repeat(101), problem: "long" });
    expect(parseQuery("প".repeat(100)).problem).toBeNull();
    expect(parseQuery(["first", "second"]).q).toBe("first");
  });
});

// Review Focus 2 and 5
describe("search page index, ix, page and severity", () => {
  it("reads digits only; anything else is the first page", () => {
    for (const raw of [undefined, "", "-1", "abc", "1.5", "1e3", " 2", "0x10"]) expect(parseSearchPage(raw)).toEqual({ page: 0, capped: false });
    expect(parseSearchPage("3")).toEqual({ page: 3, capped: false });
    expect(parseSearchPage("9")).toEqual({ page: 9, capped: false });
    expect(parseSearchPage("10")).toEqual({ page: 9, capped: true });
    expect(parseSearchPage("99999999999999999999")).toEqual({ page: 9, capped: true });
  });
  it("ix and the substance page index clamp to 0–10000", () => {
    expect([parseIndex("-1"), parseIndex("abc"), parseIndex("4"), parseIndex("99999"), parseIndex(["2", "3"])]).toEqual([0, 0, 4, 10_000, 2]);
  });
  it("severity is one of the four, else no filter", () => {
    expect([parseSeverity("major"), parseSeverity("unknown"), parseSeverity("fatal"), parseSeverity("MAJOR"), parseSeverity(undefined)])
      .toEqual(["major", "unknown", null, null, null]);
  });
});

// Review Focus 3
describe("checker ids (§6.7.1, §4.4 no-JS actions)", () => {
  it("de-duplicates, drops blanks and overlong ids, keeps the first 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => `P-${i}`);
    expect(parseCheckIds({ ids: [" A ", "A", "", "B", "x".repeat(201)] })).toEqual({ ids: ["A", "B"], changed: true });
    expect(parseCheckIds({ ids: many }).ids).toEqual(many.slice(0, 20));
    expect(parseCheckIds({ ids: ["A", "B"] })).toEqual({ ids: ["A", "B"], changed: false });
  });
  it("applies clear, remove and add, in that order", () => {
    expect(parseCheckIds({ ids: ["A", "B"], remove: "A" })).toEqual({ ids: ["B"], changed: true });
    expect(parseCheckIds({ ids: ["A"], add: "C" })).toEqual({ ids: ["A", "C"], changed: true });
    expect(parseCheckIds({ ids: ["A"], add: "A" })).toEqual({ ids: ["A"], changed: true });
    expect(parseCheckIds({ ids: ["A", "B"], clear: "1", add: "C" })).toEqual({ ids: ["C"], changed: true });
    const twenty = Array.from({ length: 20 }, (_, i) => `P-${i}`);
    expect(parseCheckIds({ ids: twenty, add: "Z" }).ids).toEqual(twenty);
  });
  it("builds the canonical href", () => {
    expect(checkHref([])).toBe("/check");
    expect(checkHref(["a b", "c&d"])).toBe("/check?ids=a+b&ids=c%26d");
  });
});
