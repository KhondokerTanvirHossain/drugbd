import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Batch, CheckResult, Product } from "@/lib/api";

const listBatches = vi.fn();
const getBatch = vi.fn();
const checkInteractions = vi.fn();
vi.mock("@/lib/api", () => ({
  listBatches: () => listBatches(),
  getBatch: (id: string) => getBatch(id),
  checkInteractions: (ids: string[]) => checkInteractions(ids),
}));
import CheckPage from "@/app/check/page";

const product = (conceptId: string, tradeName: string, content: string): Product => ({
  conceptId, darNumber: "D", tradeName, company: "Co", dosageForm: "Tablet", genericContentRaw: content,
  qualityFlag: null, ingredients: [], parseStatus: "parsed", parseNote: null, clinicalDrug: null,
});
const batch = (batchId: string, products: (Product | null)[]): Batch => ({
  batchId, status: "in_review", runAt: "2026-10-11T00:00:00Z", itemCount: products.length,
  items: products.map((p, n) => ({ conceptId: p?.conceptId ?? `missing-${n}`, review: "pending", note: null,
    extracted: p, sourceJson: null, stages: [] })),
});

const WARIN = product("W-1", "Warin", "Warfarin Sodium 5 mg");
const ECOSPRIN = product("A-1", "Ecosprin", "Aspirin 75 mg");
const MOTIGUT = product("D-1", "Motigut", "Domperidone 10 mg");

const render = async (ids?: string | string[]) =>
  renderToStaticMarkup(await CheckPage({ searchParams: Promise.resolve(ids === undefined ? {} : { ids }) }));

/** The checkbox tag for one product, whatever React's attribute order. */
const checkbox = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]*name="ids"[^>]*value="${id}"[^>]*/>`))?.[0] ?? "";

const emptyResult = (over: Partial<CheckResult>): CheckResult => ({
  products: [], alerts: [], duplicates: [], noData: [], ...over });

beforeEach(() => {
  listBatches.mockReset(); getBatch.mockReset(); checkInteractions.mockReset();
  listBatches.mockResolvedValue([{ ...batch("0001-pilot", []), items: [] }, { ...batch("0002", []), items: [] }]);
  getBatch.mockImplementation(async (id: string) => id === "0001-pilot"
    ? batch(id, [WARIN, MOTIGUT, null])
    : batch(id, [ECOSPRIN, WARIN]));
});

describe("check page", () => {
  it("renders a GET form with one checkbox per loaded product across batches", async () => {
    const html = await render();
    expect(getBatch).toHaveBeenCalledWith("0001-pilot");
    expect(getBatch).toHaveBeenCalledWith("0002");
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/check"');
    for (const id of ["W-1", "A-1", "D-1"]) {
      expect(checkbox(html, id)).toContain('type="checkbox"');
      expect(checkbox(html, id)).not.toContain("checked");
    }
    expect(html.match(/value="W-1"/g)).toHaveLength(1);          // same product in two batches: one checkbox
    expect(html).not.toContain("missing-2");                       // not loaded: no checkbox
    expect(html).not.toContain("<script");
  });

  it("with fewer than 2 ids shows the message without calling the API", async () => {
    const html = await render("W-1");
    expect(html).toContain("Select at least two products to check.");
    expect(checkInteractions).not.toHaveBeenCalled();
    expect(checkbox(html, "W-1")).toContain('checked=""');
  });

  it("counts repeated or blank ids once", async () => {
    await render(["W-1", "W-1", " "]);
    expect(checkInteractions).not.toHaveBeenCalled();
    checkInteractions.mockResolvedValue({ result: emptyResult({}), error: null });
    await render(["W-1", "A-1", "W-1"]);
    expect(checkInteractions).toHaveBeenCalledWith(["W-1", "A-1"]);
  });

  it("renders the No interaction data section for a domperidone product", async () => {
    checkInteractions.mockResolvedValue({ result: emptyResult({
      products: [
        { conceptId: "D-1", tradeName: "Motigut", substances: [{ bdsId: "BDS-000004", name: "Domperidone", coverage: "none" }] },
        { conceptId: "W-1", tradeName: "Warin", substances: [{ bdsId: "BDS-000001", name: "Warfarin", coverage: "full" }] },
      ],
      noData: [{ conceptId: "D-1", bdsId: "BDS-000004", name: "Domperidone" }],
    }), error: null });
    const html = await render(["D-1", "W-1"]);
    expect(checkInteractions).toHaveBeenCalledWith(["D-1", "W-1"]);
    expect(html).toContain("<h2>No interaction data</h2>");
    expect(html).toContain('<a href="/substances/BDS-000004">Domperidone</a>');
    expect(html).toContain("Motigut");
    expect(html).toContain("This does not mean it is safe to combine.");
    expect(html).toContain("No alerts for the substances DDInter 2.0 covers.");
    expect(html.toLowerCase()).not.toContain("no interactions");   // no data is never shown as "no interactions"
  });

  it("says DDInter lists no interactions only when every substance has data", async () => {
    checkInteractions.mockResolvedValue({ result: emptyResult({
      products: [
        { conceptId: "W-1", tradeName: "Warin", substances: [{ bdsId: "BDS-000001", name: "Warfarin", coverage: "full" }] },
        { conceptId: "A-1", tradeName: "Ecosprin", substances: [{ bdsId: "BDS-000002", name: "Aspirin", coverage: "full" }] },
      ],
    }), error: null });
    const html = await render(["W-1", "A-1"]);
    expect(html).toContain("DDInter 2.0 lists no interactions between the selected products.");
    expect(html).not.toContain("<h2>No interaction data</h2>");
  });

  it("renders alerts by severity with interaction and management text and the source line", async () => {
    const side = (conceptId: string, bdsId: string, name: string) => ({ conceptId, bdsId, name });
    checkInteractions.mockResolvedValue({ result: emptyResult({
      products: [
        { conceptId: "W-1", tradeName: "Warin", substances: [] },
        { conceptId: "A-1", tradeName: "Ecosprin", substances: [] },
      ],
      alerts: [
        { severity: "major", a: side("W-1", "BDS-000001", "Warfarin"), b: side("A-1", "BDS-000002", "Aspirin"),
          actions: ["Avoid"], interaction: "Bleeding risk rises.", management: "Avoid the combination.",
          routeAssumed: false, source: "DDInter 2.0" },
        { severity: "minor", a: side("W-1", "BDS-000001", "Warfarin"), b: side("A-1", "BDS-000009", "Caffeine"),
          actions: [], interaction: null, management: null, routeAssumed: true, source: "DDInter 2.0" },
      ],
    }), error: null });
    const html = await render(["W-1", "A-1"]);
    const major = html.indexOf("<h3>Major (1)</h3>"), minor = html.indexOf("<h3>Minor (1)</h3>");
    expect(major).toBeGreaterThan(-1);
    expect(minor).toBeGreaterThan(major);
    expect(html).toContain("Bleeding risk rises.");
    expect(html).toContain("Avoid the combination.");
    expect(html).toContain("Source: DDInter 2.0");
    expect(html).toContain("Warfarin (Warin)");
    expect(html).toContain("Aspirin (Ecosprin)");
    expect(html).toContain("Interaction text not available from DDInter.");
    expect(html).toContain("Route assumed");
    expect(html).not.toContain("<h2>No interaction data</h2>");
  });

  it("renders the same-substance section", async () => {
    checkInteractions.mockResolvedValue({ result: emptyResult({
      products: [
        { conceptId: "N-1", tradeName: "Napa", substances: [] },
        { conceptId: "N-2", tradeName: "Ace", substances: [] },
      ],
      duplicates: [{ bdsId: "BDS-000005", name: "Acetaminophen", conceptIds: ["N-1", "N-2"] }],
    }), error: null });
    const html = await render(["N-1", "N-2"]);
    expect(html).toContain("<h2>Same substance in more than one product</h2>");
    expect(html).toContain('<a href="/substances/BDS-000005">Acetaminophen</a>');
    expect(html).toContain("Napa, Ace");
  });

  it("shows the API's error message", async () => {
    checkInteractions.mockResolvedValue({ result: null, error: "Product not found: X-9" });
    const html = await render(["W-1", "X-9"]);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Product not found: X-9");
  });

  it("still checks when the product list cannot be loaded", async () => {
    listBatches.mockRejectedValue(new Error("API error 500"));
    checkInteractions.mockResolvedValue({ result: emptyResult({}), error: null });
    const html = await render(["W-1", "A-1"]);
    expect(checkInteractions).toHaveBeenCalledWith(["W-1", "A-1"]);
    expect(html).toContain("The product list is temporarily unavailable.");
    expect(checkbox(html, "W-1")).toContain('checked=""');                // selected ids stay in the form
  });
});
