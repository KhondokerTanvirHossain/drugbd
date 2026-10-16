import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const allowAccountAction = vi.fn((_k: string, _e: string) => true);
const verifyTurnstile = vi.fn(async (_t: unknown, _ip: unknown, _a: string) => true);
const postDeskDecision = vi.fn();
const getReviewDiff = vi.fn();
const recordAudit = vi.fn(async (_e: unknown) => true);
const headerMap = new Map<string, string>([["x-forwarded-for", "203.0.113.9"]]);
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/limits", () => ({ allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) }));
vi.mock("@/lib/turnstile", () => ({ TURNSTILE_RESPONSE_FIELD: "cf-turnstile-response",
  verifyTurnstile: (t: unknown, ip: unknown, a: string) => verifyTurnstile(t, ip, a) }));
vi.mock("@/lib/api", () => ({ postDeskDecision: (...a: unknown[]) => postDeskDecision(...a), getReviewDiff: (...a: unknown[]) => getReviewDiff(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));
const WEB_RID = "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f";   // the middleware's x-request-id, not the desk's idempotency id
vi.mock("@/lib/request-id", () => ({ requestId: async () => WEB_RID }));
vi.mock("next/headers", () => ({ headers: async () => new Headers([...headerMap]) }));
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import { conflictCode, decideStatus, runDecide } from "@/lib/desk-core";
import { decide, decideFormAction, loadDiff, logEvidence, logRecordOpen } from "@/lib/desk-actions";
import type { DeskOutcome } from "@/lib/review-types";

const PHARMACIST = { email: "pharm@e2e.test", name: "P", role: "pharmacist" as const };
const RID = "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22";
const input = (over = {}) => ({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", decision: "ok", note: "",
  extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: 41, requestId: RID, turnstileToken: "tok", ...over });
const OUTCOME: DeskOutcome = { review: "ok", displayStatus: "approved", batchStatus: "in_review",
  version: { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: 42 }, replayed: false };

beforeEach(() => {
  for (const f of [getSession, allowAccountAction, verifyTurnstile, postDeskDecision, getReviewDiff, recordAudit, redirect]) f.mockClear();
  recordAudit.mockResolvedValue(true);
  getSession.mockResolvedValue(PHARMACIST);
  allowAccountAction.mockReturnValue(true);
  verifyTurnstile.mockResolvedValue(true);
  postDeskDecision.mockResolvedValue({ ok: true, data: OUTCOME });
});

describe("decide (§5.8, §7.2, §9.3)", () => {
  it("saves with the session's own email and role, the viewed version and the requestId", async () => {
    expect(await runDecide({ ...input(), reviewerEmail: "forged@x.org", reviewerRole: "pharmacist" })).toEqual({ ok: true, outcome: OUTCOME });
    expect(postDeskDecision).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", { decision: "ok", note: "",
      reviewerEmail: "pharm@e2e.test", reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00.123456Z",
      expectedLastDecisionId: 41, requestId: RID });
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "203.0.113.9", "decision");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("no session is unauthenticated, audited without an email; a reader is forbidden", async () => {
    getSession.mockResolvedValue(null);
    expect(await runDecide(input())).toEqual({ ok: false, code: "unauthenticated" });
    expect(recordAudit).toHaveBeenCalledWith({ event: "decision_denied", outcome: "unauthenticated", actorEmail: null, actorRole: null,
      targetType: "batch_item", targetId: "0001-pilot/186-0030-006--napa" });
    getSession.mockResolvedValue({ email: "reader@e2e.test", name: "", role: "user" });
    expect(await runDecide(input())).toEqual({ ok: false, code: "forbidden" });
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "forbidden", actorEmail: "reader@e2e.test", actorRole: "user" }));
    expect(postDeskDecision).not.toHaveBeenCalled();
  });

  it("over 60 a minute is rate_limited, audited, with no bot check and no API call", async () => {
    allowAccountAction.mockReturnValue(false);
    expect(await runDecide(input())).toEqual({ ok: false, code: "rate_limited" });
    expect(allowAccountAction).toHaveBeenCalledWith("decision", "pharm@e2e.test");
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ event: "decision_denied", outcome: "rate_limited" }));
  });

  it("a failed bot check is captcha, audited", async () => {
    verifyTurnstile.mockResolvedValue(false);
    expect(await runDecide(input())).toEqual({ ok: false, code: "captcha" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "captcha", actorRole: "pharmacist" }));
    expect(postDeskDecision).not.toHaveBeenCalled();
  });

  it("decision_denied has no target when the ids are unusable, and an audit outage never changes the answer (as P1A's submitReview)", async () => {
    getSession.mockResolvedValue(null);
    await runDecide(input({ batchId: "" }));
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "decision_denied", outcome: "unauthenticated", actorEmail: null, actorRole: null,
      targetType: null, targetId: null });
    getSession.mockResolvedValue(PHARMACIST);
    allowAccountAction.mockReturnValue(false);
    recordAudit.mockRejectedValue(new Error("audit API down"));
    expect(await runDecide(input())).toEqual({ ok: false, code: "rate_limited" });
  });

  it("decision_denied has no target when batchId/conceptId would pass the audit's 200-character targetId limit (as P1A's denyDecision)", async () => {
    getSession.mockResolvedValue(null);
    await runDecide(input({ batchId: "b".repeat(150), conceptId: "c".repeat(150) }));
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "decision_denied", outcome: "unauthenticated", actorEmail: null, actorRole: null,
      targetType: null, targetId: null });
    await runDecide(input({ batchId: "b".repeat(100), conceptId: "c".repeat(99) }));
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ targetType: "batch_item",
      targetId: `${"b".repeat(100)}/${"c".repeat(99)}` }));
  });

  it.each([
    [{ requestId: "nope" }], [{ decision: "maybe" }], [{ batchId: "" }], [{ conceptId: "x".repeat(201) }],
    [{ extractedAt: 12 }], [{ expectedLastDecisionId: -1 }], [{ expectedLastDecisionId: 1.5 }], [{ note: "n".repeat(1001) }],
    [{ decision: "issue", note: "abcd" }], [{ decision: "issue", note: "😀😀😀😀" }], [{ turnstileToken: 5 }],
  ])("refuses malformed input %j without calling anything", async (over) => {
    expect(await runDecide(input(over))).toEqual({ ok: false, code: "invalid" });
    expect(postDeskDecision).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("an issue of 5 characters is accepted", async () => {
    await runDecide(input({ decision: "issue", note: "  😀😀😀😀😀  " }));
    expect(postDeskDecision.mock.calls[0][2].note).toBe("😀😀😀😀😀");
  });

  it("maps every 409 field, a 400, a 404 and a failure", async () => {
    for (const [field, message, code] of [
      ["extractedAt", "x", "stale_rerun"], ["lastDecisionId", "x", "stale_decision"], ["stages", "x", "stage_failed"],
      ["conceptId", "x", "removed"],
      ["review", "An issue is open on this record. It returns to review after the fix and re-run.", "issue_open"],
      ["review", "This record is already approved by a pharmacist", "already_approved"],
      ["review", "Your check is already recorded for this record", "already_checked"],
    ] as const) {
      expect(conflictCode(field, message)).toBe(code);
      postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: message, field });
      expect(await runDecide(input())).toEqual({ ok: false, code });
    }
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 400, error: "x", field: "note" });
    expect(await runDecide(input())).toEqual({ ok: false, code: "invalid" });
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 404, error: "x", field: "conceptId" });
    expect(await runDecide(input())).toEqual({ ok: false, code: "removed" });
    for (const status of [0, 500, 502]) {
      postDeskDecision.mockResolvedValueOnce({ ok: false, status, error: "x", field: null });
      expect(await runDecide(input())).toEqual({ ok: false, code: "failed" });
    }
  });
});

describe("decideFormAction, the native POST without the island (§5.8.6)", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ batchId: "0001-pilot", conceptId: "napa", decision: "ok",
      extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: "", requestId: RID, "cf-turnstile-response": "tok", ...fields }))
      fd.set(k, v);
    return fd;
  };

  it("the first POST (Enter or the button) never saves: it redirects to the confirm page with the version it was sent", async () => {
    await expect(decideFormAction(form({}))).rejects.toThrow(
      "REDIRECT /review/0001-pilot/napa?confirm=napa&x=2026-10-12T09%3A00%3A00.123456Z&d=&r=" + RID);
    expect(postDeskDecision).not.toHaveBeenCalled();
  });

  it("Confirm posts commit=confirmed with the URL's version and saves once", async () => {
    await expect(decideFormAction(form({ commit: "confirmed", expectedLastDecisionId: "41" }))).rejects.toThrow("REDIRECT /review/0001-pilot/napa");
    expect(postDeskDecision.mock.calls[0][2]).toMatchObject({ extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: 41, requestId: RID });
  });

  it("a stale or refused confirm goes back to the confirm page with the code; an expired session goes to sign-in", async () => {
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "x", field: "extractedAt" });
    await expect(decideFormAction(form({ commit: "confirmed" }))).rejects.toThrow("&e=stale_rerun");
    verifyTurnstile.mockResolvedValueOnce(false);
    await expect(decideFormAction(form({ commit: "confirmed" }))).rejects.toThrow("&e=captcha");
    getSession.mockResolvedValueOnce(null);
    await expect(decideFormAction(form({ commit: "confirmed" }))).rejects.toThrow(
      "REDIRECT /signin?returnTo=%2Freview%2F0001-pilot%2Fnapa");
  });

  it("an unusable batch or record id goes to /review", async () => {
    await expect(decideFormAction(form({ batchId: "" }))).rejects.toThrow("REDIRECT /review");
  });
});

describe("the action log line (§5.15, §9.7)", () => {
  const lines = (log: { mock: { calls: unknown[][] } }) => log.mock.calls.map((c) => JSON.parse(String(c[0])));

  it("maps every result to the status it is logged with", () => {
    expect(decideStatus({ ok: true, outcome: OUTCOME })).toBe(200);
    for (const [code, status] of [["invalid", 400], ["unauthenticated", 401], ["forbidden", 403], ["captcha", 403], ["removed", 404],
      ["rate_limited", 429], ["failed", 502], ["stale_rerun", 409], ["stale_decision", 409], ["issue_open", 409], ["already_approved", 409],
      ["already_checked", 409], ["stage_failed", 409]] as const) expect(decideStatus({ ok: false, code })).toBe(status);
  });

  it("decide logs one action:decide line with the status and the web request id, never the note or an email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await decide(input({ decision: "issue", note: "Patient Rahim has a rash" }) as never);
    allowAccountAction.mockReturnValue(false);
    await decide(input() as never);
    expect(lines(log)).toEqual([
      { msg: "request", route: "action:decide", method: "POST", status: 200, ms: expect.any(Number), requestId: WEB_RID },
      { msg: "request", route: "action:decide", method: "POST", status: 429, ms: expect.any(Number), requestId: WEB_RID }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Rahim|pharm@/);
    log.mockRestore();
  });

  it("decideFormAction logs one action:decide-form line per POST: 303 for the confirm step, then the save's status", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fd = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ batchId: "0001-pilot", conceptId: "napa", decision: "ok", extractedAt: "",
        expectedLastDecisionId: "", requestId: RID, "cf-turnstile-response": "tok", ...fields })) f.set(k, v);
      return f;
    };
    await decideFormAction(fd({})).catch(() => {});
    await decideFormAction(fd({ commit: "confirmed" })).catch(() => {});
    await decideFormAction(fd({ batchId: "" })).catch(() => {});
    expect(lines(log).map((l) => [l.route, l.status, l.requestId])).toEqual([
      ["action:decide-form", 303, WEB_RID], ["action:decide-form", 200, WEB_RID], ["action:decide-form", 400, WEB_RID]]);
    log.mockRestore();
  });
});

describe("audit of reads (§5.15)", () => {
  it("review_open and evidence_open at most once per actor, record and 10 minutes, reviewers only", async () => {
    await logRecordOpen("0001-pilot", "audit-a");
    await logRecordOpen("0001-pilot", "audit-a");
    await logEvidence("0001-pilot", "audit-a");
    expect(recordAudit.mock.calls.map((c) => (c[0] as { event: string }).event)).toEqual(["review_open", "evidence_open"]);
    expect(recordAudit).toHaveBeenCalledWith({ event: "review_open", outcome: "shown", actorEmail: "pharm@e2e.test",
      actorRole: "pharmacist", targetType: "batch_item", targetId: "0001-pilot/audit-a" });
    getSession.mockResolvedValue({ email: "reader@e2e.test", name: "", role: "user" });
    await logRecordOpen("0001-pilot", "audit-b");
    expect(recordAudit).toHaveBeenCalledTimes(2);
  });

  it("review_open keeps its row but drops the target when the ids together reach 200 characters", async () => {
    await logRecordOpen("b".repeat(150), "c".repeat(150));
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "review_open", outcome: "shown", actorEmail: "pharm@e2e.test",
      actorRole: "pharmacist", targetType: null, targetId: null });
  });

  it("the diff is for reviewers only", async () => {
    getReviewDiff.mockResolvedValue({ from: "a", to: "b", reason: "rerun", rows: [{ field: "Trade name", before: "A", now: "B" }] });
    expect(await loadDiff("0001-pilot", "napa", "2026-10-12T09:00:00Z")).toEqual([{ field: "Trade name", before: "A", now: "B" }]);
    getSession.mockResolvedValue({ email: "reader@e2e.test", name: "", role: "user" });
    expect(await loadDiff("0001-pilot", "napa", "2026-10-12T09:00:00Z")).toBeNull();
  });
});

describe("a senior session (§5.13)", () => {
  it("decides like a pharmacist, with reviewerRole senior sent unchanged", async () => {
    getSession.mockResolvedValue({ email: "senior@e2e.test", name: "S", role: "senior" });
    postDeskDecision.mockResolvedValue({ ok: true, data: OUTCOME });
    const r = await runDecide(input());
    expect(r).toEqual({ ok: true, outcome: OUTCOME });
    expect(postDeskDecision.mock.calls[0][2]).toMatchObject({ reviewerRole: "senior", reviewerEmail: "senior@e2e.test" });
  });
});

describe("dismiss (§5.10a, §7.2 P1C)", () => {
  const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
  const dismiss = (over = {}) => input({ decision: "dismiss", note: "the register says 500 mg", ...over });

  it("a senior's dismissal goes to the API with decision dismiss, the note and the viewed version", async () => {
    getSession.mockResolvedValue(SENIOR);
    expect(await runDecide(dismiss())).toEqual({ ok: true, outcome: OUTCOME });
    expect(postDeskDecision).toHaveBeenCalledWith("0001-pilot", "186-0030-006--napa", { decision: "dismiss",
      note: "the register says 500 mg", reviewerEmail: "senior@e2e.test", reviewerRole: "senior",
      extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: 41, requestId: RID });
  });

  it("any other role is forbidden in the web, with a decision_denied row and no API call", async () => {
    for (const role of ["pharmacist", "engineer"] as const) {
      getSession.mockResolvedValue({ ...PHARMACIST, role });
      expect(await runDecide(dismiss())).toEqual({ ok: false, code: "forbidden" });
    }
    expect(postDeskDecision).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ event: "decision_denied", outcome: "forbidden", actorRole: "engineer",
      targetType: "batch_item", targetId: "0001-pilot/186-0030-006--napa" }));
  });

  it("the note is 5 to 1000 code points after trimming", async () => {
    getSession.mockResolvedValue(SENIOR);
    expect(await runDecide(dismiss({ note: "  abcd  " }))).toEqual({ ok: false, code: "invalid" });
    expect(await runDecide(dismiss({ note: "😀😀😀😀" }))).toEqual({ ok: false, code: "invalid" });
    expect(await runDecide(dismiss({ note: "x".repeat(1001) }))).toEqual({ ok: false, code: "invalid" });
    expect(await runDecide(dismiss({ note: "অবৈধ রিপোর্ট" }))).toEqual({ ok: true, outcome: OUTCOME });
  });

  it("a 409 on review is no_issue for a dismissal; the other fields keep their codes", async () => {
    getSession.mockResolvedValue(SENIOR);
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "No issue is open on this record", field: "review" });
    expect(await runDecide(dismiss())).toEqual({ ok: false, code: "no_issue" });
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "Another reviewer decided", field: "lastDecisionId" });
    expect(await runDecide(dismiss())).toEqual({ ok: false, code: "stale_decision" });
    postDeskDecision.mockResolvedValueOnce({ ok: false, status: 409, error: "This record was removed from the batch file", field: "conceptId" });
    expect(await runDecide(dismiss())).toEqual({ ok: false, code: "removed" });
    expect(decideStatus({ ok: false, code: "no_issue" })).toBe(409);
  });
});
