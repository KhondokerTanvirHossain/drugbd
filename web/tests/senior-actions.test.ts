import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const allowAccountAction = vi.fn((_k: string, _e: string) => true);
const verifyTurnstile = vi.fn(async (_t: unknown, _ip: unknown, _a: string) => true);
const postPairDecision = vi.fn();
const recordAudit = vi.fn(async (_e: unknown) => true);
const logRequest = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/limits", () => ({ allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (t: unknown, ip: unknown, a: string) => verifyTurnstile(t, ip, a) }));
vi.mock("@/lib/api", () => ({ postPairDecision: (...a: unknown[]) => postPairDecision(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));
vi.mock("@/lib/request-log", () => ({ logRequest: (l: unknown) => logRequest(l) }));
vi.mock("@/lib/request-id", () => ({ requestId: async () => "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));

import { logSenior, pairDecideStatus, runPairDecide, runPairDecideLogged } from "@/lib/senior-core";

const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
const HASH = "c".repeat(64);
const RID = "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6";
const input = (over = {}) => ({ ddinterA: "DDInter14", ddinterB: "DDInter1951", decision: "reviewed", note: "", expectedContentHash: HASH,
  expectedLastPairReviewId: null, requestId: RID, turnstileToken: "tok", ...over });
const OUTCOME = { ddinterA: "DDInter14", ddinterB: "DDInter1951", review: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: true, note: null },
  version: { contentHash: HASH, lastPairReviewId: 3 }, replayed: false };

beforeEach(() => {
  for (const f of [getSession, allowAccountAction, verifyTurnstile, postPairDecision, recordAudit, logRequest]) f.mockClear();
  getSession.mockResolvedValue(SENIOR);
  allowAccountAction.mockReturnValue(true);
  verifyTurnstile.mockResolvedValue(true);
  postPairDecision.mockResolvedValue({ ok: true, data: OUTCOME });
});

describe("the pair decision action (§5.17.2, §7.7, §9.2, §9.3)", () => {
  it("a senior's decision goes to the API with the session's own email and role, never values from the client", async () => {
    expect(await runPairDecide({ ...input(), reviewerEmail: "forged@x.org", reviewerRole: "pharmacist" })).toEqual({ ok: true, outcome: OUTCOME });
    expect(postPairDecision).toHaveBeenCalledWith("DDInter14", "DDInter1951", { decision: "reviewed", note: "", reviewerEmail: "senior@e2e.test",
      reviewerRole: "senior", expectedContentHash: HASH, expectedLastPairReviewId: null, requestId: RID });
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "203.0.113.9", "decision");
    expect(allowAccountAction).toHaveBeenCalledWith("decision", "senior@e2e.test");   // one shared budget with record decisions
  });
  it("no session, then any other role, are refused before the API", async () => {
    getSession.mockResolvedValueOnce(null);
    expect(await runPairDecide(input())).toEqual({ ok: false, code: "unauthenticated" });
    for (const role of ["pharmacist", "engineer", "user"]) {
      getSession.mockResolvedValueOnce({ ...SENIOR, role });
      expect(await runPairDecide(input())).toEqual({ ok: false, code: "forbidden" });
    }
    expect(postPairDecision).not.toHaveBeenCalled();
  });
  it.each([
    ["pair ids in the wrong order", { ddinterA: "DDInter1951", ddinterB: "DDInter14" }],
    ["a bad id", { ddinterA: "DDInter14x" }],
    ["an issue note under 5 code points", { decision: "issue", note: "😀😀😀😀" }],
    ["a note over 1000", { note: "x".repeat(1001) }],
    ["a bad hash", { expectedContentHash: "z".repeat(64) }],
    ["a bad last id", { expectedLastPairReviewId: 0 }],
    ["a bad requestId", { requestId: "nope" }],
    ["a bad decision", { decision: "ok" }],
  ])("invalid: %s", async (_name, over) => {
    expect(await runPairDecide(input(over))).toEqual({ ok: false, code: "invalid" });
    expect(postPairDecision).not.toHaveBeenCalled();
  });
  it("the shared decision budget, then the bot check", async () => {
    allowAccountAction.mockReturnValueOnce(false);
    expect(await runPairDecide(input())).toEqual({ ok: false, code: "rate_limited" });
    verifyTurnstile.mockResolvedValueOnce(false);
    expect(await runPairDecide(input())).toEqual({ ok: false, code: "captcha" });
  });
  it.each([
    [{ ok: false, status: 409, error: "x", field: "contentHash" }, "content_changed"],
    [{ ok: false, status: 409, error: "x", field: "lastPairReviewId" }, "other_senior"],
    [{ ok: false, status: 409, error: "x", field: "state" }, "already_reviewed"],
    [{ ok: false, status: 404, error: "x", field: "pair" }, "not_found"],
    [{ ok: false, status: 400, error: "x", field: "note" }, "invalid"],
    [{ ok: false, status: 0, error: "x", field: null }, "failed"],
  ])("API %j → %s", async (answer, code) => {
    postPairDecision.mockResolvedValueOnce(answer);
    expect(await runPairDecide(input({ decision: "issue", note: "text contradicts the severity" }))).toEqual({ ok: false, code });
  });
  it("one log line with the status, never a note or an email", async () => {
    await runPairDecideLogged(input({ decision: "issue", note: "secret note" }));
    expect(logRequest).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(logRequest.mock.calls[0][0]);
    expect(logRequest.mock.calls[0][0]).toMatchObject({ route: "action:pair-decide", method: "POST", status: 200 });
    expect(line).not.toContain("secret");
    expect(line).not.toContain("@");
    expect(pairDecideStatus({ ok: false, code: "content_changed" })).toBe(409);
    expect(pairDecideStatus({ ok: false, code: "forbidden" })).toBe(403);
  });
});

describe("senior_open (§5.15)", () => {
  it("one row per actor, page and 10 minutes, seniors only, with the substance or the queue filter as target", async () => {
    await logSenior("substance", "BDS-000003");
    await logSenior("substance", "BDS-000003");
    await logSenior("pair_queue", "todo");
    expect(recordAudit.mock.calls.map((c) => c[0])).toEqual([
      { event: "senior_open", outcome: "shown", actorEmail: "senior@e2e.test", actorRole: "senior", targetType: "substance", targetId: "BDS-000003" },
      { event: "senior_open", outcome: "shown", actorEmail: "senior@e2e.test", actorRole: "senior", targetType: "pair_queue", targetId: "todo" },
    ]);
    getSession.mockResolvedValue({ ...SENIOR, role: "pharmacist" });
    await logSenior("pair_queue", "all");
    await logSenior("pair_queue", "bogus");
    await logSenior("other", "x");
    expect(recordAudit).toHaveBeenCalledTimes(2);
  });
});
