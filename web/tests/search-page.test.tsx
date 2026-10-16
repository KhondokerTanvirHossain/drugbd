import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "@/lib/public-types";

const searchMedicines = vi.fn(), getStats = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  searchMedicines: (q: string, p: number) => searchMedicines(q, p), getStats: () => getStats() }));
import SearchPage from "@/app/search/page";

const render = async (sp: Record<string, string>) => renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve(sp) }));
const PARA: SearchResult = {
  query: "paracetamol", total: 2, hasMore: false, counts: { substances: 1, products: 1 },
  substances: [{ bdsId: "BDS-000001", preferredName: "Acetaminophen", matchedName: "Paracetamol", matchedNameType: "dgda_content",
    otherNameTypes: ["rxnorm", "icd11", "ddinter"], coverage: "full", ddinterIds: ["DDInter14"], keyCodes: { atc: ["N02BE01"], rxcui: ["161"] },
    approvedProductCount: 1 }],
  products: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", darNumber: "186-0030-006", company: "Beximco Pharmaceuticals Ltd.",
    dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg", clinicalDrug: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet" },
    matchedOn: "generic", matchedName: "Paracetamol 500 mg", status: "approved" }],
  suggestion: null,
};

beforeEach(() => {
  searchMedicines.mockReset(); searchMedicines.mockResolvedValue({ ok: true, data: PARA });
  getStats.mockReset(); getStats.mockResolvedValue({ inReviewProducts: 10, batches: [] });
});

describe("/search (§6.3, Board P)", () => {
  it("results header, count line, the substance hit with its DGDA-name line, codes and approved count", async () => {
    const html = await render({ q: "paracetamol" });
    expect(searchMedicines).toHaveBeenCalledWith("paracetamol", 0);
    expect(html).toContain("<h1");
    expect(html).toContain("Results for &quot;paracetamol&quot;");
    expect(html).toContain("1 substance, 1 product");
    expect(html).toContain('<a class="s-res-name" href="/substances/BDS-000001">Acetaminophen</a>');
    expect(html).toContain("Matched <mark>Paracetamol</mark>, the name in the DGDA register. RxNorm, ICD-11 and DDInter call it Acetaminophen.");
    expect(html).toContain('Interaction data found in DDInter 2.0, <span class="mono">DDInter14</span>');
    expect(html).toContain("1 approved product");
    expect(html).toContain('<span class="code-sys">ATC</span>N02BE01');
  });

  it("the approved product hit and the stub hit", async () => {
    searchMedicines.mockResolvedValue({ ok: true, data: { ...PARA, products: [...PARA.products,
      { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", status: "not_reviewed", hidden: true }] } });
    const html = await render({ q: "paracetamol" });
    expect(html).toContain("Filed as <mark>Paracetamol</mark> 500 mg. Clinical drug Acetaminophen 500 mg tablet, <span class=\"mono\">BDC-000001</span>.");
    expect(html).toContain("rv--approved");
    expect(html).toContain('<a class="s-res-name" href="/products/185-0138-012--g-warfarin">G Warfarin</a>');
    expect(html).toContain("A pharmacist hasn&#x27;t approved this record yet, so its substance, codes and interactions are hidden.");
    expect(html).toContain("Not yet reviewed by a pharmacist");
  });

  it("a substance with no data shows the full no-data sentence; not run shows NOT_RUN", async () => {
    const none = { ...PARA, products: [], substances: [{ ...PARA.substances[0], coverage: "none" as const, matchedNameType: "preferred" as const }] };
    searchMedicines.mockResolvedValue({ ok: true, data: none });
    const html = await render({ q: "domperidone" });
    expect(html).toContain('<span class="sev sev--nodata">No interaction data</span>');
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).not.toContain("Matched <mark>");
    searchMedicines.mockResolvedValue({ ok: true, data: { ...none, substances: [{ ...none.substances[0], coverage: "not_run" as const }] } });
    const nr = await render({ q: "domperidone" });
    expect(nr).toContain("Not checked yet: DDInter mapping has not run");
    expect(nr).not.toContain("sev--nodata");
  });

  it("validation never calls the API", async () => {
    expect(await render({ q: "a" })).toContain("Type at least 2 characters.");
    expect(await render({ q: "x".repeat(101) })).toContain("Use 100 characters or fewer.");
    expect(await render({})).toContain("Type at least 2 characters.");
    expect(searchMedicines).not.toHaveBeenCalled();
  });

  it("no results: the hint, the suggestion and the pilot sentence; never 'does not exist'", async () => {
    searchMedicines.mockResolvedValue({ ok: true, data: { ...PARA, total: 0, counts: { substances: 0, products: 0 }, substances: [], products: [],
      suggestion: "Warfarin" } });
    const html = await render({ q: "warfrin" });
    expect(html).toContain("No medicines match &quot;warfrin&quot;");
    expect(html).toContain("Check the spelling, or search by brand, substance or DAR number.");
    expect(html).toContain('href="/search?q=Warfarin">Search for Warfarin</a>');
    expect(html).toContain("IntelliDrugs is in its pilot. 10 medicines are in review now, and more follow in later batches.");
    expect(html).not.toMatch(/does not exist|doesn&#x27;t exist/);
    getStats.mockResolvedValue({ inReviewProducts: 0, batches: [] });
    expect(await render({ q: "warfrin" })).not.toContain("IntelliDrugs is in its pilot.");
  });

  it("pages: 20 per page, Next and Previous, and the cap at index 9", async () => {
    searchMedicines.mockResolvedValue({ ok: true, data: { ...PARA, total: 400, hasMore: true } });
    const p1 = await render({ q: "napa", page: "1" });
    expect(p1).toContain('href="/search?q=napa&amp;page=2">Next page</a>');
    expect(p1).toContain('href="/search?q=napa&amp;page=0">Previous page</a>');
    const p9 = await render({ q: "napa", page: "9" });
    expect(p9).toContain("Showing the first 200 results. Refine your search to see more.");
    expect(p9).not.toContain("Next page");
    await render({ q: "napa", page: "57" });
    expect(searchMedicines).toHaveBeenLastCalledWith("napa", 9);
    await render({ q: "napa", page: "x" });
    expect(searchMedicines).toHaveBeenLastCalledWith("napa", 0);
  });
});
