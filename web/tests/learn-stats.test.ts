import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStats } from "@/lib/api";
import { BATCH_STATUS_WORD, batchPill, exampleUsable, findBatch, findItem, formatCount, parseStats, partlyApproved, pillStatus } from "@/lib/stats";

const STATS = {
  registerProducts: 39196, productsLoaded: 10, substances: 11, approvedProducts: 1, inReviewProducts: 9,
  batches: [{ batchId: "0001-pilot", status: "in_review", itemCount: 2, approved: 1, items: [
    { conceptId: "186-0030-006--napa", tradeName: "Napa", status: "approved", exampleUsable: true },
    { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", status: "not_reviewed", exampleUsable: false },
  ] }],
};
const ITEM = STATS.batches[0].items[0];
const withItem = (patch: Record<string, unknown>) => ({ ...STATS, batches: [{ ...STATS.batches[0], items: [{ ...ITEM, ...patch }] }] });
const withBatch = (patch: Record<string, unknown>) => ({ ...STATS, batches: [{ ...STATS.batches[0], ...patch }] });
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });

describe("parseStats (§7.4 shape)", () => {
  it("accepts the §7.4 body and keeps only its fields", () => {
    expect(parseStats({ ...STATS, extra: "dropped", batches: [{ ...STATS.batches[0], runAt: "x" }] })).toEqual(STATS);
  });

  it("refuses a body with a missing or mistyped field (Review Focus 1)", () => {
    const bad: unknown[] = [null, undefined, [], "stats", {}, { ...STATS, substances: "11" }, { ...STATS, approvedProducts: -1 },
      { ...STATS, productsLoaded: 1.5 }, { ...STATS, batches: "x" }, withBatch({ status: "open" }), withBatch({ itemCount: undefined }),
      withBatch({ items: null }), withItem({ exampleUsable: "true" }), withItem({ status: "issue" }), withItem({ tradeName: "" }),
      withItem({ conceptId: 7 })];
    for (const b of bad) expect(parseStats(b)).toBeNull();
  });
});

describe("lookups and pills", () => {
  const stats = parseStats(STATS)!;
  const batch = findBatch(stats, "0001-pilot");

  it("finds the batch and its items; anything /v1/stats does not report is not usable (fail closed)", () => {
    expect(batch?.itemCount).toBe(2);
    expect(findBatch(stats, "0002-next")).toBeNull();
    expect(findItem(batch, "186-0030-006--napa")?.tradeName).toBe("Napa");
    expect(findItem(null, "186-0030-006--napa")).toBeNull();
    expect(exampleUsable(batch, "186-0030-006--napa")).toBe(true);
    expect(exampleUsable(batch, "185-0138-012--g-warfarin")).toBe(false);
    expect(exampleUsable(batch, "127-0263-018--domperidone")).toBe(false);
    expect(exampleUsable(null, "186-0030-006--napa")).toBe(false);
  });

  it("maps statuses to the two public pills", () => {
    expect(pillStatus(findItem(batch, "186-0030-006--napa"))).toBe("approved");
    expect(pillStatus(findItem(batch, "185-0138-012--g-warfarin"))).toBe("pending");
    expect(pillStatus(null)).toBe("pending");
    expect(batchPill(batch)).toBe("pending");
    expect(batchPill({ ...batch!, approved: 2 })).toBe("approved");
    expect(batchPill({ ...batch!, itemCount: 0, approved: 0 })).toBe("pending");
    expect(batchPill(null)).toBe("pending");
    expect([0, 1, 9, 10].map((approved) => partlyApproved({ ...batch!, itemCount: 10, approved }))).toEqual([false, true, true, false]);
  });

  it("words the batch status and prints counts with thousands separators", () => {
    expect(BATCH_STATUS_WORD).toEqual({ in_review: "in review", approved: "approved", rejected: "rejected" });
    expect(formatCount(39196)).toBe("39,196");
    expect(formatCount(10)).toBe("10");
  });
});

describe("getStats (§7.4, §2.2 public scope)", () => {
  beforeEach(() => {
    vi.stubEnv("API_URL", "http://api:8080");
    vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token-0123456789abcdef");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("reads GET /v1/stats without the internal token, with a timeout", async () => {
    const f = vi.fn().mockResolvedValue(ok(STATS));
    vi.stubGlobal("fetch", f);
    expect(await getStats()).toEqual(STATS);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/stats");
    expect(f.mock.calls[0][1].headers).toEqual({});
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on an API error, a body that is not JSON, or a malformed body", async () => {
    for (const r of [new Response("{}", { status: 502 }), new Response("<html>boom</html>", { status: 200 }), ok({ ...STATS, batches: null })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
      await expect(getStats()).rejects.toThrow(/API error/);
    }
  });

  it("throws when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(getStats()).rejects.toThrow("fetch failed");
  });
});
