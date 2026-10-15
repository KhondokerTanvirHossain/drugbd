import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComparisonTable from "@/components/review/detail/ComparisonTable";
import EvidenceContent from "@/components/review/detail/EvidenceContent";
import Interactions from "@/components/review/detail/Interactions";
import type { ReviewItem, Source } from "@/lib/review-types";
import { pilotItem } from "./fixtures/pilot";

/*
 * The API builds every URL (SourceLinks.java, pinned by SourceLinksTest with the same pilot codes). This fixture carries the
 * §5.6.6 links for Napa's codes as the API sends them; the web must render exactly these hrefs and never build one.
 */
const FETCHED = "2026-10-11T19:00:00Z";   // 12/10/2026 in Dhaka
const SRC: Record<string, (c: string) => Source> = {
  RXCUI: (c) => ({ url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${c}`, label: "RxNav", fetchedAt: FETCHED }),
  ATC: (c) => ({ url: `https://atcddd.fhi.no/atc_ddd_index/?code=${c}&showdescription=no`, label: "WHO ATC/DDD Index", fetchedAt: FETCHED }),
  DRUGBANK: (c) => ({ url: `https://go.drugbank.com/drugs/${c}`, label: "DrugBank", fetchedAt: FETCHED }),
  SNOMEDCT: (c) => ({ url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm=${c}`, label: "RxNav (SNOMED CT search)", fetchedAt: FETCHED }),
  ICD11_XM: (c) => ({ url: "https://icd.who.int/browse/latest-release/mms/en", label: `Search ICD-11 for ${c}`, fetchedAt: FETCHED }),
  DDINTER: (c) => ({ url: `https://ddinter2.scbdd.com/server/drug-detail/${c}/`, label: "DDInter 2.0", fetchedAt: FETCHED }),
};
function napaWithSources(): ReviewItem {
  const item = pilotItem("napa");
  return { ...item, brand: { ...item.brand!, source: { url: item.sourceUrl, label: "DGDA register (OCL)", fetchedAt: FETCHED } },
    ingredients: item.ingredients.map((g) => ({ ...g, codes: g.codes.map((c) => ({ ...c, source: SRC[c.system](c.code) })),
      ddinter: { ...g.ddinter, entries: g.ddinter.entries.map((e) => ({ ...e, source: SRC.DDINTER(e.ddinterId) })) } })) };
}
const link = (href: string, label: string) =>
  `<a class="src-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> (opens in a new tab)</span></a>`;

describe("source links on the desk (§5.6.6, §11.2)", () => {
  const item = napaWithSources();

  it("the comparison table: the DGDA register in the header, the XM code's ICD-11 search, every code chip", () => {
    const html = r(<ComparisonTable item={item} />);
    expect(html).toContain(`DGDA source ${link("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/", "DGDA register (OCL)")} fetched on 12/10/2026`);
    expect(html).toContain(`<span class="mono">XM5DJ7</span> ${link("https://icd.who.int/browse/latest-release/mms/en", "Search ICD-11 for XM5DJ7")}`);
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161"');
    expect(html).toContain('href="https://atcddd.fhi.no/atc_ddd_index/?code=N02BE01&amp;showdescription=no"');
    expect(html).toContain('href="https://go.drugbank.com/drugs/DB00316"');
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&amp;searchTerm=387517004"');
    expect(html).toContain(`DDInter14<span class="code-meta">drugbank, 1.0, systemic</span></span> ${link("https://ddinter2.scbdd.com/server/drug-detail/DDInter14/", "DDInter 2.0")} fetched on 12/10/2026`);
  });

  it("the ingredient block: the chosen entry carries its DDInter link", () => {
    expect(r(<Interactions item={item} />)).toContain(
      `<span class="mono">DDInter14 (systemic)</span> ${link("https://ddinter2.scbdd.com/server/drug-detail/DDInter14/", "DDInter 2.0")}`);
  });

  it("the evidence drawer's Sources: one row per source the record uses, with codes and dates", () => {
    const html = r(<EvidenceContent item={item} />);
    expect(html).toContain("<h5>Sources</h5><p class=\"dr-note\">Where each value came from. Links open the source&#x27;s own page.</p>");
    for (const label of ["DGDA register (OCL)", "RxNav", "WHO ATC/DDD Index", "DrugBank", "ICD-11", "DDInter 2.0"])
      expect(html).toContain(`<dt>${label}</dt>`);
    expect(html).toContain(`<span class="mono">161</span> ${link("https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161", "RxNav")} fetched on 12/10/2026`);
  });

  it("without sources from the API nothing links and no Sources section shows (a code that failed its pattern)", () => {
    const plain = pilotItem("napa");
    expect(r(<ComparisonTable item={plain} />)).not.toContain("src-link");
    expect(r(<EvidenceContent item={plain} />)).not.toContain("<h5>Sources</h5>");
  });
});
