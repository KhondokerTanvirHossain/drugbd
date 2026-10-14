import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_Q_MAX, getReviewDiff, getReviewItem, getReviewItems, getReviewVersions, listFlagPage, listReviewBatches, postDeskDecision,
  resolveFlag,
} from "@/lib/api";
import { sameVersion } from "@/lib/review-types";

const TOKEN = "t".repeat(40);
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const fail = (status: number, field: string | null, message = "x") =>
  new Response(JSON.stringify({ success: false, errors: [{ field, code: "CONFLICT", message }] }), { status });
const headersOf = (call: unknown[]) => new Headers((call[1] as RequestInit).headers);

beforeEach(() => { vi.stubEnv("API_URL", "http://api:8080"); vi.stubEnv("INTERNAL_API_TOKEN", TOKEN); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("review reads (§7.3)", () => {
  it("send the internal token and never a scope", async () => {
    const f = vi.fn().mockResolvedValue(ok([])); vi.stubGlobal("fetch", f);
    expect(await listReviewBatches()).toEqual([]);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/review/batches");
    expect(headersOf(f.mock.calls[0]).get("X-Internal-Token")).toBe(TOKEN);
  });

  it("throw before any call when the token is not configured", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "short");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await expect(listReviewBatches()).rejects.toThrow("The internal API token is not configured");
    expect(f).not.toHaveBeenCalled();
  });

  it("build the items query: no show for all, trimmed q, size 500 by default, encoded batch id", async () => {
    const f = vi.fn().mockImplementation(async () => ok({ items: [] })); vi.stubGlobal("fetch", f);
    await getReviewItems("0001 pilot", { show: "all", q: "  napa  " });
    await getReviewItems("0001-pilot", { show: "needs", page: 2, size: 50 });
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/review/batches/0001%20pilot/items?q=napa&size=500");
    expect(f.mock.calls[1][0]).toBe("http://api:8080/v1/review/batches/0001-pilot/items?show=needs&page=2&size=50");
  });

  it("clamps q to 100 characters, counted in code points (Review Focus 5)", async () => {
    const f = vi.fn().mockImplementation(async () => ok({ items: [] })); vi.stubGlobal("fetch", f);
    await getReviewItems("b", { q: "😀".repeat(150) });
    const q = new URL(f.mock.calls[0][0] as string).searchParams.get("q")!;
    expect(REVIEW_Q_MAX).toBe(100);
    expect([...q]).toHaveLength(100);
  });

  it("answer null for an unknown batch, record or snapshot and throw on 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getReviewItems("nope")).toBeNull();
    expect(await getReviewVersions("nope")).toBeNull();
    expect(await getReviewItem("b", "c", null)).toBeNull();
    expect(await getReviewDiff("b", "c", "2026-10-12T09:00:00Z")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 502 })));
    await expect(getReviewVersions("b")).rejects.toThrow("API error 502");
  });

  it("send the viewer's email only as a header, and encode ids and the diff time", async () => {
    const f = vi.fn().mockImplementation(async () => ok({ conceptId: "a/b" })); vi.stubGlobal("fetch", f);
    await getReviewItem("0001-pilot", "a/b", "Pharm@E2E.test");
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/review/batches/0001-pilot/items/a%2Fb");
    expect(headersOf(f.mock.calls[0]).get("X-Viewer-Email")).toBe("Pharm@E2E.test");
    await getReviewItem("0001-pilot", "c", null);
    expect(headersOf(f.mock.calls[1]).has("X-Viewer-Email")).toBe(false);
    await getReviewDiff("0001-pilot", "c", "2026-10-12T09:00:00.123456Z");
    expect(f.mock.calls[2][0]).toBe(
      "http://api:8080/v1/review/batches/0001-pilot/items/c/diff?from=2026-10-12T09%3A00%3A00.123456Z");
  });
});

describe("desk decisions", () => {
  const request = { decision: "ok" as const, note: "", reviewerEmail: "pharm@e2e.test", reviewerRole: "pharmacist" as const,
    extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: null, requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" };

  it("post the version and the requestId, and return the outcome with its version", async () => {
    const f = vi.fn().mockResolvedValue(ok({ review: "ok", displayStatus: "approved", batchStatus: "in_review",
      version: { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: 42 }, replayed: false }, 201));
    vi.stubGlobal("fetch", f);
    expect(await postDeskDecision("0001-pilot", "N-1", request)).toEqual({ ok: true, data: { review: "ok",
      displayStatus: "approved", batchStatus: "in_review", version: { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: 42 },
      replayed: false } });
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ decision: "ok", note: "",
      reviewerEmail: "pharm@e2e.test", reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00.123456Z",
      expectedLastDecisionId: null, requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" });
  });

  it("carry the 409 field and message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fail(409, "lastDecisionId", "Another reviewer decided")));
    expect(await postDeskDecision("b", "c", request)).toEqual({ ok: false, status: 409, error: "Another reviewer decided",
      field: "lastDecisionId" });
  });

  it("a replay (200) is a success with replayed true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ review: "ok", displayStatus: "approved", batchStatus: "approved",
      version: { extractedAt: null, lastDecisionId: 7 }, replayed: true })));
    const r = await postDeskDecision("b", "c", request);
    expect(r.ok && r.data.replayed).toBe(true);
  });
});

describe("flag pages (§5.16, §7.5)", () => {
  const flag = { id: 3, targetType: "product", targetId: "N-1", message: "pack says 10 mg", reporterEmail: "u@x.org",
    status: "open", createdAt: "2026-10-12T09:00:00Z", resolvedAt: null, resolvedBy: null };

  it("problem reports are every open flag but partner requests; partner requests are other/partner-access", async () => {
    const f = vi.fn().mockImplementation(async () => ok({ items: [flag], page: 0, size: 50, hasMore: false })); vi.stubGlobal("fetch", f);
    await listFlagPage("reports", 0);
    await listFlagPage("partner", 2);
    // no targetType filter: an `other` flag that is not a partner request is still a problem report (§5.16)
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/flags?status=open&excludeTargetId=partner-access&page=0&size=50");
    expect(f.mock.calls[1][0]).toBe("http://api:8080/v1/flags?status=open&targetType=other&targetId=partner-access&page=2&size=50");
  });

  it("drops reporter and resolver emails before any page can render them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ items: [flag], page: 0, size: 50, hasMore: true })));
    const page = await listFlagPage("reports", 0);
    expect(page).toEqual({ items: [{ id: 3, targetType: "product", targetId: "N-1", message: "pack says 10 mg", status: "open",
      createdAt: "2026-10-12T09:00:00Z" }], page: 0, size: 50, hasMore: true });
    expect(JSON.stringify(page)).not.toContain("@");
  });

  it("resolve sends the request id for the audit row", async () => {
    const f = vi.fn().mockResolvedValue(ok({ id: 3 })); vi.stubGlobal("fetch", f);
    await resolveFlag(3, "pharm@e2e.test", "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22");
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string))
      .toEqual({ resolvedBy: "pharm@e2e.test", requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" });
  });
});

describe("sameVersion", () => {
  it("compares the stamp text and the decision id, nulls included", () => {
    expect(sameVersion({ extractedAt: null, lastDecisionId: null }, { extractedAt: null, lastDecisionId: null })).toBe(true);
    expect(sameVersion({ extractedAt: "a", lastDecisionId: 1 }, { extractedAt: "a", lastDecisionId: 2 })).toBe(false);
    expect(sameVersion({ extractedAt: "a", lastDecisionId: null }, { extractedAt: null, lastDecisionId: null })).toBe(false);
  });
});
