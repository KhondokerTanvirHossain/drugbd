import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PublicPairCard, { pairText } from "@/components/public/PublicPairCard";

const reviewed = { state: "reviewed" as const, reviewedAt: "2026-10-16T05:20:00Z" };
const notReviewed = { state: "not_reviewed" as const, reviewedAt: null };
const card = (over: Partial<Parameters<typeof PublicPairCard>[0]> = {}) => renderToStaticMarkup(<PublicPairCard id="p1" severity="moderate"
  names="Napa + G Warfarin" review={reviewed} text={{ kind: "management", body: "Monitor INR." }} source="Source: DDInter 2.0" heading="h4" {...over} />);

describe("PublicPairCard (§6.5, §6.7.3, P1C D53)", () => {
  it("labels the pair From DDInter 2.0 with its public review state, plain text, never green", () => {
    const html = card();
    expect(html).toContain("From DDInter 2.0");
    expect(html).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
    expect(html).not.toMatch(/rv--approved|--ok|seal/);
    expect(card({ review: notReviewed })).toContain("Pair not yet reviewed by a senior pharmacist");
  });
  it("short management text is in full; long text is truncated with Show full text", () => {
    expect(card()).toContain("Management, full text from DDInter 2.0.");
    const long = card({ text: { kind: "management", body: "x".repeat(201) } });
    expect(long).toContain("Management, truncated. Full text from DDInter 2.0.");
    // Without JS (or after Show full text) the text is unclamped, so the footer must also carry the "full text" wording.
    expect(long).toMatch(/<span class="[^"]*whenClosed[^"]*">Management, truncated\. Full text from DDInter 2\.0\.<\/span>/);
    expect(long).toMatch(/<span class="[^"]*whenOpen[^"]*">Management, full text from DDInter 2\.0\.<\/span>/);
    const longInter = card({ text: { kind: "interaction", body: "y".repeat(201) } });
    expect(longInter).toMatch(/<span class="[^"]*whenClosed[^"]*">Interaction description, truncated\. Full text from DDInter 2\.0\.<\/span>/);
    expect(longInter).toMatch(/<span class="[^"]*whenOpen[^"]*">Interaction description, full text from DDInter 2\.0\.<\/span>/);
    expect(card()).not.toContain("whenOpen");
  });
  it("DDInter placeholders are never printed: a 'None' management falls back to NO_MANAGEMENT plus the interaction text (§3.6)", () => {
    const text = pairText({ management: "None", interaction: "Raises levels." });
    expect(text).toEqual({ kind: "interaction", body: "Raises levels." });
    const html = card({ text });
    expect(html).toContain("DDInter 2.0 gives no management text for this pair.");
    expect(html).toContain("Raises levels.");
    expect(html).not.toMatch(/>None</);
    expect(pairText({ management: " - ", interaction: "n/a" })).toBeNull();
  });
  it("interaction only, no text, and unknown severity with no text", () => {
    const inter = card({ text: { kind: "interaction", body: "Raises levels." } });
    expect(inter).toContain("DDInter 2.0 gives no management text for this pair.");
    expect(inter).toContain("Interaction description, full text from DDInter 2.0.");
    expect(card({ text: null })).toContain("DDInter 2.0 gives no text for this pair.");
    const unknown = card({ severity: "unknown", text: null });
    expect(unknown).toContain("DDInter 2.0 lists this pair with action &quot;unknown&quot; and no text. It is not treated as low risk.");
    expect(unknown).toContain("Severity not classified by DDInter");
  });
  it("puts the label first when asked (checker: directly under the head)", () => {
    const html = card({ reviewFirst: true, meta: "Acetaminophen + Warfarin. Action: synergy" });
    expect(html.indexOf("From DDInter 2.0")).toBeLessThan(html.indexOf("Action: synergy"));
    expect(card({ meta: "Acetaminophen + Warfarin. Action: synergy" }).indexOf("From DDInter 2.0"))
      .toBeGreaterThan(card({ meta: "Acetaminophen + Warfarin. Action: synergy" }).indexOf("Action: synergy"));
  });
});

describe("PublicPairCard: the checker's interaction-description block (§6.7.3, QA D64)", () => {
  const MG = "Avoid unless needed.", DESC = "Bleeding risk.";
  const META = "Warfarin + Acetylsalicylic acid. Action: synergy";
  const EXTRA = <p className="pair-source">ROUTE-LINE</p>;
  const mgOnly = (over: Partial<Parameters<typeof PublicPairCard>[0]> = {}) =>
    card({ reviewFirst: true, meta: META, extra: EXTRA, text: { kind: "management", body: MG }, ...over });
  const both = (over: Partial<Parameters<typeof PublicPairCard>[0]> = {}) => mgOnly({ description: DESC, ...over });

  it("management first, then the description, each text and its label line in its own wrapper", () => {
    expect(both()).toContain(
      '<div class="textBlock"><p class="pair-text open" id="p1-text">Avoid unless needed.</p>'
      + '<p class="pair-source"><span id="p1-text-kind">Management, full text from DDInter 2.0.</span></p></div>'
      + '<div class="textBlock"><p class="pair-text open" id="p1-desc">Bleeding risk.</p>'
      + '<p class="pair-source"><span id="p1-desc-kind">Interaction description, full text from DDInter 2.0.</span></p></div>');
    expect(both()).not.toContain("DDInter 2.0 gives no management text for this pair.");
  });

  it("long texts: each label line carries its own truncated and full wordings (the Expander swaps them per text)", () => {
    const html = both({ text: { kind: "management", body: "m".repeat(201) }, description: "d".repeat(201) });
    expect(html).toContain('<p class="pair-source"><span id="p1-text-kind"><span class="whenClosed">Management, truncated. Full text from DDInter 2.0.</span>'
      + '<span class="whenOpen">Management, full text from DDInter 2.0.</span></span> </p></div>');
    expect(html).toContain('<p class="pair-source"><span id="p1-desc-kind"><span class="whenClosed">Interaction description, truncated. Full text from DDInter 2.0.</span>'
      + '<span class="whenOpen">Interaction description, full text from DDInter 2.0.</span></span> </p></div>');
    // a long management text with a short description: only the management label has the two wordings
    const mixed = both({ text: { kind: "management", body: "m".repeat(201) } });
    expect(mixed).toContain('<span id="p1-desc-kind">Interaction description, full text from DDInter 2.0.</span></p></div>');
    // DDInter text is never rewritten: rendered whole (the clamp is CSS)
    expect(html).toContain(`>${"d".repeat(201)}</p>`);
  });

  it("the label line, the meta, the extra lines and the footer are exactly the management-only card's", () => {
    const b = both(), m = mgOnly();
    expect(b.slice(0, b.indexOf('<div class="textBlock">'))).toBe(m.slice(0, m.indexOf('<p class="pair-text')));
    expect(b.slice(b.indexOf('<p class="pair-source">ROUTE-LINE'))).toBe(m.slice(m.indexOf('<p class="pair-source">ROUTE-LINE')));
    expect(b).toContain("From DDInter 2.0");
    expect(b).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
  });

  it("a DDInter placeholder description, or none, gives today's management-only card (§3.6 ddinterText)", () => {
    for (const d of ["None", " none ", "-", "--", "n/a", "NA", "null", "", "   ", null, undefined]) expect(both({ description: d })).toBe(mgOnly());
  });

  it("description-only and no-text cards are unchanged; the description is never printed twice", () => {
    const inter = { kind: "interaction" as const, body: DESC };
    expect(both({ text: inter })).toBe(mgOnly({ text: inter }));
    expect(both({ text: inter }).split(DESC)).toHaveLength(2);
    expect(both({ text: null })).toBe(mgOnly({ text: null }));
    expect(both({ text: null, severity: "unknown" })).toBe(mgOnly({ text: null, severity: "unknown" }));
  });

  it("only the checker sets it: the product-page and substance-page cards keep their markup (§6.5, §6.6)", () => {
    const root = join(__dirname, "..", "components");
    const users = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.tsx$/.test(f) && !f.endsWith("PublicPairCard.tsx"))
      .filter((f) => readFileSync(join(root, f), "utf8").includes("<PublicPairCard"));
    expect(users.sort()).toEqual([join("check", "CheckResults.tsx"), join("public", "OtherApproved.tsx"), join("public", "SubstanceView.tsx")]);
    for (const f of users) expect(readFileSync(join(root, f), "utf8").includes("description={"), f).toBe(f === join("check", "CheckResults.tsx"));
  });
});
