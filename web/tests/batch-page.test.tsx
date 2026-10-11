import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Batch } from "@/lib/api";

const batch: Batch = {
  batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T00:00:00Z", itemCount: 1,
  items: [{
    conceptId: "N-1", review: "pending", note: null, sourceJson: null,
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
vi.mock("@/lib/api", () => ({ getBatch: vi.fn(async () => batch) }));
import BatchPage from "@/app/batches/[id]/page";

describe("batch page", () => {
  it("shows a stage table in pipeline order with status pills, notes and collapsible evidence", async () => {
    const html = renderToStaticMarkup(await BatchPage({ params: Promise.resolve({ id: "0001-pilot" }) }));
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
});
