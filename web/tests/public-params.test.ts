import { describe, expect, it } from "vitest";
import { ID_MAX, checkHref, isPathId, parseCheckIds, parseIndex, parseQuery, parseSearchPage, parseSeverity } from "@/lib/public-params";

describe("search query (§6.3 validation)", () => {
  it("trims, measures in characters, and names the problem", () => {
    expect(parseQuery("  napa ")).toEqual({ q: "napa", problem: null });
    expect(parseQuery("a")).toEqual({ q: "a", problem: "short" });
    expect(parseQuery(undefined)).toEqual({ q: "", problem: "short" });
    expect(parseQuery("x".repeat(101))).toEqual({ q: "x".repeat(101), problem: "long" });
    expect(parseQuery("প".repeat(100)).problem).toBeNull();
    expect(parseQuery(["first", "second"]).q).toBe("first");
  });
  // Final review finding 2: a C0 control or DEL never reaches the API (Postgres rejects NUL; Java strips U+001C–U+001F).
  it("control characters read as spaces, so they never reach the API", () => {
    expect(parseQuery("ab\u0000")).toEqual({ q: "ab", problem: null });
    expect(parseQuery("\u0000\u0000")).toEqual({ q: "", problem: "short" });
    expect(parseQuery("a\u001F")).toEqual({ q: "a", problem: "short" });
    expect(parseQuery("\u001Cnapa\u001D")).toEqual({ q: "napa", problem: null });
    expect(parseQuery("na\u0007pa\u007F")).toEqual({ q: "na pa", problem: null });
    expect(parseQuery("napa\t500\n")).toEqual({ q: "napa 500", problem: null });
    for (let c = 0; c < 0x20; c++) expect(parseQuery(`ab${String.fromCharCode(c)}cd`).q).not.toMatch(/[\u0000-\u001F\u007F]/);
  });
});

describe("path ids (final review finding 2)", () => {
  it("a product or substance id is 1 to ID_MAX characters with no control character", () => {
    expect(isPathId("186-0030-006--napa")).toBe(true);
    expect(isPathId("BDS-000001")).toBe(true);
    expect(isPathId("x".repeat(ID_MAX))).toBe(true);
    expect(isPathId("x".repeat(ID_MAX + 1))).toBe(false);
    expect(isPathId("x".repeat(5000))).toBe(false);
    expect(isPathId("")).toBe(false);
    for (const bad of ["a\u0000", "\u0000", "a\u001Fb", "a\nb", "a\u007F"]) expect(isPathId(bad)).toBe(false);
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
  it("drops an id with a control character, as an overlong one (final review finding 2)", () => {
    expect(parseCheckIds({ ids: ["a\u0000", "b", "c\u001F"] })).toEqual({ ids: ["b"], changed: true });
    expect(parseCheckIds({ ids: ["b"], add: "x\u0000" }).ids).toEqual(["b"]);
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
