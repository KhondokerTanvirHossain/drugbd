import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Interactions from "@/components/review/detail/Interactions";
import { NO_DATA_SENTENCE, NOT_RUN } from "@/lib/copy";
import type { BatchPairs, IngredientSummary, OtherPair, OtherPairs, OtherPartner, ReviewItem } from "@/lib/review-types";
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
    expect(html).not.toContain("With other medicines");
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
    expect(html).toContain('<h3 class="withH">With other medicines</h3>');
    expect(html).toContain('<h4 class="subH">In batch 0001-pilot</h4>');
    expect(text).toContain("3 pairs found in DDInter 2.0. 4 pairs not checked.");
    expect(html).toContain('aria-label="Batch pairs by severity"');
  });

  it("pairs with text are cards, management first, interaction otherwise, with mono ids", () => {
    expect(html).toContain('<h5 class="pair-names">Warfarin + Acetylsalicylic acid</h5>');
    expect(html).toContain('<p class="pair-meta">From DDInter 2.0. With Aspirin (record 2). Action in DDInter: synergy. <span class="mono">DDInter1951/DDInter20</span></p>');
    expect(html).toContain('<span class="whenClosed">Management, truncated.</span><span class="whenOpen">Management, in full.</span>');
    expect(html).toContain("Interaction description, truncated. DDInter has no management text for this pair.");
    expect(html.indexOf("Acetylsalicylic acid</h5>")).toBeLessThan(html.indexOf("Clarithromycin</h5>"));
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

describe("P1C: the combination fix (§5.6.2)", () => {
  it("one no-data ingredient no longer hides the other ingredient's pairs; its own pairs are not checked", () => {
    const base = pilotItem("amoxycillin");
    const [clav, amox] = base.ingredients;
    const g = (n: string, i: number) => ({ conceptId: n, tradeName: n, index: i });
    const item = pilotItem("amoxycillin", {
      ingredients: [{ ...clav, coverage: { coverage: "none", note: "" }, ddinter: { chosen: [], entries: [] } }, amox],
      batchPairs: { totalBatchPairs: 28,
        pairs: [{ ddinterA: "DDInter1951", ddinterB: "DDInter83", nameA: "Warfarin", nameB: "Amoxicillin", substance: "Amoxicillin",
          partnerSubstance: "Warfarin", severity: "moderate", actions: ["synergy"], interaction: "May increase the INR.",
          management: "Monitor the INR.", partners: [g("G Warfarin", 6)] }],
        notChecked: [{ substance: "Clavulanic acid", partnerSubstance: "Warfarin", partners: [g("G Warfarin", 6)], reason: "no_data",
          side: "this", route: "systemic" }] } });
    const html = r(<Interactions item={item} />);
    expect(html).toContain('<h3 class="withH">With other medicines</h3>');
    expect(html).toContain('<h5 class="pair-names">Amoxicillin + Warfarin</h5>');
    expect(strip(html)).toContain(`Not checked. Clavulanic acid: ${NO_DATA_SENTENCE}`);
    expect(html).toContain('<span class="sev sev--nodata">Clavulanic acid + Warfarin</span>');
  });
});

describe("P1C: every pair card says it is from DDInter and shows its senior-review state (§5.6.2)", () => {
  const card = (over: Partial<BatchPairs["pairs"][number]>) => pilotItem("g-warfarin", { batchPairs: { totalBatchPairs: 28, notChecked: [],
    pairs: [{ ddinterA: "DDInter1951", ddinterB: "DDInter20", nameA: "Warfarin", nameB: "Acetylsalicylic acid", substance: "Warfarin",
      partnerSubstance: "Acetylsalicylic acid", severity: "major", actions: ["synergy"], interaction: "May increase bleeding.",
      management: "Avoid the combination.", partners: [{ conceptId: "a", tradeName: "Aspirin", index: 2 }], ...over }] } });

  it("the pair link follows the source line and the state line is last; never green", () => {
    const html = r(<Interactions item={card({
      source: { url: "https://ddinter2.scbdd.com/server/interact/3039/", label: "Full record in DDInter 2.0", fetchedAt: null },
      pairReview: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: false, note: null } })} />);
    expect(html).toContain('Management, truncated.</span><span class="whenOpen">Management, in full.</span> <a class="src-link" href="https://ddinter2.scbdd.com/server/interact/3039/" target="_blank" rel="noopener noreferrer">Full record in DDInter 2.0<span class="sr-only"> (opens in a new tab)</span></a>');
    expect(html).toContain('<p class="pair-review">Pair reviewed by a senior pharmacist on 15/10/2026</p></article>');
    expect(html).not.toMatch(/rv--approved/);
  });

  it("an open pair issue shows its note to every reviewer; the pair, its severity and its text stay (G3)", () => {
    const html = r(<Interactions item={card({ pairReview: { state: "issue", at: "2026-10-15T03:00:00Z", mine: false, note: "severity looks low" } })} />);
    expect(strip(html)).toContain("Pair issue reported by a senior pharmacist on 15/10/2026. Note: severity looks low");
    expect(html).toContain('<span class="sev sev--major">Major</span>');
    expect(html).toContain("Avoid the combination.");
  });
});

describe("P1C: In other batches (§5.6.2)", () => {
  const partner = (n: number, approved: boolean): OtherPartner => ({ conceptId: `c${n}`, tradeName: `Brand ${n}`, batchId: `b-${n}`, approved });
  const other = (approved: boolean, count: number, over: Partial<OtherPair> = {}): OtherPair => ({
    ddinterA: "DDInter14", ddinterB: "DDInter926", nameA: "Acetaminophen", nameB: "Ibuprofen", substance: "Acetaminophen",
    partnerSubstance: "Ibuprofen", partnerBdsId: "BDS-000012", severity: "moderate", actions: ["synergy"],
    interaction: "May increase the risk of bleeding.", management: null, source: null,
    pairReview: { state: "not_reviewed", at: null, mine: false, note: null },
    partners: Array.from({ length: Math.min(count, 5) }, (_, i) => partner(i + 1, approved)), partnerCount: count, ...over });
  const napa = (otherPairs: OtherPairs) => pilotItem("napa", { otherPairs });

  it("two subgroups by the partner's status, each with its summary and chips", () => {
    const html = r(<Interactions item={napa({ otherBatches: 2, notChecked: [], pairs: [other(true, 1), other(false, 2, { severity: "minor" })] })} />);
    expect(html).toContain('<h4 class="subH">In other batches</h4>');
    expect(html).toContain('<h5 class="subH">With approved medicines</h5>');
    expect(html).toContain('<h5 class="subH">With medicines not yet approved</h5>');
    expect(html.match(/aria-label="Pairs with other batches by severity"/g)).toHaveLength(2);
    expect(html).toContain('<h6 class="pair-names">Acetaminophen + Ibuprofen</h6>');
    expect(html).toContain('id="other-a-DDInter14-DDInter926-text"');
    expect(html).toContain('id="other-n-DDInter14-DDInter926-text"');
    // only the In other batches block: the batch block still says "None of the 28 batch pairs … involve Acetaminophen"
    // (napa's batchPairs.pairs is empty while Acetaminophen has a chosen entry)
    const otherBlock = html.slice(html.indexOf('<h4 class="subH">In other batches</h4>'));
    expect(strip(otherBlock)).not.toContain("None of the");
    expect(strip(otherBlock)).not.toContain("DDInter 2.0 lists no interaction between");
  });

  it("partner lines show three, then 'and {k} more'; the details list the five returned and say '{s} of {n} medicines'", () => {
    const html = r(<Interactions item={napa({ otherBatches: 7, notChecked: [], pairs: [other(true, 7)] })} />);
    expect(strip(html)).toContain("With Brand 1 (batch b-1), Brand 2 (batch b-2), Brand 3 (batch b-3) and 4 more. ");
    expect(html).toContain("<summary>5 of 7 medicines</summary>");
    for (let n = 1; n <= 5; n++) expect(html).toContain(`<a href="/review/b-${n}/c${n}">Brand ${n} (batch <span class="mono">b-${n}</span>)</a>`);
    expect(strip(html)).toContain("and 2 more.");
    expect(html).not.toContain("See every brand");
    const senior = r(<Interactions item={napa({ otherBatches: 7, notChecked: [], pairs: [other(true, 7)] })} role="senior" />);
    expect(senior).toContain('<a href="/review/substances/BDS-000012">See every brand of Ibuprofen</a>');
    for (const role of ["pharmacist", "engineer"] as const)
      expect(r(<Interactions item={napa({ otherBatches: 7, notChecked: [], pairs: [other(true, 7)] })} role={role} />)).not.toContain("See every brand");
    expect(r(<Interactions item={napa({ otherBatches: 1, notChecked: [], pairs: [other(false, 2)] })} />)).toContain("<summary>All 2 medicines</summary>");
  });

  it("no partners in other batches: no no-interaction claim (Review Focus 2)", () => {
    const html = strip(r(<Interactions item={napa({ otherBatches: 0, pairs: [], notChecked: [] })} />));
    expect(html).toContain("There are no other batches yet.");
    expect(html).not.toContain("DDInter 2.0 lists no interaction between");
  });

  it("other batches exist and every pair with them was checked: the no-interaction line with its caveat", () => {
    expect(strip(r(<Interactions item={napa({ otherBatches: 2, pairs: [], notChecked: [] })} />))).toContain(
      "DDInter 2.0 lists no interaction between Napa and the medicines in other batches. This is not a guarantee that they are safe to combine.");
  });

  it("a no-data substance names its pairs with other batches on a second line, each pair once", () => {
    const nc = (approved: boolean) => ({ substance: "Domperidone", partnerSubstance: "Ibuprofen", partnerBdsId: "BDS-000012",
      partners: [partner(1, approved)], partnerCount: 1, reason: "no_data" as const, side: "this" as const, route: "systemic" });
    const item = pilotItem("domperidone", { otherPairs: { otherBatches: 1, pairs: [], notChecked: [nc(true), nc(false)] } });
    const html = r(<Interactions item={item} />);
    expect(strip(html)).toContain("Not checked, 1 pair with medicines in other batches:");
    expect(html.match(/<span class="sev sev--nodata">Domperidone \+ Ibuprofen<\/span>/g)).toHaveLength(1);
  });
});
