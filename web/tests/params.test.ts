import { describe, expect, it } from "vitest";
import { firstParam } from "../lib/params";

describe("firstParam", () => {
  it("returns a string as is", () => expect(firstParam("napa")).toBe("napa"));
  it("returns the first of an array", () => expect(firstParam(["a", "b"])).toBe("a"));
  it("returns empty for undefined or empty array", () => {
    expect(firstParam(undefined)).toBe("");
    expect(firstParam([])).toBe("");
  });
});
