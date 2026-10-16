import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSubstance, SubstanceInteractions } from "@/lib/public-types";

const getPublicSubstance = vi.fn(), getSubstanceInteractions = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicSubstance: (id: string) => getPublicSubstance(id),
  getSubstanceInteractions: (id: string, sev: string | null, p: number) => getSubstanceInteractions(id, sev, p) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
import SubstancePage from "@/app/substances/[id]/page";

const WARFARIN: PublicSubstance = {
  bdsId: "BDS-000003", preferredName: "Warfarin",
  names: [{ name: "Warfarin", nameType: "icd11", source: "dgda-ocl" }, { name: "Warfarin Sodium", nameType: "dgda_content", source: "dgda-ocl" }],
  codes: [{ system: "ATC", code: "B01AA03", routeScope: "any", source: "rxnav", method: "rxnav-exact", confidence: 1,
      sourceLink: { url: "https://atcddd.fhi.no/atc_ddd_index/?code=B01AA03&showdescription=no", label: "WHO ATC/DDD Index", fetchedAt: "2026-10-11T22:05:00Z" } },
    { system: "DDINTER", code: "DDInter1951", routeScope: "systemic", source: "ddinter2", method: "drugbank", confidence: 1, sourceLink: null }],
  coverage: { coverage: "full", note: "" },
  products: [{ conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", company: "Gonoshasthaya" }],
  diseases: [{ diseaseName: "Bleeding", severity: "major", text: "Warfarin increases bleeding risk.", interactionId: "D1", routeScope: "systemic" }],
  foods: [{ food: "Vitamin K rich foods", severity: "moderate", description: "Vitamin K reduces the effect.", management: "Keep intake steady.", interactionId: "F1", routeScope: "systemic" }],
  entries: [{ ddinterId: "DDInter1951", name: "Warfarin", routeScope: "systemic", counts: { major: 1, moderate: 2, minor: 1, unknown: 1, total: 5 },
    diseaseCount: 1, foodCount: 1, sourceLink: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: null } }],
  clinicalDrugs: [{ bdcId: "BDC-000003", displayName: "Warfarin 5 mg tablet" }],
};
const LIST: SubstanceInteractions = { bdsId: "BDS-000003", counts: WARFARIN.entries, total: 25, page: 0, size: 20, items: [
  { partnerName: "Acetylsalicylic acid", partnerBdsId: null, ddinterA: "DDInter1951", ddinterB: "DDInter20", routeScope: "systemic",
    severity: "major", actions: ["synergy"], interaction: "Raises bleeding risk.", management: "Avoid unless needed.",
    pairReview: { state: "not_reviewed", reviewedAt: null }, sourceUrl: "https://ddinter2.scbdd.com/server/interact/3039/" },
  { partnerName: "Acetaminophen", partnerBdsId: "BDS-000001", ddinterA: "DDInter14", ddinterB: "DDInter1951", routeScope: "systemic",
    severity: "moderate", actions: ["synergy"], interaction: null, management: null,
    pairReview: { state: "reviewed", reviewedAt: "2026-10-16T05:20:00Z" }, sourceUrl: null }] };

const render = async (sp: Record<string, string> = {}, id = "BDS-000003") =>
  renderToStaticMarkup(await SubstancePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  getPublicSubstance.mockReset(); getPublicSubstance.mockResolvedValue({ ok: true, data: WARFARIN });
  getSubstanceInteractions.mockReset(); getSubstanceInteractions.mockResolvedValue({ ok: true, data: LIST });
});

describe("/substances/[id] (§6.6)", () => {
  it("crumb, h1 with the BDS id, names, codes with source links, neutral coverage, entry counts", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Warfarin <span class="mono">BDS-000003</span></h1>');
    expect(html).toContain("<li>Warfarin Sodium <span>DGDA register</span></li>");
    expect(html).toContain('href="https://atcddd.fhi.no/atc_ddd_index/?code=B01AA03&amp;showdescription=no"');
    expect(html).toContain("drugbank, confidence 1.0, systemic");
    expect(html).toContain("<p>Interaction data found</p>");
    expect(html).not.toContain("rv--approved\">Interaction");
    expect(html).toContain('<span class="mono">DDInter1951</span> (systemic)');
  });

  it("drug–drug pairs with the label, review state, DDInter link, unlinked private partners, and paging", async () => {
    const html = await render();
    expect(getSubstanceInteractions).toHaveBeenCalledWith("BDS-000003", null, 0);
    expect(html).toContain("Drug–drug interactions");
    expect(html).toContain("Warfarin + Acetylsalicylic acid");
    expect(html).not.toContain('href="/substances/null"');
    expect(html).toContain('<a href="/substances/BDS-000001">Acetaminophen</a>');
    expect(html).toContain("From DDInter 2.0");
    expect(html).toContain("Pair not yet reviewed by a senior pharmacist");
    expect(html).toContain('href="https://ddinter2.scbdd.com/server/interact/3039/"');
    expect(html).toContain("Full record in DDInter 2.0");
    expect(html).toContain('href="/substances/BDS-000003?page=1#pairs">Next page</a>');
  });

  it("the severity filter is a set of GET links with the current one marked (Review Focus 5: unknown values read as All)", async () => {
    const html = await render({ severity: "major" });
    expect(getSubstanceInteractions).toHaveBeenLastCalledWith("BDS-000003", "major", 0);
    expect(html).toContain('aria-current="page" href="/substances/BDS-000003?severity=major#pairs">Major</a>');
    expect(html).toContain('href="/substances/BDS-000003?severity=unknown#pairs">Severity not classified by DDInter</a>');
    await render({ severity: "fatal", page: "-3" });
    expect(getSubstanceInteractions).toHaveBeenLastCalledWith("BDS-000003", null, 0);
  });

  it("disease and food lists with truncated text; approved products and clinical drugs", async () => {
    const html = await render();
    expect(html).toContain("Drug–disease");
    expect(html).toContain("Warfarin increases bleeding risk.");
    expect(html).toContain("Drug–food");
    expect(html).toContain("Keep intake steady.");
    expect(html).toContain('<a href="/products/185-0138-012--g-warfarin">G Warfarin</a>');
    expect(html).toContain("Warfarin 5 mg tablet");
  });

  it("DDInter placeholders are never printed in the disease and food lists (§3.6)", async () => {
    getPublicSubstance.mockResolvedValue({ ok: true, data: { ...WARFARIN,
      diseases: [{ ...WARFARIN.diseases[0], text: "None" }],
      foods: [{ ...WARFARIN.foods[0], management: "-", description: "Vitamin K reduces the effect." }] } });
    const html = await render();
    expect(html).not.toContain(">None<");
    expect(html).not.toContain(">-<");
    expect(html).toContain("Vitamin K reduces the effect.");
  });

  it("a page past the end links back to the last real page, never the empty line (Review Focus 5)", async () => {
    getSubstanceInteractions.mockResolvedValue({ ok: true, data: { ...LIST, page: 7, items: [] } });
    const html = await render({ page: "7" });
    expect(getSubstanceInteractions).toHaveBeenLastCalledWith("BDS-000003", null, 7);
    expect(html).toContain('href="/substances/BDS-000003?page=1#pairs">Previous page</a>');
    expect(html).not.toContain("Next page");
    expect(html).not.toContain("None listed in DDInter 2.0.");
    getSubstanceInteractions.mockResolvedValue({ ok: true, data: { ...LIST, total: 0, page: 3, items: [] } });
    const empty = await render({ page: "3", severity: "minor" });
    expect(empty).toContain("None listed in DDInter 2.0.");
    expect(empty).not.toContain("Previous page");
  });

  it("no data: the hatch block and no pair list; not run: NOT_RUN and never the no-data sentence", async () => {
    getPublicSubstance.mockResolvedValue({ ok: true, data: { ...WARFARIN, coverage: { coverage: "none", note: "" }, entries: [] } });
    const none = await render();
    expect(none).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(none).not.toContain("Drug–drug interactions");
    expect(getSubstanceInteractions).not.toHaveBeenCalled();
    getPublicSubstance.mockResolvedValue({ ok: true, data: { ...WARFARIN, coverage: { coverage: "not_run", note: "" }, entries: [] } });
    const nr = await render();
    expect(nr).toContain("Not checked yet: DDInter mapping has not run");
    expect(nr).not.toContain("No interaction data in DDInter for this substance");
  });

  it("a substance that is not public is the stub; unknown is not found", async () => {
    getPublicSubstance.mockResolvedValue({ ok: true, data: { bdsId: "BDS-000002", preferredName: "Aspirin", hidden: true } });
    const html = await render({}, "BDS-000002");
    expect(html).toContain(">Aspirin</h1>");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).toContain("hides its codes and interactions");
    expect(html).not.toContain("is in review in batch");
    getPublicSubstance.mockResolvedValue({ ok: false, status: 404 });
    await expect(render({}, "BDS-999999")).rejects.toThrow("NEXT_NOT_FOUND");
    // final review finding 2: an id over ID_MAX or with a control character never reaches the API
    getPublicSubstance.mockClear();
    for (const bad of ["B".repeat(5000), "BDS-000001%00", "%1F"]) await expect(render({}, bad)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getPublicSubstance).not.toHaveBeenCalled();
  });
});
