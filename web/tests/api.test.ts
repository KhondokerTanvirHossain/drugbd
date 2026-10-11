import { afterEach, describe, expect, it, vi } from "vitest";
import { getProduct, searchProducts } from "../lib/api";

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("skips the call for queries under 2 characters", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await searchProducts(" a ", 0)).toEqual({ items: [], error: null });
    expect(f).not.toHaveBeenCalled();
  });
  it("encodes the query and page", async () => {
    const f = vi.fn().mockResolvedValue(ok([])); vi.stubGlobal("fetch", f);
    await searchProducts("100% max", 2);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products?q=100%25+max&page=2");
  });
  it("returns a readable error on API 400", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: false, errors: [{ message: "q must be 2-100 characters" }] }), { status: 400 })));
    expect(await searchProducts("zz", 0)).toEqual({ items: [], error: "q must be 2-100 characters" });
  });
  it("returns null for unknown product", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getProduct("nope")).toBeNull();
  });
});
