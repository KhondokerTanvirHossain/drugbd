import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckResult, LoadedProduct } from "@/lib/api";

const listLoadedProducts = vi.fn();
const checkInteractions = vi.fn();
const listBatches = vi.fn();
const getBatch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listLoadedProducts: (...args: unknown[]) => listLoadedProducts(...args),
  checkInteractions: (...args: unknown[]) => checkInteractions(...args),
  listBatches: () => listBatches(),
  getBatch: (id: string) => getBatch(id),
}));
const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
import CheckPage from "@/app/check/page";

const loaded = (conceptId: string, tradeName: string, dosageForm = "Tablet"): LoadedProduct => ({ conceptId, tradeName, dosageForm });
const WARIN = loaded("W-1", "Warin");
const ECOSPRIN = loaded("A-1", "Ecosprin");
const MOTIGUT = loaded("D-1", "Motigut", "Suspension");

const render = async (ids?: string | string[], extra: Record<string, string> = {}) =>
  renderToStaticMarkup(await CheckPage({ searchParams: Promise.resolve({ ...(ids === undefined ? {} : { ids }), ...extra }) }));

/** The checkbox tag for one product, whatever React's attribute order. */
const checkbox = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]*name="ids"[^>]*value="${id}"[^>]*/>`))?.[0] ?? "";

const emptyResult = (over: Partial<CheckResult>): CheckResult => ({
  products: [], alerts: [], duplicates: [], noData: [], notReviewed: [], ...over });

beforeEach(() => {
  listLoadedProducts.mockReset(); checkInteractions.mockReset(); listBatches.mockReset(); getBatch.mockReset();
  getSession.mockReset(); getSession.mockResolvedValue(null);
  listLoadedProducts.mockResolvedValue([ECOSPRIN, MOTIGUT, WARIN]);
});

describe("check page visibility", () => {
  it("lists products from /v1/products/loaded with scope=public for anonymous visitors, not from batches", async () => {
    const html = await render();
    expect(listLoadedProducts).toHaveBeenCalledWith();
    expect(listBatches).not.toHaveBeenCalled();
    expect(getBatch).not.toHaveBeenCalled();
    expect(html).toContain(" Motigut (Suspension)");
  });

  it("reads the public list and checks with public scope for reviewers too (spec §2.2)", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    checkInteractions.mockResolvedValue({ result: emptyResult({}), error: null });
    const html = await render(["W-1", "A-1"]);
    expect(listLoadedProducts).toHaveBeenCalledWith();
    expect(checkInteractions).toHaveBeenCalledWith(["W-1", "A-1"]);
    expect(html).toContain("Products reviewed by a pharmacist");
    expect(html).not.toContain("reviewer view");
    expect(html).not.toContain("pharm@example.org");
  });

  it("renders notReviewed as a Not yet reviewed section and never as no interactions", async () => {
    checkInteractions.mockResolvedValue({ result: emptyResult({
      products: [{ conceptId: "W-1", tradeName: "Warin", substances: [{ bdsId: "BDS-000001", name: "Warfarin", coverage: "full" }] }],
      notReviewed: [{ conceptId: "H-9" }],
    }), error: null });
    const html = await render(["W-1", "H-9"]);
    expect(checkInteractions).toHaveBeenCalledWith(["W-1", "H-9"]);
    expect(html).toContain("<h2>Not yet reviewed</h2>");
    expect(html).toMatch(/<li>H-9<\/li>/);
    expect(html).toContain("not yet reviewed by a pharmacist, so they were not checked");
    expect(html.toLowerCase()).not.toContain("no interactions");
    expect(html).not.toContain("DDInter 2.0 lists no interactions between the selected products.");
  });

  it("shows the flag form to signed-in visitors with the selected ids as the target", async () => {
    getSession.mockResolvedValue({ email: "someone@gmail.com", role: "user" });
    checkInteractions.mockResolvedValue({ result: emptyResult({}), error: null });
    const html = await render(["W-1", "A-1"], { flag: "sent" });
    expect(html).toContain("Flag a problem");
    expect(html).toContain('name="targetType" value="check"');
    expect(html).toContain('name="targetId" value="W-1,A-1"');
    expect(html).toContain("Thank you. Your flag was sent to the reviewers.");
    expect(html).not.toContain("someone@gmail.com");
  });
});

describe("check page", () => {
  it("renders a GET form with one checkbox per loaded product", async () => {
    const html = await render();
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/check"');
    for (const id of ["W-1", "A-1", "D-1"]) {
      expect(checkbox(html, id)).toContain('type="checkbox"');
      expect(checkbox(html, id)).not.toContain("checked");
    }
    expect(html.match(/value="W-1"/g)).toHaveLength(1);
    expect(html.indexOf("Ecosprin")).toBeLessThan(html.indexOf("Warin"));   // API order (sorted by trade name)
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

  it("never prints a DDInter placeholder: missing interaction or management text gets the fallback sentences", async () => {
    const side = (conceptId: string, bdsId: string, name: string) => ({ conceptId, bdsId, name });
    checkInteractions.mockResolvedValue({ result: emptyResult({
      products: [
        { conceptId: "W-1", tradeName: "Warin", substances: [] },
        { conceptId: "A-1", tradeName: "Ecosprin", substances: [] },
      ],
      alerts: [
        { severity: "major", a: side("W-1", "BDS-000001", "Warfarin"), b: side("A-1", "BDS-000002", "Aspirin"),
          actions: [], interaction: "None", management: "-", routeAssumed: false, source: "DDInter 2.0" },
        { severity: "moderate", a: side("W-1", "BDS-000001", "Warfarin"), b: side("A-1", "BDS-000003", "Herb"),
          actions: [], interaction: "  ", management: "", routeAssumed: false, source: "DDInter 2.0" },
        { severity: "minor", a: side("W-1", "BDS-000001", "Warfarin"), b: side("A-1", "BDS-000004", "Tea"),
          actions: [], interaction: "Real effect.", management: "N/A", routeAssumed: false, source: "DDInter 2.0" },
      ],
    }), error: null });
    const html = await render(["W-1", "A-1"]);
    expect(html.match(/Interaction text not available from DDInter\./g)).toHaveLength(2);
    expect(html.match(/DDInter 2\.0 gives no management text for this pair\./g)).toHaveLength(3);
    expect(html).toContain("Real effect.");
    expect(html).not.toMatch(/>\s*(None|-|N\/A)\s*</);
    expect(html).not.toContain("Management: -");
    expect(html).not.toContain("Management: N/A");
    expect(html).not.toMatch(/\bNone\b/);
  });

  it("shows severity unknown as 'Severity not classified by DDInter', never the bare word", async () => {
    const side = (conceptId: string, bdsId: string, name: string) => ({ conceptId, bdsId, name });
    checkInteractions.mockResolvedValue({ result: emptyResult({
      products: [
        { conceptId: "W-1", tradeName: "Warin", substances: [] },
        { conceptId: "A-1", tradeName: "Ecosprin", substances: [] },
      ],
      alerts: [{ severity: "unknown", a: side("W-1", "BDS-000001", "Warfarin"), b: side("A-1", "BDS-000002", "Aspirin"),
        actions: [], interaction: "Some effect.", management: "Monitor.", routeAssumed: false, source: "DDInter 2.0" }],
    }), error: null });
    const html = await render(["W-1", "A-1"]);
    expect(html).toContain("<h3>Severity not classified by DDInter (1)</h3>");
    expect(html).toMatch(/<span class="badge[^"]*"[^>]*>Severity not classified by DDInter<\/span>/);
    expect(html.toLowerCase()).not.toContain("unknown");
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
    listLoadedProducts.mockRejectedValue(new Error("API error 500"));
    checkInteractions.mockResolvedValue({ result: emptyResult({}), error: null });
    const html = await render(["W-1", "A-1"]);
    expect(checkInteractions).toHaveBeenCalledWith(["W-1", "A-1"]);
    expect(html).toContain("The product list is temporarily unavailable.");
    expect(checkbox(html, "W-1")).toContain('checked=""');                // selected ids stay in the form
  });
});
