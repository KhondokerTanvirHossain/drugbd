import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pilotStats } from "./fixtures/learn-stats";

const getStats = vi.fn(), checkPublic = vi.fn(), getPublicProduct = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getStats: () => getStats(), checkPublic: (ids: string[]) => checkPublic(ids), getPublicProduct: (id: string) => getPublicProduct(id),
}));
import Home from "@/app/page";
import { SCENARIOS } from "@/content/check-scenarios";

const render = async () => renderToStaticMarkup(await Home());
const none = { summary: { medicines: 3, totalPairs: 0, checkedPairs: 0, alertPairs: 0, noInteractionPairs: 0, notCheckedPairs: 0,
  notReviewed: 3, bySeverity: { major: 0, moderate: 0, minor: 0, unknown: 0 } }, products: [], alerts: [], noInteraction: [],
  notChecked: [], duplicates: [], noData: [], notReviewed: SCENARIOS[0].ids.map((id) => ({ conceptId: id, tradeName: id })) };

beforeEach(() => {
  getStats.mockReset(); getStats.mockResolvedValue(pilotStats());
  checkPublic.mockReset(); checkPublic.mockResolvedValue({ ok: true, data: none });
  getPublicProduct.mockReset(); getPublicProduct.mockResolvedValue({ ok: false, status: 404 });
  vi.stubEnv("HERO_CONCEPT_ID", "");
});

describe("landing (§6.1, Board P section 1)", () => {
  it("hero copy, CTAs and fine print, verbatim", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<h1");
    expect(html).toContain("Bangladesh&#x27;s medicines, traced from brand to substance and checked by a pharmacist.");
    expect(html).toContain('href="/check">Check interactions</a>');
    expect(html).toContain('href="/search">Search medicines</a>');
    expect(html).toContain("Free to search. Continue with Google to sign in or create an account.");
  });

  it("the pilot line and the live stat come from /v1/stats, and both leave when nothing is in review", async () => {
    expect(await render()).toContain("Pilot: 10 medicines being reviewed by pharmacists");
    expect(await render()).toContain("medicines in pilot batch <span class=\"mono\">0001-pilot</span>, under pharmacist review now");
    getStats.mockResolvedValue({ ...pilotStats(), inReviewProducts: 0, batches: [] });
    const quiet = await render();
    expect(quiet).not.toContain("Pilot:");
    expect(quiet).not.toContain("under pharmacist review now");
    expect(quiet).toContain("39,196");
  });

  it("names the batch count when more than one batch is in review", async () => {
    const s = pilotStats();
    getStats.mockResolvedValue({ ...s, batches: [...s.batches, { ...s.batches[0], batchId: "0002-next" }] });
    expect(await render()).toContain("medicines in 2 batches, under pharmacist review now");
  });

  it("a failed stats read leaves the page standing without the live parts", async () => {
    getStats.mockRejectedValue(new Error("down"));
    const html = await render();
    expect(html).toContain("One record, three kinds of work");
    expect(html).not.toContain("Pilot:");
  });

  it("the bands are Board P's, and the promises use the safety constants", async () => {
    const html = await render();
    for (const t of ["One record, three kinds of work", "How a record becomes trustworthy", "Three promises",
      "For partners: the same records, by API", "Unknown severity is never called low risk"]) expect(html).toContain(t);
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).toContain('href="/partners">Request partner access</a>');
    expect(html).toContain("Sign in first. Access is granted by the IntelliDrugs team.");
  });

  it("the partner sample shows the real request and public response, with no Example marker", async () => {
    const html = await render();
    expect(checkPublic).toHaveBeenCalledWith(SCENARIOS[0].ids);
    expect(html).toContain("POST /v1/interactions/check");
    expect(html).toContain("&quot;notReviewed&quot;");
    expect(html).toContain("Public response today. None of the three is approved by a pharmacist");
    expect(html).not.toContain("Field names illustrative");
    expect(html).not.toContain('class="example"');
  });

  it("the none-approved sentence leaves once one of the three is checked, and a failed check leaves the figure out", async () => {
    checkPublic.mockResolvedValue({ ok: true, data: { ...none, notReviewed: none.notReviewed.slice(1) } });
    const one = await render();
    expect(one).toContain("Public response today.");
    expect(one).not.toContain("None of the three is approved");
    checkPublic.mockResolvedValue({ ok: false, status: 503, unknownId: null });
    expect(await render()).not.toContain("Public response today.");
  });
});
