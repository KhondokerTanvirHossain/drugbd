import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAPA, NAPA_PAIRS, emptyCheck } from "./fixtures/public";
import { claims, text } from "./fixtures/show-mode";
import { pilotStats } from "./fixtures/learn-stats";
import { PAIR_PROBLEM, PAIR_UNREVIEWED, PROBLEM_REPORTED, UNREVIEWED_CAUTION } from "@/lib/copy";
import type { CheckResult, PublicProduct, SearchResult } from "@/lib/public-types";

const api = {
  searchMedicines: vi.fn(), getStats: vi.fn(), getPublicProduct: vi.fn(), getProductInteractions: vi.fn(), getClinicalDrug: vi.fn(),
  getPublicSubstance: vi.fn(), getSubstanceInteractions: vi.fn(), checkPublic: vi.fn(), suggestProducts: vi.fn(),
};
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  searchMedicines: (...a: unknown[]) => api.searchMedicines(...a), getStats: () => api.getStats(),
  getPublicProduct: (id: string) => api.getPublicProduct(id), getProductInteractions: (...a: unknown[]) => api.getProductInteractions(...a),
  getClinicalDrug: (id: string) => api.getClinicalDrug(id), getPublicSubstance: (id: string) => api.getPublicSubstance(id),
  getSubstanceInteractions: (...a: unknown[]) => api.getSubstanceInteractions(...a), checkPublic: (ids: string[]) => api.checkPublic(ids),
  suggestProducts: (...a: unknown[]) => api.suggestProducts(...a) }));
vi.mock("@/lib/session", () => ({ getSession: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1" }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
import { getPublicMode } from "@/lib/public-mode-read";
import SearchPage from "@/app/search/page";
import ProductPage from "@/app/products/[id]/page";
import SubstancePage from "@/app/substances/[id]/page";
import CheckPage from "@/app/check/page";
import Home from "@/app/page";

const PILL = "Not yet reviewed by a pharmacist";
const APPROVED = "Approved by a pharmacist";
const CAUTION_FIRST = `<div class="banner banner--warn" role="note"><p class="banner-title">${UNREVIEWED_CAUTION}</p></div>`;
const count = (html: string, s: string) => text(html).split(s).length - 1;

const search: SearchResult = {
  query: "para", total: 6, hasMore: false, counts: { substances: 1, products: 5 },
  substances: [{ bdsId: "BDS-000001", preferredName: "Acetaminophen", matchedName: "Paracetamol", matchedNameType: "dgda_content",
    otherNameTypes: [], coverage: "full", ddinterIds: ["DDInter14"], keyCodes: { atc: [], rxcui: [] }, approvedProductCount: 1,
    productCount: 3, review: "approved" }],
  products: [
    { conceptId: "A", tradeName: "Apara", darNumber: "1", company: "Co", dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg",
      clinicalDrug: { bdcId: "BDC-1", displayName: "Acetaminophen 500 mg tablet" }, matchedOn: "generic", matchedName: "x", status: "approved", review: "approved" },
    { conceptId: "N", tradeName: "Napa", darNumber: "2", company: "Co", dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg",
      clinicalDrug: { bdcId: "BDC-1", displayName: "Acetaminophen 500 mg tablet" }, matchedOn: "generic", matchedName: "x", status: "not_reviewed", review: "not_reviewed" },
    { conceptId: "P", tradeName: "Probpara", darNumber: "3", company: "Co", dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg",
      clinicalDrug: null, matchedOn: "generic", matchedName: "x", status: "not_reviewed", review: "problem" },
    { conceptId: "R", tradeName: "Parared", status: "removed", hidden: true },
    { conceptId: "U", tradeName: "Paraunav", status: "unavailable", hidden: true },
  ],
  suggestion: null,
};
const product = (review: "approved" | "not_reviewed" | "problem"): PublicProduct => ({ ...NAPA, review,
  verification: review === "approved" ? NAPA.verification : null });
const unreviewedPairs = { ...NAPA_PAIRS, review: "not_reviewed" as const,
  partners: NAPA_PAIRS.partners.map((p, i) => ({ ...p, partnerReview: i === 0 ? "problem" as const : "not_reviewed" as const,
    brands: p.brands.map((b, j) => ({ ...b, review: i === 0 && j === 0 ? "problem" as const : "not_reviewed" as const })) })) };

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  vi.mocked(getPublicMode).mockResolvedValue("show_unreviewed");
  api.getStats.mockResolvedValue(pilotStats({ mode: "show_unreviewed" }));
  api.searchMedicines.mockResolvedValue({ ok: true, data: search });
  api.getProductInteractions.mockResolvedValue({ ok: true, data: unreviewedPairs });
  api.getClinicalDrug.mockResolvedValue({ ok: true, data: { bdcId: "BDC-000001", displayName: "x", doseForm: "Tablet", route: "systemic",
    ingredients: [], products: [{ conceptId: NAPA.conceptId, tradeName: "Napa", company: "Co", darNumber: "1", review: "not_reviewed" },
      { conceptId: "ACE", tradeName: "Ace", company: "Square", darNumber: "9", review: "problem" }] } });
  api.suggestProducts.mockResolvedValue({ ok: true, data: [] });
  vi.stubEnv("HERO_CONCEPT_ID", "");
});

describe("search in show mode (§6.3, §6.10)", () => {
  it("labels every hit, adds the problem line, opens with one caution and uses the withdrawn stub lines", async () => {
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "para" }) }));
    expect(html.startsWith(CAUTION_FIRST)).toBe(true);
    expect(count(html, UNREVIEWED_CAUTION)).toBe(1);
    expect(count(html, PROBLEM_REPORTED)).toBe(1);
    expect(count(html, APPROVED)).toBe(1);
    expect(count(html, PILL)).toBe(4);   // Napa, Probpara and the two stubs
    const t = text(html);
    expect(t).toContain("3 products, 1 approved by a pharmacist");
    expect(t).toContain("Removed from the DGDA batch file.");
    expect(t).toContain("This record is withdrawn from public view, so its substance, codes and interactions are hidden.");
    expect(claims(html)).toEqual([]);
  });

  it("a problem hit shows the pill, then the problem line (§3.4, §6.10), in DOM order", async () => {
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "para" }) }));
    expect(text(html)).toMatch(new RegExp(`${PILL}</span><p class="problem-line">${PROBLEM_REPORTED}`));
    const hit = html.slice(html.indexOf("Probpara"));
    expect(hit.indexOf(PILL)).toBeLessThan(hit.indexOf(PROBLEM_REPORTED));
  });

  it("no caution when every hit is approved", async () => {
    api.searchMedicines.mockResolvedValue({ ok: true, data: { ...search, products: [search.products[0]], counts: { substances: 1, products: 1 }, total: 2 } });
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "para" }) }));
    expect(html).not.toContain(UNREVIEWED_CAUTION);
  });

  it("approved-only mode renders today's page, with no caution or label line", async () => {
    vi.mocked(getPublicMode).mockResolvedValue("approved_only");
    api.searchMedicines.mockResolvedValue({ ok: true, data: { ...search, products: [search.products[0], { conceptId: "S", tradeName: "Parastub", status: "not_reviewed", hidden: true }] } });
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "para" }) }));
    expect(html).not.toContain(UNREVIEWED_CAUTION);
    expect(text(html)).toContain("A pharmacist hasn't approved this record yet, so its substance, codes and interactions are hidden.");
    expect(text(html)).toContain("1 approved product");
  });
});

describe("product page in show mode (§6.5, §6.10)", () => {
  const render = async () => renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: NAPA.conceptId }), searchParams: Promise.resolve({}) }));

  it("a not-reviewed product: full layout, pill, no verification date, the not-verified card, source links, labelled partners and pair lines", async () => {
    api.getPublicProduct.mockResolvedValue({ ok: true, data: product("not_reviewed") });
    const html = await render();
    const t = text(html);
    expect(html.startsWith(CAUTION_FIRST)).toBe(true);
    expect(count(html, UNREVIEWED_CAUTION)).toBe(1);
    expect(t).not.toContain(APPROVED);
    expect(t).toContain("A pharmacist has not yet compared this record with the DGDA register.");
    expect(t).not.toContain("A pharmacist compared this record with the DGDA register on");
    expect(t).toContain("With other medicines");
    expect(t).toContain(PAIR_PROBLEM);
    expect(t).toContain(PAIR_UNREVIEWED);
    expect(html).toContain('class="src-link"');
    expect(t).toContain("Ace");   // other brands of the clinical drug, labelled
    expect(claims(html)).toEqual([]);
  });

  it("a problem product shows the pill then the problem line in the header and on the card", async () => {
    api.getPublicProduct.mockResolvedValue({ ok: true, data: product("problem") });
    const html = await render();
    expect(count(html, PROBLEM_REPORTED)).toBeGreaterThanOrEqual(2);
    expect(text(html)).toMatch(new RegExp(`${PILL}</span><p class="problem-line">${PROBLEM_REPORTED}`));
  });

  // §7.4.1 Privacy: the API withholds a problem record's stage results (stages: []), so nothing says a check failed. The page
  // says the checks are not shown, never reassuring counts; a failed stage that still arrives is never rendered.
  it("a problem product shows no check results or counts, only the withheld line, even with a failed stage in the data", async () => {
    const failed = { ...product("problem"), provenance: { ...NAPA.provenance, stages: [
      { stage: "dgda" as const, status: "ok" as const, notes: [], textMissing: [] },
      { stage: "clinical" as const, status: "fail" as const, notes: [{ kind: "other", text: "no clinical drug for the strength" }], textMissing: [] }] } };
    for (const data of [{ ...product("problem"), provenance: { ...NAPA.provenance, stages: [] } }, failed]) {
      api.getPublicProduct.mockResolvedValue({ ok: true, data });
      const t = text(await render());
      expect(t).toContain("Automated checks");
      expect(t).toContain("Not shown while a problem is reported with this record.");
      expect(t).toContain("<dd>Not shown</dd>");
      expect(t).not.toMatch(/\d OK, \d|Failed|no clinical drug for the strength|No pipeline note\./);
    }
  });

  it("a not-reviewed product keeps its stage cards and counts (§6.10)", async () => {
    api.getPublicProduct.mockResolvedValue({ ok: true, data: product("not_reviewed") });
    const t = text(await render());
    expect(t).toContain("3 OK, 1 Warning. Notes are the pipeline's own.");
    expect(t).toContain("<dd>3 OK, 1 Warning</dd>");
    expect(t).not.toContain("Not shown while a problem is reported with this record.");
  });

  it("an approved product with an unapproved partner keeps its verification line and opens with the caution", async () => {
    api.getPublicProduct.mockResolvedValue({ ok: true, data: product("approved") });
    const html = await render();
    const t = text(html);
    expect(html.startsWith(CAUTION_FIRST)).toBe(true);
    expect(t).toContain(APPROVED);
    expect(t).toContain("goes back to review and shows \"Not yet reviewed by a pharmacist\" until it is approved again.");
    expect(t).toContain(PAIR_UNREVIEWED);
    expect(claims(html)).toEqual([]);
  });

  it("no caution when the product and every partner are approved", async () => {
    api.getPublicProduct.mockResolvedValue({ ok: true, data: product("approved") });
    api.getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, review: "approved",
      partners: NAPA_PAIRS.partners.map((p) => ({ ...p, partnerReview: "approved" })), notChecked: [] } });
    api.getClinicalDrug.mockResolvedValue({ ok: false, status: 404 });
    const html = await render();
    expect(html).not.toContain(UNREVIEWED_CAUTION);
    expect(html).not.toContain(PAIR_UNREVIEWED);
  });

  it("stubs say why a record is withheld: unavailable and in no batch", async () => {
    api.getPublicProduct.mockResolvedValue({ ok: true, data: { conceptId: "U", tradeName: "Gone", status: "unavailable", batchId: "0001-pilot", hidden: true } });
    let t = text(await render());
    expect(t).toContain("The DGDA register did not return this record in its latest run, so IntelliDrugs hides its clinical drug, codes and interactions.");
    expect(t).toContain("The record exists in batch <span class=\"mono\">0001-pilot</span>.");
    api.getPublicProduct.mockResolvedValue({ ok: true, data: { conceptId: "L", tradeName: "Loose", status: "not_reviewed", batchId: null, hidden: true } });
    t = text(await render());
    expect(t).toContain("This record is in no review batch yet, so IntelliDrugs hides its clinical drug, codes and interactions.");
    expect(t).not.toContain(UNREVIEWED_CAUTION);
  });
});

describe("substance page in show mode (§6.6)", () => {
  it("header pill and problem line, labelled lists, pair lines and the caution", async () => {
    api.getPublicSubstance.mockResolvedValue({ ok: true, data: { bdsId: "BDS-000001", preferredName: "Warfarin", names: [], codes: [],
      coverage: { coverage: "full", note: "" }, products: [{ conceptId: "W", tradeName: "Warin", company: "Co", review: "problem" }],
      diseases: [], foods: [], entries: [{ ddinterId: "DDInter1951", name: "Warfarin", routeScope: "systemic", counts: { major: 1, moderate: 0, minor: 0, unknown: 0, total: 1 }, diseaseCount: 0, foodCount: 0, sourceLink: null }],
      clinicalDrugs: [{ bdcId: "BDC-1", displayName: "Warfarin 5 mg tablet", review: "problem" }], review: "problem" } });
    api.getSubstanceInteractions.mockResolvedValue({ ok: true, data: { bdsId: "BDS-000001", counts: [], total: 1, page: 0, size: 20, review: "problem",
      items: [{ partnerName: "Aspirin", partnerBdsId: "BDS-2", ddinterA: "DDInter1951", ddinterB: "DDInter20", routeScope: "systemic", severity: "major",
        actions: ["Avoid"], interaction: "x", management: "y", pairReview: { state: "not_reviewed", reviewedAt: null }, sourceUrl: null, partnerReview: "approved" }] } });
    const html = renderToStaticMarkup(await SubstancePage({ params: Promise.resolve({ id: "BDS-000001" }), searchParams: Promise.resolve({}) }));
    expect(html.startsWith(CAUTION_FIRST)).toBe(true);
    expect(count(html, PROBLEM_REPORTED)).toBe(3);
    expect(text(html)).toContain(PAIR_PROBLEM);
  });

  it("a substance stub in show mode says no public medicine carries it", async () => {
    api.getPublicSubstance.mockResolvedValue({ ok: true, data: { bdsId: "BDS-9", preferredName: "Hidol", hidden: true } });
    const t = text(renderToStaticMarkup(await SubstancePage({ params: Promise.resolve({ id: "BDS-9" }), searchParams: Promise.resolve({}) })));
    expect(t).toContain("No public medicine carries this substance yet, so IntelliDrugs hides its codes and interactions.");
  });
});

describe("checker in show mode (§6.7)", () => {
  const result: CheckResult = emptyCheck({
    summary: { ...emptyCheck().summary, medicines: 3, totalPairs: 2, checkedPairs: 2, alertPairs: 1, noInteractionPairs: 1, notReviewed: 1, notApproved: 2 },
    products: [{ conceptId: "N", tradeName: "Napa", route: "systemic", review: "not_reviewed", substances: [] },
      { conceptId: "W", tradeName: "G Warfarin", route: "systemic", review: "problem", substances: [] }],
    alerts: [{ severity: "moderate", a: { conceptId: "N", tradeName: "Napa", bdsId: "B1", name: "Acetaminophen", routeScope: "systemic", review: "not_reviewed" },
      b: { conceptId: "W", tradeName: "G Warfarin", bdsId: "B2", name: "Warfarin", routeScope: "systemic", review: "problem" }, actions: ["synergy"],
      interaction: "x", management: "y", routeAssumed: false, ddinterA: "DDInter14", ddinterB: "DDInter1951", interactionId: null, source: "DDInter 2.0",
      pairReview: { state: "not_reviewed", reviewedAt: null } }],
    noInteraction: [{ a: { conceptId: "N", tradeName: "Napa", bdsId: "B1", name: "Acetaminophen", routeScope: "systemic", review: "not_reviewed" },
      b: { conceptId: "W", tradeName: "G Warfarin", bdsId: "B3", name: "Other", routeScope: "systemic", review: "problem" }, ddinterA: "a", ddinterB: "b" }],
    notReviewed: [{ conceptId: "R", tradeName: "Removol" }],
  });

  it("labelled rows, pair lines on the alert and the quiet row, the withdrawn section and summary, and the caution", async () => {
    api.getPublicProduct.mockImplementation(async (id: string) => id === "R"
      ? { ok: true, data: { conceptId: "R", tradeName: "Removol", status: "removed", batchId: "B", hidden: true } }
      : { ok: true, data: { ...product(id === "W" ? "problem" : "not_reviewed"), conceptId: id, tradeName: id === "W" ? "G Warfarin" : "Napa" } });
    api.checkPublic.mockResolvedValue({ ok: true, data: result });
    const html = renderToStaticMarkup(await CheckPage({ searchParams: Promise.resolve({ ids: ["N", "W", "R"] }) }));
    const t = text(html);
    expect(html.startsWith(CAUTION_FIRST)).toBe(true);
    expect(t).toContain("· 2 medicines not yet reviewed by a pharmacist · 1 withdrawn medicine not checked");
    expect(count(html, PAIR_PROBLEM)).toBe(2);
    expect(t).toContain("Withdrawn from public view, 1 product");
    expect(t).toContain("These products were not checked. They are withdrawn from public view.");
    expect(t).toContain(PROBLEM_REPORTED);
    expect(claims(html)).toEqual([]);
  });
});

describe("landing in show mode (§6.1)", () => {
  it("a visible unapproved hero renders live with the pill, the show-mode copy and the caution", async () => {
    vi.stubEnv("HERO_CONCEPT_ID", NAPA.conceptId);
    api.getPublicProduct.mockResolvedValue({ ok: true, data: product("not_reviewed") });
    api.checkPublic.mockResolvedValue({ ok: false, status: 503, unknownId: null });
    const html = renderToStaticMarkup(await Home());
    const t = text(html);
    expect(html.startsWith(CAUTION_FIRST)).toBe(true);
    expect(t).toContain("Bangladesh's medicines, traced from brand to substance, each marked with whether a pharmacist has approved it.");
    expect(t).toContain("Records a pharmacist has not approved yet are shown, marked \"Not yet reviewed by a pharmacist\".");
    expect(t).toContain("Every record shows whether a pharmacist has approved it");
    expect(t).toContain("Acetaminophen 500 mg tablet");   // the live card
    expect(claims(html)).toEqual([]);
  });

  it("a hidden hero is the stub card with the withdrawn line, and no caution", async () => {
    vi.stubEnv("HERO_CONCEPT_ID", "X");
    api.getPublicProduct.mockResolvedValue({ ok: true, data: { conceptId: "X", tradeName: "Gone", status: "removed", batchId: "B", hidden: true } });
    api.checkPublic.mockResolvedValue({ ok: false, status: 503, unknownId: null });
    const html = renderToStaticMarkup(await Home());
    expect(text(html)).toContain("This record is withdrawn from public view.");
    expect(html).not.toContain(UNREVIEWED_CAUTION);
  });

  it("when stats fail the mode comes from GET /v1/public-mode; when that fails too the page fails", async () => {
    api.getStats.mockRejectedValue(new Error("down"));
    api.checkPublic.mockResolvedValue({ ok: false, status: 503, unknownId: null });
    expect(text(renderToStaticMarkup(await Home()))).toContain("Every record shows whether a pharmacist has approved it");
    vi.mocked(getPublicMode).mockRejectedValue(new Error("API error 503"));
    await expect(Home()).rejects.toThrow(/API error/);
  });
});
