import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPairQueue, getSeniorSubstance, listSeniorSubstances, postPairDecision } from "@/lib/api";

const TOKEN = "test-internal-token-0123456789abcdef";
let fetchMock: ReturnType<typeof vi.fn>;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  fetchMock = vi.fn().mockResolvedValue(ok({ total: 0, counts: { todo: 0, changed: 0, issue: 0, reviewed: 0, all: 0 }, items: [] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("senior review reads and the pair decision write (§7.7)", () => {
  it("the queue carries the token and the viewer, and its query", async () => {
    await getPairQueue({ show: "issue", pairs: "applies", severity: "major", page: 2 }, "senior@e2e.test");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/review/pairs?show=issue&pairs=applies&page=2&size=50&severity=major");
    expect(init.headers).toMatchObject({ "X-Internal-Token": TOKEN, "X-Viewer-Email": "senior@e2e.test" });
  });
  it("a failed read throws, so the page's error boundary shows (§5.17.5)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(getPairQueue({ show: "todo", pairs: "all", severity: null, page: 0 }, "s@x.org")).rejects.toThrow("API error 500");
  });
  it("substances list and page; an unknown substance is null", async () => {
    fetchMock.mockResolvedValueOnce(ok({ total: 0, items: [] }));
    await listSeniorSubstances("war", 1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://api:8080/v1/review/substances?page=1&size=50&q=war");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await getSeniorSubstance("BDS-999999", { pairs: "all", severity: null, page: 0 }, "s@x.org")).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("http://api:8080/v1/review/substances/BDS-999999?pairs=all&page=0&size=50");
  });
  it("the pair decision posts the session's email and role with the version and requestId", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ddinterA: "DDInter14", ddinterB: "DDInter1951", review: { state: "reviewed", at: "2026-10-15T03:00:00Z",
      mine: true, note: null }, version: { contentHash: "a".repeat(64), lastPairReviewId: 9 }, replayed: false }, 201));
    const r = await postPairDecision("DDInter14", "DDInter1951", { decision: "reviewed", note: "", reviewerEmail: "senior@e2e.test",
      reviewerRole: "senior", expectedContentHash: "b".repeat(64), expectedLastPairReviewId: null, requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6" });
    expect(r).toEqual({ ok: true, data: { ddinterA: "DDInter14", ddinterB: "DDInter1951",
      review: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: true, note: null }, version: { contentHash: "a".repeat(64), lastPairReviewId: 9 },
      replayed: false } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/review/pairs/DDInter14/DDInter1951/decisions");
    expect(JSON.parse(init.body)).toEqual({ decision: "reviewed", note: "", reviewerEmail: "senior@e2e.test", reviewerRole: "senior",
      expectedContentHash: "b".repeat(64), expectedLastPairReviewId: null, requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6" });
  });
});
