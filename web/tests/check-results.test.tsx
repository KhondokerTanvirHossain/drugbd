import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CheckResults, { CheckLegend, CheckSummary } from "@/components/check/CheckResults";
import type { CheckResult, Side } from "@/lib/public-types";
import { emptyCheck } from "./fixtures/public";

const s = (conceptId: string, tradeName: string, name: string, bdsId: string | null, routeScope: string | null = "systemic"): Side =>
  ({ conceptId, tradeName, bdsId, name, routeScope });
const W = s("W", "G Warfarin", "Warfarin", "BDS-3"), A = s("A", "Aspirin", "Acetylsalicylic acid", "BDS-4"),
  D = s("D", "Domperidone", "Domperidone", "BDS-10", null), N = s("N", "Napa", "Acetaminophen", "BDS-1"),
  EYE = s("EYE", "Chloramphenicol", "Chloramphenicol", "BDS-9", "ophthalmic");
const RESULT: CheckResult = emptyCheck({
  summary: { medicines: 5, totalPairs: 6, checkedPairs: 4, alertPairs: 2, noInteractionPairs: 2, notCheckedPairs: 2, notReviewed: 1,
    bySeverity: { major: 1, moderate: 0, minor: 0, unknown: 1 } },
  products: [
    { conceptId: "W", tradeName: "G Warfarin", route: "systemic", substances: [{ bdsId: "BDS-3", name: "Warfarin", coverage: "full", ddinter: [{ ddinterId: "DDInter1951", name: "Warfarin", routeScope: "systemic", routeAssumed: false }] }] },
    { conceptId: "A", tradeName: "Aspirin", route: null, substances: [{ bdsId: "BDS-4", name: "Acetylsalicylic acid", coverage: "full", ddinter: [{ ddinterId: "DDInter20", name: "Acetylsalicylic acid", routeScope: "systemic", routeAssumed: true }] }] },
    { conceptId: "D", tradeName: "Domperidone", route: "systemic", substances: [{ bdsId: "BDS-10", name: "Domperidone", coverage: "none", ddinter: [] }] },
    { conceptId: "N", tradeName: "Napa", route: "systemic", substances: [{ bdsId: "BDS-1", name: "Acetaminophen", coverage: "full", ddinter: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }] }] },
    { conceptId: "EYE", tradeName: "Chloramphenicol", route: "ophthalmic", substances: [{ bdsId: "BDS-9", name: "Chloramphenicol", coverage: "full", ddinter: [{ ddinterId: "DDInter352", name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic", routeAssumed: false }] }] },
  ],
  alerts: [
    { severity: "major", a: W, b: A, actions: ["synergy"], interaction: "Bleeding risk.", management: "Avoid unless needed.", routeAssumed: true,
      ddinterA: "DDInter1951", ddinterB: "DDInter20", interactionId: "3039", source: "DDInter 2.0", pairReview: { state: "reviewed", reviewedAt: "2026-10-16T05:20:00Z" } },
    { severity: "unknown", a: N, b: A, actions: ["unknown"], interaction: null, management: null, routeAssumed: false,
      ddinterA: "DDInter14", ddinterB: "DDInter20", interactionId: null, source: "DDInter 2.0", pairReview: { state: "not_reviewed", reviewedAt: null } },
  ],
  noInteraction: [{ a: EYE, b: W, ddinterA: "DDInter352", ddinterB: "DDInter1951" }, { a: N, b: EYE, ddinterA: "DDInter14", ddinterB: "DDInter352" }],
  notChecked: [{ a: W, b: D, reason: "no_data", side: "b" }, { a: A, b: D, reason: "no_data", side: "b" }],
  duplicates: [{ bdsId: "BDS-3", name: "Warfarin", conceptIds: ["W", "W2"] }],
  notReviewed: [{ conceptId: "HID", tradeName: "Hidasprin" }],
});

describe("checker results (§6.7.3)", () => {
  const html = renderToStaticMarkup(<CheckResults result={RESULT} />);

  it("1. severity groups, Major first, with the label and state directly under the head", () => {
    expect(html).toContain("Major, 1 pair</h3>");
    expect(html.indexOf("Major, 1 pair")).toBeLessThan(html.indexOf("Severity not classified by DDInter, 1 pair"));
    expect(html).toContain(">G Warfarin + Aspirin</h4>");
    expect(html.indexOf("From DDInter 2.0")).toBeLessThan(html.indexOf("Warfarin + Acetylsalicylic acid. Action: synergy"));
    expect(html).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
    expect(html).toContain("Management, full text from DDInter 2.0.");
    expect(html).toContain('Source: DDInter 2.0, <span class="mono">DDInter1951</span> + <span class="mono">DDInter20</span>');
    expect(html).toContain("DDInter 2.0 lists this pair with action &quot;unknown&quot; and no text. It is not treated as low risk.");
  });

  it("the route-assumed line names the brand with no route", () => {
    expect(html).toContain('Route assumed: Aspirin has no route on record, so the systemic entry <span class="mono">DDInter20</span> was used.');
  });

  it("2. no interaction listed, with the caveat", () => {
    expect(html).toContain("No interaction listed in DDInter 2.0, 2 pairs");
    expect(html).toContain("Chloramphenicol + G Warfarin");
    expect(html).toContain("(Chloramphenicol + Warfarin)");
    expect(html).toContain("DDInter 2.0 lists no interaction for these pairs. This is not a guarantee that they are safe to combine.");
  });

  it("3. one hatch block per product and no-data substance, with its not-checked chips", () => {
    expect(html.match(/class="nodata-block hatch"/g)).toHaveLength(1);
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + G Warfarin</span>');
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + Aspirin</span>');
  });

  it("3. a pair of two no-data medicines gives each its own hatch block (API side 'a')", () => {
    const X = s("X", "Xbrand", "Xsub", "BDS-X", null);
    const two = renderToStaticMarkup(<CheckResults result={{ ...RESULT,
      products: [...RESULT.products, { conceptId: "X", tradeName: "Xbrand", route: null, substances: [{ bdsId: "BDS-X", name: "Xsub", coverage: "none", ddinter: [] }] }],
      notChecked: [{ a: D, b: X, reason: "no_data", side: "a" }] }} />);
    expect(two.match(/class="nodata-block hatch"/g)).toHaveLength(2);
    expect(two).toContain('<span class="sev sev--nodata">Domperidone + Xbrand</span>');
    expect(two).toContain('<span class="sev sev--nodata">Xbrand + Domperidone</span>');
  });

  it("5, 6 and 7: duplicates, not reviewed by name, what was checked open for a route-specific entry", () => {
    expect(html).toContain("Same substance in more than one product");
    expect(html).toContain("Not yet reviewed by a pharmacist, 1 product");
    expect(html).toContain("Hidasprin");
    expect(html).toContain("These products were not checked. A pharmacist hasn&#x27;t approved them yet.");
    expect(html).toContain("<details open=\"\"><summary>What was checked</summary>");
    expect(html).toContain('Chloramphenicol: Chloramphenicol checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic)');
    expect(html).toContain('Aspirin: Acetylsalicylic acid checked against <span class="mono">DDInter20</span> Acetylsalicylic acid (systemic), route assumed');
  });

  it("4. other not-checked reasons are plain text, never hatched", () => {
    const other = renderToStaticMarkup(<CheckResults result={{ ...RESULT, notChecked: [
      { a: W, b: s("O", "Otimol", "Oticmol", "BDS-7", null), reason: "no_route", side: "b" },
      { a: s("AMC", "Moxaclav", "Amoxicillin", "BDS-8"), b: s("AMC", "Moxaclav", "Clavulanic acid", "BDS-9"), reason: "same_product", side: "a" },
      { a: W, b: s("UNM", "Newdrug", "Newmol", null, null), reason: "unmapped", side: "b" },
      { a: W, b: s("NR", "Newrun", "Newrunmol", "BDS-6", null), reason: "not_run", side: "b" }] }} />);
    expect(other).toContain("Not checked: Otimol has no route on record and DDInter has no systemic entry for Oticmol.");
    expect(other).toContain("Not checked: Amoxicillin + Clavulanic acid are in the same product, Moxaclav. Pairs inside one product are not checked.");
    expect(other).toContain("Not checked: Newmol in Newdrug has no substance mapping yet.");
    expect(other).toContain("Not checked: DDInter mapping has not run for Newrunmol in Newrun.");
    expect(other).not.toContain("nodata-block");
    expect(other).not.toContain("No interaction data in DDInter for this substance");
  });

  it("the summary heading and the chips; a failed check names only the medicines", () => {
    const sum = renderToStaticMarkup(<CheckSummary result={RESULT} m={5} failed={false} />);
    expect(sum).toContain('<h2 class="s-sum" data-check-summary="">5 medicines · 4 of 6 pairs checked · 2 with an interaction listed · 2 pairs not checked because Domperidone has no interaction data · 1 medicine not yet reviewed by a pharmacist</h2>');
    expect(sum).toContain('<span class="sev sev--nodata">Not checked 2</span>');
    expect(renderToStaticMarkup(<CheckSummary result={null} m={3} failed />)).toContain(">3 medicines</h2>");
    expect(renderToStaticMarkup(<CheckSummary result={null} m={1} failed={false} />)).toContain(">Add at least 2 medicines to check them against each other.</h2>");
  });

  it("8. the legend and the disclaimer", () => {
    const legend = renderToStaticMarkup(<CheckLegend />);
    expect(legend).toContain("Severity legend, from DDInter 2.0");
    expect(legend).toContain("Never treated as low risk, never merged with Minor.");
    expect(legend).toContain("IntelliDrugs is decision support. It is not a substitute for clinical judgement.");
  });
});
