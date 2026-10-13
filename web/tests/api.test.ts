import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkInteractions, getBatch, getProduct, getSubstance, searchProducts } from "../lib/api";

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token-0123456789abcdef");
});
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
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products?q=100%25+max&page=2&scope=public");
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
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products/a%2Fb?scope=public");
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("getProduct throws on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
    await expect(getProduct("x")).rejects.toThrow("API error 500");
  });
  it("getBatch returns null on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getBatch("nope")).toBeNull();
  });
  it("getBatch throws on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(getBatch("x")).rejects.toThrow("API error 500");
  });
  it("getBatch URL-encodes the id and passes timeout and no-store", async () => {
    const f = vi.fn().mockResolvedValue(ok({ batchId: "a/b c", items: [] })); vi.stubGlobal("fetch", f);
    await getBatch("a/b c");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/batches/a%2Fb%20c");
    expect(new Headers(f.mock.calls[0][1].headers).get("X-Internal-Token")).toBe("test-internal-token-0123456789abcdef");
    expect(f.mock.calls[0][1].cache).toBe("no-store");
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("getSubstance encodes the id and passes timeout and no-store", async () => {
    const f = vi.fn().mockResolvedValue(ok({ bdsId: "BDS-000001" })); vi.stubGlobal("fetch", f);
    expect(await getSubstance("BDS-000001/x")).toEqual({ bdsId: "BDS-000001" });
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/substances/BDS-000001%2Fx?scope=public");
    expect(f.mock.calls[0][1].cache).toBe("no-store");
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("getSubstance returns null on 404 and throws on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getSubstance("BDS-999999")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(getSubstance("BDS-000001")).rejects.toThrow("API error 500");
  });
  it("checkInteractions posts the ids as JSON with timeout and no-store", async () => {
    const data = { products: [], alerts: [], duplicates: [], noData: [], notReviewed: [] };
    const f = vi.fn().mockResolvedValue(ok(data)); vi.stubGlobal("fetch", f);
    expect(await checkInteractions(["a/b", "c d&e"])).toEqual({ result: data, error: null });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/interactions/check?scope=public");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(init.headers).has("X-Internal-Token")).toBe(false);
    expect(JSON.parse(init.body)).toEqual({ conceptIds: ["a/b", "c d&e"] });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("checkInteractions returns the API's message on 400 or 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: false, errors: [{ field: "conceptIds", code: "NOT_FOUND", message: "Product not found: X" }] }),
      { status: 404 })));
    expect(await checkInteractions(["X", "Y"])).toEqual({ result: null, error: "Product not found: X" });
  });
  it("checkInteractions returns a readable error when fetch rejects or the body is not a result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await checkInteractions(["a", "b"])).toEqual(
      { result: null, error: "The interaction checker is temporarily unavailable. Please try again." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>boom</html>", { status: 500 })));
    expect(await checkInteractions(["a", "b"])).toEqual({ result: null, error: "Interaction check failed" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ alerts: [] })));
    expect(await checkInteractions(["a", "b"])).toEqual({ result: null, error: "Interaction check failed" });
  });
});
