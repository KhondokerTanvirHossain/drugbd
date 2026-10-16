import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAPA } from "./fixtures/public";

const getPublicProduct = vi.fn(), getProductInteractions = vi.fn(), getClinicalDrug = vi.fn(), getSession = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicProduct: (id: string) => getPublicProduct(id), getProductInteractions: (id: string, p: number) => getProductInteractions(id, p),
  getClinicalDrug: (id: string) => getClinicalDrug(id) }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1", "x-pathname": "/products/gone" }) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
import ProductPage from "@/app/products/[id]/page";
import ProductNotFound from "@/app/products/[id]/not-found";

const renderProduct = async (id = NAPA.conceptId, sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));
const STUB = { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", status: "not_reviewed", batchId: "0001-pilot", hidden: true };

beforeEach(() => {
  getPublicProduct.mockReset(); getPublicProduct.mockResolvedValue({ ok: true, data: NAPA });
  getProductInteractions.mockReset(); getProductInteractions.mockResolvedValue({ ok: true, data: { conceptId: NAPA.conceptId, page: 0, totalPartners: 0, partners: [], notChecked: [] } });
  getClinicalDrug.mockReset(); getClinicalDrug.mockResolvedValue({ ok: false, status: 404 });
  getSession.mockReset(); getSession.mockResolvedValue(null);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("hidden-record stub (§6.4)", () => {
  it("status 200 page: crumb, h1, id, the not-reviewed pill, both sentences with the batch, and the search button; no data", async () => {
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    const html = await renderProduct(STUB.conceptId);
    expect(html).toContain('<a href="/search">Medicines</a>');
    expect(html).toContain("<h1");
    expect(html).toContain(">G Warfarin</h1>");
    expect(html).toContain('<p class="mono">185-0138-012--g-warfarin</p>');
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).toContain("A pharmacist hasn&#x27;t approved this record yet. Until then IntelliDrugs hides its clinical drug, codes and interactions");
    expect(html).toContain('The record exists and is in review in batch <span class="mono">0001-pilot</span>.');
    expect(html).toContain('href="/search">Search other medicines</a>');
    expect(getProductInteractions).not.toHaveBeenCalled();
    for (const absent of ["DAR", "BDC-", "BDS-", "Warfarin Sodium", "Report a problem"]) expect(html).not.toContain(absent);
  });

  it("a removed record says so in place of the two review sentences, with the same pill", async () => {
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...STUB, status: "removed" } });
    const html = await renderProduct(STUB.conceptId);
    expect(html).toContain("Removed from the DGDA batch file.");
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).not.toContain("is in review in batch");
  });

  it("a reviewer sees the same stub (§2.2 public scope)", async () => {
    getSession.mockResolvedValue({ email: "pharm@example.org", role: "pharmacist" });
    getPublicProduct.mockResolvedValue({ ok: true, data: STUB });
    const html = await renderProduct(STUB.conceptId);
    expect(getPublicProduct).toHaveBeenCalledWith(STUB.conceptId);
    expect(html).toContain("Not yet reviewed by a pharmacist");
    expect(html).not.toContain("pharm@example.org");
  });

  it("an unknown or malformed id is not found; the not-found page names the id", async () => {
    getPublicProduct.mockResolvedValue({ ok: false, status: 404 });
    await expect(renderProduct("gone")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(renderProduct("%E0%A4")).rejects.toThrow("NEXT_NOT_FOUND");
    const html = renderToStaticMarkup(await ProductNotFound());
    expect(html).toContain("<h1>No medicine with the id gone.</h1>");
    expect(html).toContain('href="/search">Search medicines</a>');
    expect(html).not.toContain("<main");
  });

  it("an API failure is not a stub and not a not-found", async () => {
    getPublicProduct.mockResolvedValue({ ok: false, status: 503 });
    await expect(renderProduct("x")).rejects.toThrow(/product read failed/);
  });
});

describe("approved product (§6.5): reads", () => {
  it("reads the P10 page from ?ix= and the other brands only when there are some", async () => {
    await renderProduct(NAPA.conceptId, { ix: "2" });
    expect(getProductInteractions).toHaveBeenCalledWith(NAPA.conceptId, 2);
    expect(getClinicalDrug).not.toHaveBeenCalled();
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, otherBrandsCount: 2 } });
    await renderProduct(NAPA.conceptId, { ix: "-4" });
    expect(getProductInteractions).toHaveBeenLastCalledWith(NAPA.conceptId, 0);
    expect(getClinicalDrug).toHaveBeenCalledWith("BDC-000001");
  });
  it("renders the trade name as the one h1", async () => {
    const html = await renderProduct();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Napa</h1>");
  });
});
