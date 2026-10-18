import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * §5.13, §7.10.1 (D66): a qa account can never make any decision. Every review server action keeps isReviewer (or
 * actsAsPharmacist, or the senior test), so a qa session is forbidden before any API call and writes its decision_denied row
 * with role qa, as a reader's does. Flags and partner requests stay open to a qa session, as a reader.
 */

const getSession = vi.fn();
const recordAudit = vi.fn(async (_e: unknown) => true);
const verifyTurnstile = vi.fn(async (_t: unknown, _ip: unknown, _a: string) => true);
const allowAccountAction = vi.fn((_k: string, _e: string) => true);
const revalidatePath = vi.fn();
/** Every lib/api export is a spy that records its name: a qa session must reach none of the review ones. */
const apiCalls: string[] = [];
const apiAnswer = vi.fn(async (_name: string) => ({ ok: true, data: { id: 1 } }));

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: (t: unknown, ip: unknown, a: string) => verifyTurnstile(t, ip, a),
}));
vi.mock("@/lib/limits", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/limits")>();
  return { ...real, allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) };
});
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.entries(real).map(([name, v]) => [name, typeof v !== "function" ? v : async () => {
    apiCalls.push(name);
    return apiAnswer(name);
  }]));
});
vi.mock("@/lib/request-id", () => ({ requestId: async () => "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" }));
vi.mock("@/lib/request-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-log")>()), logRequest: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
const redirect = vi.fn((u: string) => { throw new Error(`REDIRECT ${u}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import { GET as versionsGET } from "@/app/review/[batchId]/versions/route";
import { submitFlag, submitPartnerRequest, submitResolve } from "@/lib/actions-core";
import { diffRows, logOpen, logOpenOnRender, runDecide } from "@/lib/desk-core";
import { decide, decideFormAction, loadDiff, logEvidence, logRecordOpen } from "@/lib/desk-actions";
import { logSenior, runPairDecide } from "@/lib/senior-core";
import { pairDecide, logSeniorOpen } from "@/lib/senior-actions";
import { resolveFlagAction } from "@/lib/review-actions";
import { PARTNER_KINDS, PARTNER_VOLUMES } from "@/lib/actions-core";

const QA = { email: "qa.member@e2e.test", name: "Q", role: "qa" as const };
const RID = "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22";
const deskInput = (over = {}) => ({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", decision: "ok", note: "",
  extractedAt: "2026-10-12T09:00:00.123456Z", expectedLastDecisionId: 41, requestId: RID, turnstileToken: "tok", ...over });
const pairInput = (over = {}) => ({ ddinterA: "DDInter14", ddinterB: "DDInter1951", decision: "reviewed", note: "",
  expectedContentHash: "7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f", expectedLastPairReviewId: null,
  requestId: RID, turnstileToken: "tok", ...over });
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  apiCalls.length = 0;
  for (const f of [getSession, recordAudit, verifyTurnstile, allowAccountAction, revalidatePath, redirect, apiAnswer]) f.mockClear();
  getSession.mockResolvedValue(QA);
  recordAudit.mockResolvedValue(true);
  verifyTurnstile.mockResolvedValue(true);
  allowAccountAction.mockReturnValue(true);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const denied = (target: string | null) => ({ event: "decision_denied", outcome: "forbidden", actorEmail: QA.email, actorRole: "qa",
  targetType: target ? "batch_item" : null, targetId: target });

describe("a qa session can never decide (§5.13, §7.10.1)", () => {
  it.each([["approve", { decision: "ok" }], ["report", { decision: "issue", note: "strength looks wrong" }],
    ["dismiss", { decision: "dismiss", note: "the report misread the register" }]])(
    "%s (runDecide and decide) is forbidden with a decision_denied row and no API call", async (_n, over) => {
      expect(await runDecide(deskInput(over))).toEqual({ ok: false, code: "forbidden" });
      expect(await decide(deskInput(over) as never)).toEqual({ ok: false, code: "forbidden" });
      expect(recordAudit).toHaveBeenCalledTimes(2);
      expect(recordAudit).toHaveBeenLastCalledWith(denied("0001-pilot/186-0030-006--napa"));
      expect(apiCalls).toEqual([]);
      expect(verifyTurnstile).not.toHaveBeenCalled();
      expect(allowAccountAction).not.toHaveBeenCalled();
    });

  it("the no-JavaScript confirm (decideFormAction) is forbidden and sends nothing", async () => {
    const fd = form({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", commit: "confirmed", extractedAt: "2026-10-12T09:00:00Z",
      expectedLastDecisionId: "41", requestId: RID, "cf-turnstile-response": "tok" });
    await expect(decideFormAction(fd)).rejects.toThrow(/REDIRECT .*e=forbidden/);
    expect(recordAudit).toHaveBeenCalledWith(denied("0001-pilot/186-0030-006--napa"));
    expect(apiCalls).toEqual([]);
  });

  it("a pair decision (runPairDecide and pairDecide) is forbidden with a decision_denied row and no API call", async () => {
    for (const over of [{}, { decision: "issue", note: "the text contradicts the severity" }]) {
      expect(await runPairDecide(pairInput(over))).toEqual({ ok: false, code: "forbidden" });
      expect(await pairDecide(pairInput(over) as never)).toEqual({ ok: false, code: "forbidden" });
    }
    expect(recordAudit).toHaveBeenCalledTimes(4);
    expect(recordAudit).toHaveBeenLastCalledWith(denied(null));
    expect(apiCalls).toEqual([]);
  });

  it("resolving a flag is forbidden before any bot check or API call", async () => {
    expect(await submitResolve(form({ flagId: "7", "cf-turnstile-response": "tok" }))).toEqual({ status: 403, code: "forbidden" });
    await expect(resolveFlagAction(form({ flagId: "7", kind: "reports" }))).rejects.toThrow("REDIRECT /review/flags?resolve=forbidden&kind=reports");
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(apiCalls).toEqual([]);
  });

  it("loadDiff reads nothing, and the open audits write nothing, for a qa session", async () => {
    expect(await diffRows("0001-pilot", "186-0030-006--napa", "2026-10-12T09:00:00Z")).toBeNull();
    expect(await loadDiff("0001-pilot", "186-0030-006--napa", "2026-10-12T09:00:00Z")).toBeNull();
    await logOpen("review_open", "0001-pilot", "186-0030-006--napa");
    await logRecordOpen("0001-pilot", "186-0030-006--napa");
    await logEvidence("0001-pilot", "186-0030-006--napa");
    await logOpenOnRender("0001-pilot", "186-0030-006--napa", new Headers());
    await logSenior("pair_queue", "todo");
    await logSeniorOpen("substance", "BDS-000001");
    expect(recordAudit).not.toHaveBeenCalled();
    expect(apiCalls).toEqual([]);
  });

  it("GET /review/[batchId]/versions is 403 FORBIDDEN for qa, with no API call", async () => {
    const res = await versionsGET(new Request("http://localhost/review/0001-pilot/versions",
      { headers: { "x-request-id": "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f" } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ errors: [{ code: "FORBIDDEN" }] });
    expect(apiCalls).toEqual([]);
  });
});

describe("a qa session is a reader for flags and partner requests (§2.2)", () => {
  it("reports a problem with its own email", async () => {
    expect(await submitFlag(form({ targetType: "product", targetId: "P-1", message: "Wrong company name", "cf-turnstile-response": "tok" })))
      .toEqual({ status: 200, code: "sent" });
    expect(apiCalls).toEqual(["createFlag"]);
  });

  it("sends a partner access request", async () => {
    const fd = form({ organisation: "Clinic", kind: PARTNER_KINDS[0], use: "We want to check interactions in our EMR.", volume: PARTNER_VOLUMES[0],
      "cf-turnstile-response": "tok" });
    expect(await submitPartnerRequest(fd)).toEqual({ status: 200, code: "sent" });
    expect(apiCalls).toEqual(["requestPartnerAccess"]);
  });
});
