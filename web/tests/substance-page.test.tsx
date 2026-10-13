import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Substance } from "@/lib/api";

const getSubstance = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getSubstance: (...args: unknown[]) => getSubstance(...args),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
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

beforeEach(() => { getSubstance.mockReset(); getSession.mockReset(); getSession.mockResolvedValue(null); });

describe("substance page visibility (spec §2.2: public scope for every session)", () => {
  it("shows only the not-reviewed text for a hidden substance", async () => {
    getSubstance.mockResolvedValue({ bdsId: "BDS-000009", preferredName: "Secretine", reviewStatus: "pending", hidden: true });
    const html = await render("BDS-000009");
    expect(getSubstance).toHaveBeenCalledWith("BDS-000009");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    for (const absent of ["Secretine", "Names", "Codes", "Drug interactions", "Products using it", NONE_SENTENCE])
      expect(html).not.toContain(absent);
  });

  it("a reviewer reads the same public page: no badge, and the flag form", async () => {
    getSession.mockResolvedValue({ email: "eng@example.org", role: "engineer" });
    getSubstance.mockResolvedValue(warfarin);
    const html = await render("BDS-000001");
    expect(getSubstance).toHaveBeenCalledWith("BDS-000001");
    expect(html).not.toContain("unreviewed");
    expect(html).toContain('<a href="/products/W-1">Warin</a> (Acme)</li>');
    expect(html).toContain("Flag a problem");
    expect(html).not.toContain("eng@example.org");
  });

  it("anonymous visitors see no badge and no flag form", async () => {
    getSubstance.mockResolvedValue(warfarin);
    const html = await render("BDS-000001");
    expect(html).not.toContain("unreviewed");
    expect(html).not.toContain("Flag a problem");
  });
});

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

  it("never prints a DDInter placeholder in disease or food texts", async () => {
    getSubstance.mockResolvedValue({ ...warfarin,
      diseases: [
        { diseaseName: "Bleeding", severity: "major", text: "None", refs: [], interactionId: "D-1", routeScope: "systemic" },
        { diseaseName: "Liver disease", severity: "moderate", text: null, refs: [], interactionId: "D-2", routeScope: "systemic" },
      ],
      foods: [
        { food: "Alcohol", severity: "minor", mechanism: null, description: " - ", management: "N/A", refs: [],
          interactionId: "F-1", routeScope: "systemic" },
        { food: "Grapefruit", severity: "minor", mechanism: null, description: null, management: null, refs: [],
          interactionId: "F-2", routeScope: "systemic" },
      ] });
    const html = await render("BDS-000001");
    expect(html.match(/Interaction text not available from DDInter\./g)).toHaveLength(4);
    expect(html.match(/DDInter 2\.0 gives no management text for this pair\./g)).toHaveLength(2);
    expect(html).not.toMatch(/<td>\s*(None|-|N\/A|null)\s*<\/td>/);
    // no empty disease / food text cell either (the interactions table's empty Actions cell is unrelated)
    const tables = html.slice(html.indexOf("<h2>Diseases</h2>"), html.indexOf("<h2>Products using it</h2>"));
    expect(tables).not.toMatch(/<td>\s*<\/td>/);
  });

  it("shows severity unknown as 'Severity not classified by DDInter' in interactions, diseases and foods", async () => {
    getSubstance.mockResolvedValue({ ...warfarin,
      interactions: [{ partnerName: "Alpha", partnerBdsId: null, severity: "unknown", actions: [], interactionId: null,
        routeScope: "systemic" }],
      diseases: [{ diseaseName: "Gout", severity: "unknown", text: "Text.", refs: [], interactionId: "D-9", routeScope: "systemic" }],
      foods: [{ food: "Tea", severity: "unknown", mechanism: null, description: "Desc.", management: "Mgmt.", refs: [],
        interactionId: "F-9", routeScope: "systemic" }] });
    const html = await render("BDS-000001");
    expect(html).toContain("<h3>Severity not classified by DDInter (1)</h3>");
    expect(html).toContain("<td>Gout</td><td>Severity not classified by DDInter</td>");
    expect(html).toContain("<td>Tea</td><td>Severity not classified by DDInter</td>");
    expect(html.toLowerCase()).not.toContain("unknown");
  });

  it("calls notFound for an unknown substance", async () => {
    getSubstance.mockResolvedValue(null);
    await expect(SubstancePage({ params: Promise.resolve({ id: "BDS-999999" }) })).rejects.toSatisfy(
      (e: { digest?: string }) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String(e.digest)));
  });
});
