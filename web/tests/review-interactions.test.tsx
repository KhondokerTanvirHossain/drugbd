import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Interactions from "@/components/review/detail/Interactions";
import { NO_DATA_SENTENCE, NOT_RUN } from "@/lib/copy";
import type { BatchPairs, IngredientSummary, ReviewItem } from "@/lib/review-types";
import { pilotItem } from "./fixtures/pilot";

/** The visible text: tags removed and React's entity escapes decoded. */
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("the eye drop (§1.5, §5.6.1, §5.6.4)", () => {
  const html = r(<Interactions item={pilotItem("chloramphenicol")} />);
  it("states the chosen entry", () => {
    expect(html).toContain('Chloramphenicol is checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic).');
  });
  it("counts the chosen entry only, then lists every entry with its total", () => {
    expect(html).toContain("Interaction data found for this product&#x27;s route (ophthalmic): <span class=\"mono\">DDInter352 (ophthalmic)</span>");
    expect(html).toContain('<div class="chipRow" role="group" aria-label="Drug pairs in DDInter 2.0 by severity">');
    expect(html).toContain('<span class="sev sev--major">Major <b class="sev-n">1</b></span>');
    expect(html).toContain('<span class="sev sev--moderate">Moderate <b class="sev-n">111</b></span>');
    expect(strip(html)).toContain("112 drug pairs in total. 0 drug and disease interactions, 0 drug and food interactions.");
    expect(strip(html)).toContain("All DDInter entries for Chloramphenicol: DDInter351 (systemic), DDInter352 (ophthalmic), DDInter353 (otic), 654 drug pairs.");
    expect(html).not.toContain("DDInter351 (systemic)</span>,");
  });
  it("its batch block names 28 batch pairs and none with Chloramphenicol", () => {
    expect(strip(html)).toContain("0 pairs found in DDInter 2.0.");
    expect(strip(html)).toContain("None of the 28 batch pairs from DDInter 2.0 involve Chloramphenicol.");
  });
});

describe("statements for systemic, assumed and route-less products", () => {
  const base = pilotItem("napa");
  const g = base.ingredients[0];
  const assumed = (route: string | null): ReviewItem => ({ ...base,
    clinicalDrug: route === null ? null : { ...base.clinicalDrug!, route },
    ingredients: [{ ...g, ddinter: { ...g.ddinter, chosen: [{ ...g.ddinter.chosen[0], routeAssumed: true }] } }] });

  it("an exact systemic entry needs no statement", () => {
    expect(r(<Interactions item={base} />)).not.toContain("is checked against");
  });
  it("assumed for a route", () => {
    const html = r(<Interactions item={assumed("topical")} />);
    expect(html).toContain("Route assumed: this product&#x27;s route is topical and DDInter has no topical entry for Acetaminophen, so the systemic entry <span class=\"mono\">DDInter14</span> is used.");
    expect(strip(html)).toContain("Interaction data found for this product's route (topical): DDInter14 (systemic), route assumed");
  });
  it("assumed because the product has no route", () => {
    const html = r(<Interactions item={assumed(null)} />);
    expect(html).toContain("Route assumed: this product has no route on record, so the systemic entry <span class=\"mono\">DDInter14</span> is used.");
    expect(strip(html)).toContain("Interaction data found: DDInter14 (systemic), route assumed");
  });
});

describe("no data, no entry for the route, not run, unmapped (§5.6.1, D46)", () => {
  it("no data: the hatch block, always open, with the batch pairs it cannot check", () => {
    const item = pilotItem("domperidone", { batchPairs: { totalBatchPairs: 28, pairs: [], notChecked: [
      { substance: "Domperidone", partnerSubstance: "Warfarin", partners: [{ conceptId: "w", tradeName: "G Warfarin", index: 6 }], reason: "no_data", side: "this", route: "systemic" },
      { substance: "Domperidone", partnerSubstance: "Acetaminophen", partners: [{ conceptId: "n", tradeName: "Napa", index: 8 }], reason: "no_data", side: "this", route: "systemic" },
    ] } });
    const html = r(<Interactions item={item} />);
    expect(html).toContain('<div class="nodata-block hatch" role="note">');
    expect(html).toContain(NO_DATA_SENTENCE);
    expect(html).toContain("Drug, disease and food interactions: no data in DDInter 2.0.");
    expect(html).toContain("Not checked, 2 pairs with this batch:");
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + Warfarin</span>');
    expect(html).not.toContain("With the other medicines in this batch");
    expect(html).not.toContain("<details");
  });

  const napa = pilotItem("napa");
  const g = napa.ingredients[0];
  const one = (ing: IngredientSummary, route: string | null = "systemic"): ReviewItem =>
    ({ ...napa, clinicalDrug: route === null ? null : { ...napa.clinicalDrug!, route }, ingredients: [ing] });

  it("entries but none for the route: plain text, no count, no hatch", () => {
    const ing = { ...g, ddinter: { chosen: [], entries: g.ddinter.entries.map((e) => ({ ...e, routeScope: "otic" })) } };
    const html = r(<Interactions item={one(ing, "ophthalmic")} />);
    expect(html).toContain("No DDInter entry for this product&#x27;s route (ophthalmic). Its pairs are not checked.");
    expect(html).not.toContain("drug pairs in total");
    expect(html).not.toMatch(/hatch|sev--nodata/);
    expect(r(<Interactions item={one(ing, null)} />)).toContain("No DDInter entry fits this product, which has no route on record. Its pairs are not checked.");
  });

  it("not run: the NOT_RUN line, never the no-data sentence or the hatch", () => {
    const html = r(<Interactions item={one({ ...g, coverage: { coverage: "not_run", note: "" }, ddinter: { chosen: [], entries: [] } })} />);
    expect(html).toContain(NOT_RUN);
    expect(html).not.toContain(NO_DATA_SENTENCE);
    expect(html).not.toMatch(/hatch|sev--nodata/);
  });

  it("unmapped: the ingredient has no substance mapping yet", () => {
    const html = r(<Interactions item={one({ ...g, bdsId: null, name: "Newmol", raw: "Newmol", codes: [], names: [],
      coverage: { coverage: "not_run", note: "" }, ddinter: { chosen: [], entries: [] } })} />);
    expect(html).toContain("Not checked: Newmol in Napa has no substance mapping yet.");
  });
});

describe("the batch block (§5.6.2)", () => {
  const partners = (...xs: [string, number][]) => xs.map(([tradeName, index]) => ({ conceptId: tradeName, tradeName, index }));
  const bp: BatchPairs = {
    totalBatchPairs: 28,
    pairs: [
      { ddinterA: "DDInter1951", ddinterB: "DDInter20", nameA: "Warfarin", nameB: "Acetylsalicylic acid", substance: "Warfarin",
        partnerSubstance: "Acetylsalicylic acid", severity: "major", actions: ["synergy"], interaction: "May increase bleeding.",
        management: "Avoid the combination; monitor INR.", partners: partners(["Aspirin", 2]) },
      { ddinterA: "DDInter1951", ddinterB: "DDInter393", nameA: "Warfarin", nameB: "Clarithromycin", substance: "Warfarin",
        partnerSubstance: "Clarithromycin", severity: "moderate", actions: ["metabolism"], interaction: "May increase the effect of warfarin.",
        management: null, partners: partners(["Clarith", 9]) },
      { ddinterA: "DDInter14", ddinterB: "DDInter1951", nameA: "Acetaminophen", nameB: "Warfarin", substance: "Warfarin",
        partnerSubstance: "Acetaminophen", severity: "unknown", actions: ["unknown"], interaction: null, management: null,
        partners: partners(["Napa", 8]) },
    ],
    notChecked: [
      { substance: "Warfarin", partnerSubstance: "Domperidone", partners: partners(["Domperidone", 5]), reason: "no_data", side: "partner", route: "systemic" },
      { substance: "Warfarin", partnerSubstance: "Newmol", partners: partners(["Newdrug", 11]), reason: "unmapped", side: "partner", route: "systemic" },
      { substance: "Warfarin", partnerSubstance: "Mupirocin", partners: partners(["Bactroban", 12]), reason: "no_route", side: "partner", route: "nasal" },
      { substance: "Warfarin", partnerSubstance: "Testmol", partners: partners(["Testa", 13]), reason: "not_run", side: "partner", route: "systemic" },
    ],
  };
  const html = r(<Interactions item={pilotItem("g-warfarin", { batchPairs: bp })} />);
  const text = strip(html);

  it("summary and chips", () => {
    expect(text).toContain("With the other medicines in this batch");
    expect(text).toContain("3 pairs found in DDInter 2.0. 4 pairs not checked.");
    expect(html).toContain('aria-label="Batch pairs by severity"');
  });

  it("pairs with text are cards, management first, interaction otherwise, with mono ids", () => {
    expect(html).toContain('<h4 class="pair-names">Warfarin + Acetylsalicylic acid</h4>');
    expect(html).toContain('<p class="pair-meta">With Aspirin (record 2). Action in DDInter: synergy. <span class="mono">DDInter1951/DDInter20</span></p>');
    expect(html).toContain('<span class="whenClosed">Management, truncated.</span><span class="whenOpen">Management, in full.</span>');
    expect(html).toContain("Interaction description, truncated. DDInter has no management text for this pair.");
    expect(html.indexOf("Acetylsalicylic acid</h4>")).toBeLessThan(html.indexOf("Clarithromycin</h4>"));
  });

  it("pairs without text are grouped, and an unclassified pair is never low risk", () => {
    expect(text).toContain("1 pair with no text in DDInter 2.0");
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">1</b></span>');
    expect(html).toContain("<b>Warfarin + Acetaminophen</b>");
    expect(text).toContain("with Napa (record 8)");
    expect(text).toContain("Action in DDInter: unknown. DDInter 2.0 has no interaction or management text for this pair. A pair whose severity is not classified by DDInter is never treated as low risk.");
  });

  it("no-data pairs are the hatched block; the other reasons are plain lines naming the brand", () => {
    expect(text).toContain(`Not checked. Domperidone: ${NO_DATA_SENTENCE}`);
    expect(html).toContain('<span class="sev sev--nodata">Warfarin + Domperidone</span>');
    expect(text).toContain("Not checked: Newmol in Newdrug has no substance mapping yet.");
    expect(text).toContain("Not checked: Bactroban's route is nasal and DDInter has no entry for Mupirocin on that route.");
    expect(text).toContain("Not checked: DDInter mapping has not run for Testmol in Testa.");
    expect(html.match(/sev--nodata/g)).toHaveLength(1);
  });

  it("same-product pairs say so", () => {
    const combo = r(<Interactions item={pilotItem("amoxycillin", { batchPairs: { totalBatchPairs: 28, pairs: [], notChecked: [
      { substance: "Clavulanic acid", partnerSubstance: "Amoxicillin", partners: [], reason: "same_product", side: "this", route: "systemic" }] } })} />);
    expect(strip(combo)).toContain("Not checked: Clavulanic acid + Amoxicillin are ingredients of this product.");
    expect(strip(combo)).toContain("0 pairs found in DDInter 2.0.");
    expect(strip(combo)).not.toContain("not checked.");
  });
});
