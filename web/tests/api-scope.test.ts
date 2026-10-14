import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkInteractions, createFlag, getBatch, getBatchReport, getDecisions, getProduct, getSubstance, isHidden, listBatches,
  listFlags, listLoadedProducts, postDecision, resolveFlag, searchProducts,
} from "../lib/api";

/** A test-only internal token (never a real one). The client-bundle scan also looks for this value. */
const TOKEN = "test-internal-token-0123456789abcdef";
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ success: false, data: null, errors: [{ message }] }), { status });
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

describe("batch reads (reviewers only, A1 and A2)", () => {
  it("listBatches, getBatch and getBatchReport send the internal token; null on 404", async () => {
    await listBatches();
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/batches");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBe(TOKEN);
    f.mockResolvedValue(ok({ batchId: "0001 pilot", items: [] }));
    await getBatch("0001 pilot");
    expect(f.mock.calls[1][0]).toBe("http://api:8080/v1/batches/0001%20pilot");
    expect(headerOf(f.mock.calls[1][1], "X-Internal-Token")).toBe(TOKEN);
    const report = { counts: {}, review: { pending: 1, ok: 0, issue: 0 }, warnings: [], fails: [], runs: [], deltaVsPrevious: {} };
    f.mockResolvedValue(ok(report));
    expect(await getBatchReport("0001 pilot")).toEqual(report);
    expect(f.mock.calls[2][0]).toBe("http://api:8080/v1/batches/0001%20pilot/report");
    expect(headerOf(f.mock.calls[2][1], "X-Internal-Token")).toBe(TOKEN);
    f.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await getBatchReport("nope")).toBeNull();
    expect(await getBatch("nope")).toBeNull();
  });

  it("refuses batch reads without a configured token (no API call)", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    await expect(listBatches()).rejects.toThrow("internal API token");
    await expect(getBatch("B")).rejects.toThrow("internal API token");
    await expect(getBatchReport("B")).rejects.toThrow("internal API token");
    await expect(getDecisions("B", "N")).rejects.toThrow("internal API token");
    expect(f).not.toHaveBeenCalled();
  });

  it("getDecisions reads with the token and keeps only decision, note, role and time", async () => {
    f.mockResolvedValue(ok([
      { decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T10:00:00Z", reviewerEmail: "pharm@example.org" },
    ]));
    const list = await getDecisions("0001-pilot", "N/1");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/batches/0001-pilot/items/N%2F1/decisions");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBe(TOKEN);
    expect(list).toEqual([{ decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T10:00:00Z" }]);
    expect(JSON.stringify(list)).not.toContain("pharm@example.org");
  });
});

describe("writes (internal token, JSON body)", () => {
  const DECISION = { decision: "ok" as const, note: "", reviewerEmail: "pharm@example.org", reviewerRole: "pharmacist" as const,
    extractedAt: "2026-10-12T09:00:00Z", expectedLastDecisionId: 41, requestId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" };

  it("postDecision POSTs the decision, the version and the requestId with the token", async () => {
    f.mockResolvedValue(ok({ batchId: "B", conceptId: "N-1", review: "ok", displayStatus: "approved", batchStatus: "approved",
      version: { extractedAt: "2026-10-12T09:00:00Z", lastDecisionId: 42 }, replayed: false }, 201));
    const r = await postDecision("B 1", "N/1", DECISION);
    expect(r).toEqual({ ok: true, data: { review: "ok", displayStatus: "approved", batchStatus: "approved", replayed: false } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/batches/B%201/items/N%2F1/decisions");
    expect(init.method).toBe("POST");
    expect(headerOf(init, "X-Internal-Token")).toBe(TOKEN);
    expect(headerOf(init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(DECISION);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("postDecision always sends extractedAt and expectedLastDecisionId, as explicit nulls when the item has none", async () => {
    f.mockResolvedValue(ok({ review: "pending", displayStatus: "pending", batchStatus: "in_review", replayed: false }, 201));
    await postDecision("B", "N", { ...DECISION, decision: "issue", note: "wrong strength", extractedAt: null,
      expectedLastDecisionId: null });
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent).toHaveProperty("extractedAt", null);
    expect(sent).toHaveProperty("expectedLastDecisionId", null);
  });

  it("postDecision reports the status, message and field on failure, and a network error as status 0", async () => {
    f.mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ field: "stages", message: "A check failed" }] }),
      { status: 409 }));
    expect(await postDecision("B", "N", DECISION)).toEqual({ ok: false, status: 409, error: "A check failed", field: "stages" });
    f.mockResolvedValue(fail(409, "The record was re-run"));
    expect(await postDecision("B", "N", DECISION)).toEqual({ ok: false, status: 409, error: "The record was re-run", field: null });
    f.mockRejectedValue(new TypeError("fetch failed"));
    expect(await postDecision("B", "N", DECISION)).toEqual({ ok: false, status: 0, error: "The API is unavailable", field: null });
  });

  it("writes refuse to run without a configured internal token (no API call)", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    expect(await postDecision("B", "N", { decision: "ok", note: "", reviewerEmail: "a@b", reviewerRole: "pharmacist",
      extractedAt: null, expectedLastDecisionId: null, requestId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }))
      .toEqual({ ok: false, status: 0, error: "The internal API token is not configured", field: null });
    expect(await createFlag({ targetType: "product", targetId: "P", message: "hello", reporterEmail: "a@b" }))
      .toMatchObject({ ok: false, status: 0 });
    expect(await resolveFlag(1, "a@b")).toMatchObject({ ok: false, status: 0 });
    await expect(listFlags()).rejects.toThrow("internal API token");
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

  it("listFlags reads open flags with the token and drops emails", async () => {
    f.mockResolvedValue(ok({ items: [{ id: 3, targetType: "substance", targetId: "BDS-1", message: "Name typo",
      reporterEmail: "u@gmail.com", status: "open", createdAt: "2026-10-12T10:00:00Z", resolvedAt: null, resolvedBy: null }],
      page: 0, size: 50, hasMore: false }));
    const flags = await listFlags();
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/flags?status=open");
    expect(headerOf(f.mock.calls[0][1], "X-Internal-Token")).toBe(TOKEN);
    expect(flags).toEqual([{ id: 3, targetType: "substance", targetId: "BDS-1", message: "Name typo", status: "open",
      createdAt: "2026-10-12T10:00:00Z" }]);
    expect(JSON.stringify(flags)).not.toContain("@");
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
