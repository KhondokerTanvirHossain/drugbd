import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProduct, searchProducts } from "../lib/api";

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
beforeEach(() => vi.stubEnv("API_URL", "http://api:8080"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("returns a readable error on API 400", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: false, errors: [{ message: "q must be 2-100 characters" }] }), { status: 400 })));
    expect(await searchProducts("zz", 0)).toEqual({ items: [], error: "q must be 2-100 characters" });
  });
  it("returns unavailable error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await searchProducts("napa", 0)).toEqual({ items: [], error: "Search is temporarily unavailable. Please try again." });
  });
  it("returns Search failed for a 500 with non-JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>boom</html>", { status: 500 })));
    expect(await searchProducts("napa", 0)).toEqual({ items: [], error: "Search failed" });
  });
  it("returns Search failed for a 200 without a data array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    expect(await searchProducts("napa", 0)).toEqual({ items: [], error: "Search failed" });
  });
  it("returns null for unknown product", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getProduct("nope")).toBeNull();
  });
  it("getProduct encodes the id and uses a timeout signal", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 404 })); vi.stubGlobal("fetch", f);
    await getProduct("a/b");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products/a%2Fb");
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("getProduct throws on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
    await expect(getProduct("x")).rejects.toThrow("API error 500");
  });
});
