import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Batch, BatchReport } from "@/lib/api";

const batch: Batch = {
  batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T00:00:00Z", itemCount: 1,
  items: [{
    conceptId: "N-1", review: "pending", note: null, sourceJson: null, extractedAt: "2026-10-12T09:00:00.123456Z",
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

const PHARMACIST = { email: "pharm@example.org", role: "pharmacist" };
const render = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await BatchPage({
  params: Promise.resolve({ id: "0001-pilot" }), searchParams: Promise.resolve(sp) }));
const forms = (html: string) => html.match(/<form[\s\S]*?<\/form>/g) ?? [];

beforeEach(() => {
  getBatch.mockReset(); getBatch.mockResolvedValue(batch);
  getBatchReport.mockReset(); getBatchReport.mockResolvedValue(report);
  getDecisions.mockReset();
  getDecisions.mockResolvedValue([
    { decision: "issue", note: "Strength wrong", role: "engineer", decidedAt: "2026-10-12T10:05:00Z" },
    { decision: "ok", note: "", role: "pharmacist", decidedAt: "2026-10-12T09:30:00Z" },
  ]);
  getSession.mockReset(); getSession.mockResolvedValue(null);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("batch page", () => {
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

  it("says approved when the batch is approved, and copes without a report or a previous run", async () => {
    getBatch.mockResolvedValue({ ...batch, status: "approved" });
    getBatchReport.mockRejectedValue(new Error("API error 500"));
    let html = await render();
    expect(html).toContain("Approval: approved");
    expect(html).toContain("The batch report is temporarily unavailable.");
    getBatchReport.mockResolvedValue({ ...report, deltaVsPrevious: {} });
    html = await render();
    expect(html).toContain("No previous full run to compare with.");
  });

  it("shows the decision history with decision, role and time, never an email", async () => {
    const html = await render();
    expect(getDecisions).toHaveBeenCalledWith("0001-pilot", "N-1");
    expect(html).toContain("Issue · Engineer · 2026-10-12 10:05 UTC: Strength wrong");
    expect(html).toContain("OK · Pharmacist · 2026-10-12 09:30 UTC");
    expect(html).not.toContain("@");
  });

  it("echoes a null extractedAt as an empty field (the action sends null), and copes with a null delta", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    getBatch.mockResolvedValue({ ...batch, items: [{ ...batch.items[0], extractedAt: null }] });
    getBatchReport.mockResolvedValue({ ...report, deltaVsPrevious: null });
    const html = await render();
    for (const f of forms(html)) expect(f).toContain('name="extractedAt" value=""');
    expect(html).toContain("No previous full run to compare with.");
    expect(html).toMatch(/<tr><td>dgda<\/td><td>9<\/td><td>0<\/td><td>1<\/td><td>\u2014<\/td><\/tr>/);
  });

  it("anonymous visitors and role user see no review forms", async () => {
    expect(forms(await render())).toHaveLength(0);
    getSession.mockResolvedValue({ email: "someone@gmail.com", role: "user" });
    const html = await render();
    expect(forms(html)).toHaveLength(0);
    expect(html).not.toContain("Mark OK");
    expect(html).not.toContain("someone@gmail.com");
  });

  it("reviewers get Mark OK and Report issue forms with Turnstile, the item and its extractedAt", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    const html = await render();
    const fs = forms(html);
    expect(fs).toHaveLength(2);
    const [okForm, issueForm] = fs;
    expect(okForm).toContain(">Mark OK</button>");
    expect(okForm).toContain('name="decision" value="ok"');
    expect(issueForm).toContain(">Report issue</button>");
    expect(issueForm).toContain('name="decision" value="issue"');
    expect(issueForm).toMatch(/<textarea[^>]*name="note"[^>]*required=""/);
    expect(issueForm).toMatch(/<textarea[^>]*minLength="5"[^>]*maxLength="1000"|<textarea[^>]*maxLength="1000"[^>]*minLength="5"/);
    for (const f of fs) {
      expect(f).toContain('name="batchId" value="0001-pilot"');
      expect(f).toContain('name="conceptId" value="N-1"');
      expect(f).toContain('name="extractedAt" value="2026-10-12T09:00:00.123456Z"');
      expect(f).toContain('class="cf-turnstile"');
      expect(f).not.toContain("reviewerEmail");
    }
    expect(html).not.toContain("pharm@example.org");
  });

  it("shows the outcome of a review next to the item, for known codes only", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    expect(await render({ review: "saved", item: "N-1" })).toContain("Your decision was recorded.");
    expect(await render({ review: "stale", item: "N-1" })).toContain("re-run after you opened the page");
    const weird = await render({ review: "<script>x</script>", item: "N-1" });
    expect(weird).not.toContain("<script>x");
    expect(weird).not.toContain('role="alert"');
  });
});
