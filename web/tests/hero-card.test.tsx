import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicProduct } from "@/lib/public-types";

const getPublicProduct = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicProduct: (id: string) => getPublicProduct(id) }));
import HeroCard, { heroFieldText } from "@/components/public/HeroCard";
import { loadHero } from "@/components/public/hero";

const NAPA: PublicProduct = {
  conceptId: "186-0030-006--napa", darNumber: "186-0030-006", tradeName: "Napa", company: "Beximco Pharmaceuticals Ltd.",
  dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [], parseStatus: "parsed", parseNote: null,
  clinicalDrug: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet", route: "systemic", ingredients: [{
    bdsId: "BDS-000001", name: "Acetaminophen", strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null,
    ddinter: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
    summary: { bdsId: "BDS-000001", name: "Acetaminophen", raw: "Paracetamol 500 mg", strengthValue: 500, strengthUnit: "mg",
      perValue: null, perUnit: null,
      names: [{ name: "Paracetamol", type: "dgda_content", source: "dgda-ocl" }, { name: "Acetaminophen", type: "icd11", source: "dgda-ocl" }],
      codes: [["ICD11_XM", "XM5DJ7"], ["RXCUI", "161"], ["ATC", "N02BE01"], ["DRUGBANK", "DB00316"], ["SNOMEDCT", "387517004"], ["DDINTER", "DDInter14"]]
        .map(([system, code]) => ({ system, code, routeScope: "any", method: "xm", confidence: 1, source: null })),
      coverage: { coverage: "full", note: "" },
      ddinter: { chosen: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
        entries: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic",
          counts: { major: 10, moderate: 85, minor: 38, unknown: 512, total: 645 }, diseaseCount: 3, foodCount: 1, source: null }] } } }] },
  verification: { status: "approved", role: "pharmacist", approvedAt: "2026-10-14T05:20:00Z" },
  provenance: { batchId: "0001-pilot", extractedAt: null, source: "DGDA register", sourceLink: null, stages: [] }, otherBrandsCount: 0,
};
const STUB = { conceptId: "186-0030-006--napa", tradeName: "Napa", status: "not_reviewed" as const, batchId: "0001-pilot", hidden: true as const };

beforeEach(() => { getPublicProduct.mockReset(); vi.stubEnv("HERO_CONCEPT_ID", "186-0030-006--napa"); });
afterEach(() => vi.unstubAllEnvs());

// Review Focus 4
describe("loadHero", () => {
  it("no card when the hero id is unset, unknown or the API fails", async () => {
    vi.stubEnv("HERO_CONCEPT_ID", "");
    expect(await loadHero()).toBeNull();
    expect(getPublicProduct).not.toHaveBeenCalled();
    vi.stubEnv("HERO_CONCEPT_ID", "   ");
    expect(await loadHero()).toBeNull();
    vi.stubEnv("HERO_CONCEPT_ID", "186-0030-006--napa");
    getPublicProduct.mockResolvedValue({ ok: false, status: 404 });
    expect(await loadHero()).toBeNull();
    getPublicProduct.mockRejectedValue(new Error("down"));
    expect(await loadHero()).toBeNull();
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...STUB, conceptId: "someone-else" } });
    expect(await loadHero()).toBeNull();
  });
  it("answers the stub or the product", async () => {
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    expect(await loadHero()).toEqual(STUB);
    getPublicProduct.mockResolvedValue({ ok: true, data: NAPA });
    expect(await loadHero()).toEqual(NAPA);
  });
  it("a dismissed hero (approved, reported, then dismissed by a senior: pending, P1C §5.2) is the stub card, never the approved one", async () => {
    // the API answers a dismissed record with the plain §7.4 stub; nothing of the issue or the dismissal reaches the web
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    const hero = await loadHero();
    expect(hero).toEqual(STUB);
    const html = renderToStaticMarkup(<HeroCard hero={hero!} />);
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["rv--approved", "Brand in the DGDA register", "Acetaminophen 500 mg tablet", "issue", "ismiss"])
      expect(html).not.toContain(absent);
  });
});

describe("HeroCard (§6.1, §1.6 item 9)", () => {
  it("not approved: trade name and the not-reviewed pill only, at every width, labelled without Example", () => {
    for (const stub of [STUB, { ...STUB, status: "removed" as const }]) {
      const html = renderToStaticMarkup(<HeroCard hero={stub} />);
      expect(html).toContain('role="group" aria-label="Lookup for Napa"');
      expect(html).toContain("<h2");
      expect(html).toContain("Not yet reviewed by a pharmacist");
      expect(html).toContain("Its clinical drug, codes and interactions appear here after a pharmacist approves it.");
      for (const absent of ["Tablet", "Beximco", "DAR", "Paracetamol", "BDC-", "BDS-", "XM5DJ7", "sev--", "Example", "example", "rv--approved"])
        expect(html).not.toContain(absent);
    }
  });
  it("approved: the four live steps and the approved pill, no Example", () => {
    const html = renderToStaticMarkup(<HeroCard hero={NAPA} />);
    expect(html).toContain('aria-label="Lookup for Napa 500"');
    expect(html).toContain("Brand in the DGDA register");
    expect(html).toContain("Tablet, <span class=\"wide\">Beximco Pharmaceuticals Ltd., </span><span class=\"mono\">DAR 186-0030-006</span>");
    expect(html).toContain("Acetaminophen 500 mg tablet");
    expect(html).toContain('<span class="mono">BDS-000001</span>');
    expect(html).toContain("also listed as Paracetamol");
    expect(html).toContain("Drug interactions in DDInter 2.0, 645 pairs");
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">512</b></span>');
    expect(html).toContain("rv--approved");
    expect(html).not.toContain("Example");
  });
  it("the narrow parts are marked so CSS can drop them below 480 px", () => {
    const html = renderToStaticMarkup(<HeroCard hero={NAPA} />);
    // Brand: short label, form and mono DAR stay; the company is wide-only
    expect(html).toContain('<span class="s-k"><span class="wide">Brand in the DGDA register</span><span class="narrow">Brand</span></span>');
    expect(html).toContain('Tablet, <span class="wide">Beximco Pharmaceuticals Ltd., </span><span class="mono">DAR 186-0030-006</span>');
    // the 'Filed as' line is wide-only
    expect(html).toContain('<span class="s-x wide">Filed as <span class="raw">Paracetamol 500 mg</span></span>');
    // Clinical drug: display name and mono BDC stay; the route is wide-only
    expect(html).toContain('<span class="s-x"><span class="mono">BDC-000001</span><span class="wide">, systemic route</span></span>');
    // substance: no strength below 480 px; "also {DGDA name}" replaces "also listed as {DGDA name}"
    expect(html).toContain('<span class="s-v">Acetaminophen<span class="wide">, 500 mg</span></span>');
    expect(html).toContain('<span class="mono">BDS-000001</span><span class="wide">, also listed as Paracetamol</span><span class="narrow">, also Paracetamol</span>');
    // only ICD-11, RxCUI and ATC chips stay; DrugBank and SNOMED CT are wide-only
    for (const sys of ["ICD-11", "RxCUI", "ATC"])
      expect(html).toContain(`<span><span class="code"><span class="code-sys">${sys}</span>`);
    for (const sys of ["DrugBank", "SNOMED CT"])
      expect(html).toContain(`<span class="wide"><span class="code"><span class="code-sys">${sys}</span>`);
    expect(html.match(/<span class="code"><span class="code-sys">/g)).toHaveLength(5);
    expect(html.match(/<span class="wide"><span class="code">/g)).toHaveLength(2);
  });
  it("every rail has a step beside it, and below 480 px the substance rail ends the chain as on Board P", () => {
    const rails = (html: string) => html.match(/<div class="s-rail[^"]*" aria-hidden="true">/g) ?? [];
    const steps = (html: string) => html.match(/<div class="s-step/g) ?? [];
    const full = renderToStaticMarkup(<HeroCard hero={NAPA} />);
    expect(rails(full)).toHaveLength(4);
    expect(steps(full)).toHaveLength(4);
    // the counts rail and the substance rail's line are wide-only, like the counts step
    expect(full).toContain('<div class="s-rail wide" aria-hidden="true"><i></i></div><div class="s-step wide">');
    expect(full).toContain('<i></i><b class="wide"></b></div><div class="s-step"><span class="s-k">Active substance');
    const item = NAPA.clinicalDrug!.ingredients[0];
    const none = { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, ingredients: [{ ...item,
      summary: { ...item.summary!, coverage: { coverage: "none" as const, note: "" } } }] } };
    const html = renderToStaticMarkup(<HeroCard hero={none} />);
    expect(rails(html)).toHaveLength(3);
    expect(steps(html)).toHaveLength(3);
    expect(html).not.toContain("Drug interactions in DDInter 2.0");
  });
  it("field row text", () => {
    expect(heroFieldText(NAPA)).toBe("Napa 500");
    expect(heroFieldText({ ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, ingredients: [...NAPA.clinicalDrug!.ingredients, NAPA.clinicalDrug!.ingredients[0]] } })).toBe("Napa");
  });
});
