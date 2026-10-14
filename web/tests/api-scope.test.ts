import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkInteractions, createFlag, getProduct, getSubstance, isHidden, listLoadedProducts, resolveFlag, searchProducts,
} from "../lib/api";

/** A test-only internal token (never a real one). The client-bundle scan also looks for this value. */
const TOKEN = "test-internal-token-0123456789abcdef";
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const headerOf = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

let f: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  f = vi.fn().mockResolvedValue(ok([]));
  vi.stubGlobal("fetch", f);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("public reads (spec §2.2: always scope=public, never the token)", () => {
  it("search sends scope=public and no internal token, even with a token configured", async () => {
    await searchProducts("napa", 1);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products?q=napa&page=1&scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
  });

  it("getProduct reads with public scope and returns the hidden shape as-is", async () => {
    const hidden = { conceptId: "P-1", tradeName: "Napa", reviewStatus: "pending", hidden: true };
    f.mockImplementation(async () => ok(hidden));
    const p = await getProduct("P/1");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products/P%2F1?scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    expect(p).toEqual(hidden);
    expect(isHidden(p)).toBe(true);
  });

  it("isHidden is false for a full record and for null", () => {
    expect(isHidden({ conceptId: "x", tradeName: "y" })).toBe(false);
    expect(isHidden(null)).toBe(false);
  });

  it("getSubstance reads with public scope", async () => {
    f.mockImplementation(async () => ok({ bdsId: "BDS-1", preferredName: "X", reviewStatus: "pending", hidden: true }));
    expect(isHidden(await getSubstance("BDS-1"))).toBe(true);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/substances/BDS-1?scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
  });

  it("checkInteractions reads with public scope and requires the notReviewed array", async () => {
    const data = { products: [], alerts: [], duplicates: [], noData: [], notReviewed: [{ conceptId: "P-2" }] };
    f.mockResolvedValue(ok(data));
    expect(await checkInteractions(["P-1", "P-2"])).toEqual({ result: data, error: null });
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/interactions/check?scope=public");
    expect(headerOf(f.mock.calls[0][1], "Content-Type")).toBe("application/json");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    f.mockResolvedValue(ok({ products: [], alerts: [], duplicates: [], noData: [] }));
    expect(await checkInteractions(["P-1", "P-2"])).toEqual({ result: null, error: "Interaction check failed" });
  });

  it("listLoadedProducts reads the light list with public scope", async () => {
    const rows = [{ conceptId: "P-1", tradeName: "Ace", dosageForm: "Tablet" }];
    f.mockImplementation(async () => ok(rows));
    expect(await listLoadedProducts()).toEqual(rows);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products/loaded?scope=public");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBeNull();
    expect(f.mock.calls[0][1].cache).toBe("no-store");
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    f.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(listLoadedProducts()).rejects.toThrow("API error 500");
  });

  it("no public read ever asks for scope=all", async () => {
    f.mockImplementation(async () => ok([]));
    await searchProducts("napa", 0); await getProduct("P"); await getSubstance("S"); await listLoadedProducts();
    await checkInteractions(["A", "B"]);
    for (const [url] of f.mock.calls) expect(String(url)).not.toContain("scope=all");
  });
});

describe("writes (internal token, JSON body)", () => {
  it("writes refuse to run without a configured internal token (no API call)", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    expect(await createFlag({ targetType: "product", targetId: "P", message: "hello", reporterEmail: "a@b" }))
      .toMatchObject({ ok: false, status: 0 });
    expect(await resolveFlag(1, "a@b")).toMatchObject({ ok: false, status: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it("createFlag POSTs the flag with the token", async () => {
    f.mockResolvedValue(ok({ id: 7 }, 201));
    expect(await createFlag({ targetType: "product", targetId: "P-1", message: "Wrong company", reporterEmail: "u@gmail.com" }))
      .toEqual({ ok: true, data: { id: 7 } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual(
      { targetType: "product", targetId: "P-1", message: "Wrong company", reporterEmail: "u@gmail.com" });
  });

  it("resolveFlag passes the API status through (404 unknown, 409 already resolved)", async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ success: false, errors: [{ message: "Flag already resolved" }] }), { status: 409 }));
    expect(await resolveFlag(3, "p@x.org")).toEqual({ ok: false, status: 409, error: "Flag already resolved", field: null });
  });

  it("resolveFlag POSTs resolvedBy with the token", async () => {
    f.mockResolvedValue(ok({ id: 3, status: "resolved" }));
    expect((await resolveFlag(3, "pharm@example.org")).ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags/3/resolve");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ resolvedBy: "pharm@example.org" });
  });
});
