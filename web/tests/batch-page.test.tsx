import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Batch, BatchReport } from "@/lib/api";

const batch: Batch = {
  batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T00:00:00Z", itemCount: 1,
  items: [{
    conceptId: "N-1", review: "pending", note: null, sourceJson: null, extractedAt: "2026-10-12T09:00:00.123456Z",
    lastDecisionId: 41,
    extracted: { conceptId: "N-1", darNumber: "D", tradeName: "Napa", company: "Beximco", dosageForm: "Tablet",
      genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [], parseStatus: "parsed", parseNote: null,
      clinicalDrug: null },
    stages: [
      { stage: "dgda", status: "ok", note: "loaded", evidence: { concept: "N-1" } },
      { stage: "substances", status: "warn", note: "approx RxNav match", evidence: { rxcui: "161", method: "rxnav-approx" } },
      { stage: "clinical", status: "fail", note: "error: ValueError: <bad>", evidence: {} },
    ],
  }],
};
const report: BatchReport = {
  counts: { dgda: { ok: 9, warn: 0, fail: 1 }, substances: { ok: 7, warn: 2, fail: 0 } },
  review: { pending: 8, ok: 1, issue: 1 },
  warnings: [{ conceptId: "N-1", stage: "substances", note: "approx RxNav match" }],
  fails: [{ conceptId: "N-7", stage: "dgda", note: "not found at source" }],
  runs: [{ runAt: "2026-10-12T09:00:00Z", stages: ["dgda", "substances"], counts: {}, conceptIds: [] }],
  deltaVsPrevious: { dgda: { ok: 2, warn: 0, fail: -2 }, substances: { ok: 0, warn: 0, fail: 0 } },
};
const getBatch = vi.fn();
const getBatchReport = vi.fn();
const getDecisions = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBatch: (id: string) => getBatch(id),
  getBatchReport: (id: string) => getBatchReport(id),
  getDecisions: (b: string, c: string) => getDecisions(b, c),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import BatchPage from "@/app/batches/[id]/page";

const GATE = "Only pharmacists and engineers can see batches.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHARMACIST = { email: "pharm@example.org", role: "pharmacist" };
const render = async (sp: Record<string, string> = {}, id = "0001-pilot") => renderToStaticMarkup(await BatchPage({
  params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));
const forms = (html: string) => html.match(/<form[\s\S]*?<\/form>/g) ?? [];
const fieldValue = (form: string, name: string) =>
  form.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`))?.[1]
  ?? form.match(new RegExp(`<input[^>]*value="([^"]*)"[^>]*name="${name}"`))?.[1];

beforeEach(() => {
  getBatch.mockReset(); getBatch.mockResolvedValue(batch);
  getBatchReport.mockReset(); getBatchReport.mockResolvedValue(report);
  getDecisions.mockReset();
  getDecisions.mockResolvedValue([
    { decision: "issue", note: "Strength wrong", role: "engineer", decidedAt: "2026-10-12T10:05:00Z" },
    { decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T09:30:00Z" },
  ]);
  getSession.mockReset(); getSession.mockResolvedValue(PHARMACIST);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("batch page gate (spec §12.1, phase 0)", () => {
  it.each([null, { email: "someone@gmail.com", role: "user" }])("shows only the gate line to %o, with no API call", async (s) => {
    getSession.mockResolvedValue(s);
    const html = await render();
    expect(html).toContain(GATE);
    for (const absent of ["Napa", "Paracetamol", "Batch report", "Mark OK", "someone@gmail.com"]) expect(html).not.toContain(absent);
    expect(getBatch).not.toHaveBeenCalled();
    expect(getBatchReport).not.toHaveBeenCalled();
    expect(getDecisions).not.toHaveBeenCalled();
  });

  it("an anonymous visitor gets the gate even for an unknown batch, with no API call", async () => {
    getSession.mockResolvedValue(null);
    getBatch.mockResolvedValue(null);
    expect(await render({}, "no-such-batch")).toContain(GATE);
    expect(getBatch).not.toHaveBeenCalled();
  });

  it("a reviewer gets a 404 for an unknown batch", async () => {
    getBatch.mockResolvedValue(null);
    // R17: the notFound digest, not a bare toThrow() (which would also pass on a crash or a missing-token error).
    await expect(render({}, "no-such-batch")).rejects.toSatisfy(
      (e: { digest?: string }) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(e.digest)));
  });
});

describe("batch page (reviewers)", () => {
  it("shows a stage table in pipeline order with status pills, notes and collapsible evidence", async () => {
    const html = await render();
    const order = ["dgda", "substances", "clinical", "ddinter"].map((s) => html.search(new RegExp(`<td[^>]*>${s}</td>`)));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/<span class="pill pill-ok"[^>]*>ok<\/span>/);
    expect(html).toMatch(/<span class="pill pill-warn"[^>]*>warn<\/span>/);
    expect(html).toMatch(/<span class="pill pill-fail"[^>]*>fail<\/span>/);
    expect(html).toMatch(/<span class="pill pill-none"[^>]*>not run<\/span>/);   // ddinter has no row
    expect(html).toContain("approx RxNav match");
    expect(html).toContain("error: ValueError: &lt;bad&gt;");                     // escaped, not raw HTML
    expect(html).toContain("<details><summary>Evidence</summary>");
    expect(html).toContain(JSON.stringify({ rxcui: "161", method: "rxnav-approx" }, null, 2).replace(/"/g, "&quot;"));
  });

  it("replaces the review-sheet text", async () => {
    const html = await render();
    expect(html).not.toContain("review sheet");
    expect(html).toContain("A record is public once a pharmacist marks it OK.");
  });

  it("shows the approval status and the report: stage counts, review counts, warnings, fails and the delta", async () => {
    const html = await render();
    expect(getBatchReport).toHaveBeenCalledWith("0001-pilot");
    expect(html).toContain("Approval: in review");
    expect(html).toMatch(/<tr><td>dgda<\/td><td>9<\/td><td>0<\/td><td>1<\/td><td>\+2 \/ 0 \/ −2<\/td><\/tr>/);
    expect(html).toMatch(/<tr><td>substances<\/td><td>7<\/td><td>2<\/td><td>0<\/td><td>0 \/ 0 \/ 0<\/td><\/tr>/);
    expect(html).toContain("Review: 1 OK · 1 issue · 8 pending");
    expect(html).toMatch(/<h3>Warnings \(1\)<\/h3><ul><li><a href="#N-1">N-1<\/a> · substances: approx RxNav match<\/li><\/ul>/);
    expect(html).toMatch(/<h3>Fails \(1\)<\/h3><ul><li><a href="#N-7">N-7<\/a> · dgda: not found at source<\/li><\/ul>/);
  });

  it("says approved when the batch is approved", async () => {
    getBatch.mockResolvedValue({ ...batch, status: "approved" });
    expect(await render()).toContain("Approval: approved");
  });

  it("copes without a report or a previous run", async () => {
    getBatchReport.mockRejectedValue(new Error("API error 500"));
    expect(await render()).toContain("The batch report is temporarily unavailable.");
    getBatchReport.mockResolvedValue({ ...report, deltaVsPrevious: {} });
    expect(await render()).toContain("No previous full run to compare with.");
  });

  it("copes with a null delta: no previous run, and a dash in the delta cell", async () => {
    getBatchReport.mockResolvedValue({ ...report, deltaVsPrevious: null });
    const html = await render();
    expect(html).toContain("No previous full run to compare with.");
    expect(html).toMatch(/<tr><td>dgda<\/td><td>9<\/td><td>0<\/td><td>1<\/td><td>—<\/td><\/tr>/);
  });

  it("shows the decision history with decision, role and time, never an email", async () => {
    const html = await render();
    expect(getDecisions).toHaveBeenCalledWith("0001-pilot", "N-1");
    expect(html).toContain("Issue · Engineer · 2026-10-12 10:05 UTC: Strength wrong");
    expect(html).toContain("OK · Pharmacist · 2026-10-12 09:30 UTC");
    expect(html).not.toContain("@");
  });

  it("review forms echo extractedAt, lastDecisionId and a server-rendered requestId per form", async () => {
    const fs = forms(await render());
    expect(fs).toHaveLength(2);
    const [okForm, issueForm] = fs;
    expect(okForm).toContain(">Mark OK</button>");
    expect(fieldValue(okForm, "decision")).toBe("ok");
    expect(issueForm).toContain(">Report issue</button>");
    expect(fieldValue(issueForm, "decision")).toBe("issue");
    expect(issueForm).toMatch(/<textarea[^>]*name="note"[^>]*required=""/);
    expect(issueForm).toMatch(/<textarea[^>]*minLength="5"[^>]*maxLength="1000"|<textarea[^>]*maxLength="1000"[^>]*minLength="5"/);
    for (const f of fs) {
      expect(fieldValue(f, "batchId")).toBe("0001-pilot");
      expect(fieldValue(f, "conceptId")).toBe("N-1");
      expect(fieldValue(f, "extractedAt")).toBe("2026-10-12T09:00:00.123456Z");
      expect(fieldValue(f, "expectedLastDecisionId")).toBe("41");
      expect(fieldValue(f, "requestId")).toMatch(UUID);
      expect(f).toContain('class="cf-turnstile"');
      expect(f).not.toContain("reviewerEmail");
    }
    expect(fieldValue(okForm, "requestId")).not.toBe(fieldValue(issueForm, "requestId"));
  });

  it("echoes a null extractedAt and a null lastDecisionId as empty fields", async () => {
    getBatch.mockResolvedValue({ ...batch, items: [{ ...batch.items[0], extractedAt: null, lastDecisionId: null }] });
    const fs = forms(await render());
    expect(fs).toHaveLength(2);
    for (const f of fs) {
      expect(fieldValue(f, "extractedAt")).toBe("");
      expect(fieldValue(f, "expectedLastDecisionId")).toBe("");
    }
  });

  it("shows the outcome of a review next to the item, for known codes only", async () => {
    const cases: [string, string][] = [
      ["saved", "Your decision was recorded."],
      ["stale", "re-run after you opened the page"],
      ["decided", "Another reviewer decided on this record after you opened the page"],
      ["checks", "A check failed on this record. It returns to review after the fix and re-run."],
      ["issue_open", "An issue is open on this record. It returns to review after the fix and re-run."],
      ["approved", "This record is already approved by a pharmacist."],
      ["checked", "Your check is already recorded for this record."],
      ["removed", "This record was removed from the batch file."],
    ];
    for (const [code, text] of cases) expect(await render({ review: code, item: "N-1" })).toContain(text);
    const weird = await render({ review: "<script>x</script>", item: "N-1" });
    expect(weird).not.toContain("<script>x");
    expect(weird).not.toContain('role="alert"');
  });
});
