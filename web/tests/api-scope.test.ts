import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkPublic, createFlag, getClinicalDrug, getProductInteractions, getPublicProduct, getPublicSubstance, getSubstanceInteractions,
  isHidden, isStub, resolveFlag, searchMedicines, suggestProducts,
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
  it("every public reader sends scope=public and no internal token, even with a token configured", async () => {
    f.mockImplementation(async () => ok({}));
    await searchMedicines("napa", 1); await getPublicProduct("P/1"); await getProductInteractions("P-1", 0);
    await getClinicalDrug("BDC-1"); await getPublicSubstance("BDS-1"); await getSubstanceInteractions("BDS-1", null, 0);
    await suggestProducts("na", ["A"]); await checkPublic(["A", "B"]);
    expect(f).toHaveBeenCalledTimes(8);
    for (const [url, init] of f.mock.calls) {
      expect(String(url)).toContain("scope=public");
      expect(String(url)).not.toContain("scope=all");
      expect(headerOf(init, "X-Internal-Token")).toBeNull();
    }
  });

  it("isHidden is false for a full record and for null; isStub is true for a §7.4 stub", () => {
    expect(isHidden({ conceptId: "P-1", tradeName: "Napa" })).toBe(false);
    expect(isHidden(null)).toBe(false);
    expect(isStub({ conceptId: "P-1", tradeName: "Napa", status: "not_reviewed", batchId: null, hidden: true })).toBe(true);
    expect(isStub({ bdsId: "BDS-1", preferredName: "Warfarin", hidden: true })).toBe(true);
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
