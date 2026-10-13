import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/return-to";

const ORIGIN = "https://drugdb.eliooo.org";

describe("safeReturnTo (§6.2 step 4)", () => {
  it.each(["/\\evil.com", "/%5Cevil.com", "/%5cevil.com", "//evil.com", "///evil.com", "https://drugdb.eliooo.org.evil.com",
    "https://drugdb.eliooo.org/review", "/review\nx", "/review\tx", "/a\u0000b", "/a\u007fb", "/a\rb", "", "review", "javascript:alert(1)",
    "/.//evil.com", "/a/..//evil.com", "/%2e//evil.com", "/%2e%2e//evil.com"])(
    "refuses %j", (v) => expect(safeReturnTo(v, ORIGIN)).toBeNull());

  it("refuses non-strings", () => {
    for (const v of [null, undefined, 42, ["/review"], { href: "/review" }]) expect(safeReturnTo(v, ORIGIN)).toBeNull();
  });

  it("accepts a same-origin path and returns the parsed pathname, search and hash", () => {
    expect(safeReturnTo("/review/0001-pilot/x?show=needs", ORIGIN)).toBe("/review/0001-pilot/x?show=needs");
    expect(safeReturnTo("/products/186-0030-006--napa#flag", ORIGIN)).toBe("/products/186-0030-006--napa#flag");
  });

  it("returns the parsed URL, never the raw string", () => {
    expect(safeReturnTo("/review/../signin?x=1", ORIGIN)).toBe("/signin?x=1");
  });

  it("works with the e2e origin (http, with a port)", () => {
    expect(safeReturnTo("/review", "http://localhost:3000")).toBe("/review");
    expect(safeReturnTo("//localhost:3001/review", "http://localhost:3000")).toBeNull();
  });
});
