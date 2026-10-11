import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Substance } from "@/lib/api";

const getSubstance = vi.fn();
vi.mock("@/lib/api", () => ({ getSubstance: (id: string) => getSubstance(id) }));
import SubstancePage from "@/app/substances/[id]/page";

const NONE_SENTENCE = "No interaction data in DDInter for this substance. This does not mean it is safe to combine.";

const domperidone: Substance = {
  bdsId: "BDS-000004", preferredName: "Domperidone",
  names: [{ name: "Domperidone", nameType: "icd11", source: "dgda-ocl" }],
  codes: [{ system: "ICD11_XM", code: "XM0Y01", routeScope: "any", source: "dgda-ocl", method: "xm", confidence: 1 }],
  coverage: { coverage: "none", note: "No interaction data in DDInter for this substance" },
  products: [{ conceptId: "D-1", tradeName: "Motigut", company: "Square" }],
  interactions: [], diseases: [], foods: [],
};

const warfarin: Substance = {
  bdsId: "BDS-000001", preferredName: "Warfarin",
  names: [
    { name: "Warfarin", nameType: "icd11", source: "dgda-ocl" },
    { name: "Warfarin Sodium", nameType: "dgda_content", source: "dgda-ocl" },
  ],
  codes: [
    { system: "RXCUI", code: "11289", routeScope: "any", source: "rxnav", method: "rxnav-approx", confidence: 0.8 },
    { system: "DDINTER", code: "DDInter1951", routeScope: "systemic", source: "ddinter", method: "name", confidence: 0.95 },
  ],
  coverage: { coverage: "full", note: "DDInter DDInter1951" },
  products: [{ conceptId: "W-1", tradeName: "Warin", company: "Acme" }],
  interactions: [
    { partnerName: "Acetylsalicylic acid", partnerBdsId: "BDS-000002", severity: "major", actions: ["Monitor", "Avoid"],
      interactionId: "IA-1", routeScope: "systemic" },
    { partnerName: "Chloramphenicol (ophthalmic)", partnerBdsId: "BDS-000003", severity: "moderate", actions: [],
      interactionId: null, routeScope: "systemic" },
    { partnerName: "Some Herb", partnerBdsId: null, severity: "minor", actions: [], interactionId: null, routeScope: "systemic" },
  ],
  diseases: [{ diseaseName: "Bleeding", severity: "major", text: "Warfarin increases bleeding risk.", refs: ["ref one"],
    interactionId: "D-1", routeScope: "systemic" }],
  foods: [{ food: "Vitamin K rich foods", severity: "moderate", mechanism: "Antagonism",
    description: "Vitamin K reduces the effect of warfarin.", management: "Keep vitamin K intake steady.", refs: [],
    interactionId: "F-1", routeScope: "systemic" }],
};

const render = async (id: string) => renderToStaticMarkup(await SubstancePage({ params: Promise.resolve({ id }) }));

beforeEach(() => getSubstance.mockReset());

describe("substance page", () => {
  it("shows the exact no-data sentence for coverage none and never says 'no interactions'", async () => {
    getSubstance.mockResolvedValue(domperidone);
    const html = await render("BDS-000004");
    expect(getSubstance).toHaveBeenCalledWith("BDS-000004");
    expect(html).toContain(NONE_SENTENCE);
    expect(html.toLowerCase()).not.toContain("no interactions");
    expect(html).toContain('href="/products/D-1"');
  });

  it("shows names and codes with source, method and confidence", async () => {
    getSubstance.mockResolvedValue(warfarin);
    const html = await render("BDS-000001");
    expect(html).toContain("Warfarin Sodium");
    expect(html).toContain("dgda_content");
    expect(html).toMatch(/<td>RXCUI<\/td><td>11289<\/td><td>any<\/td><td>rxnav<\/td><td>rxnav-approx<\/td><td>0\.80<\/td>/);
    expect(html).toMatch(/<td>DDINTER<\/td><td>DDInter1951<\/td><td>systemic<\/td><td>ddinter<\/td><td>name<\/td><td>0\.95<\/td>/);
    expect(html).not.toContain(NONE_SENTENCE);
  });

  it("groups interactions by severity, most severe first, and links known partners", async () => {
    getSubstance.mockResolvedValue(warfarin);
    const html = await render("BDS-000001");
    const major = html.indexOf("Major (1)"), moderate = html.indexOf("Moderate (1)"), minor = html.indexOf("Minor (1)");
    expect(major).toBeGreaterThan(-1);
    expect(moderate).toBeGreaterThan(major);
    expect(minor).toBeGreaterThan(moderate);
    expect(html).toContain('<a href="/substances/BDS-000002">Acetylsalicylic acid</a>');
    expect(html).toContain("Monitor, Avoid");
    expect(html).toContain("Some Herb");
    expect(html).not.toContain('href="/substances/null"');
  });

  it("lists diseases, foods and the products using it", async () => {
    getSubstance.mockResolvedValue(warfarin);
    const html = await render("BDS-000001");
    expect(html).toContain("Bleeding");
    expect(html).toContain("Warfarin increases bleeding risk.");
    expect(html).toContain("Vitamin K rich foods");
    expect(html).toContain("Keep vitamin K intake steady.");
    expect(html).toContain('<a href="/products/W-1">Warin</a>');
  });

  it("calls notFound for an unknown substance", async () => {
    getSubstance.mockResolvedValue(null);
    await expect(SubstancePage({ params: Promise.resolve({ id: "BDS-999999" }) })).rejects.toSatisfy(
      (e: { digest?: string }) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(e.digest)));
  });
});
