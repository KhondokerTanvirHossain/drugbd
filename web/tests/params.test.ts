import { describe, expect, it } from "vitest";
import { firstParam, listParam } from "../lib/params";

describe("firstParam", () => {
  it("returns a string as is", () => expect(firstParam("napa")).toBe("napa"));
  it("returns the first of an array", () => expect(firstParam(["a", "b"])).toBe("a"));
  it("returns empty for undefined or empty array", () => {
    expect(firstParam(undefined)).toBe("");
    expect(firstParam([])).toBe("");
  });
});

describe("listParam", () => {
  it("returns every value, trimmed, without blanks or repeats, in first-seen order", () => {
    expect(listParam([" b ", "a", "", "b", "  "])).toEqual(["b", "a"]);
  });
  it("wraps a single value and returns empty for undefined", () => {
    expect(listParam("x")).toEqual(["x"]);
    expect(listParam(undefined)).toEqual([]);
  });
});
