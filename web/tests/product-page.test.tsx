import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAPA, NAPA_PAIRS } from "./fixtures/public";

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

describe("approved product (§6.5 items 1–5)", () => {
  it("crumb, h1, meta and the verification line", async () => {
    const html = await renderProduct();
    expect(html).toContain('<a href="/search">Medicines</a><span aria-hidden="true">/</span><a href="/substances/BDS-000001">Acetaminophen</a><span aria-hidden="true">/</span><span>Napa</span>');
    expect(html).toContain('<span>Tablet</span><span>Beximco Pharmaceuticals Ltd.</span><span class="mono">DAR 186-0030-006</span>');
    expect(html).toContain('<span class="rv rv--approved">Approved by a pharmacist</span><span>on 14/10/2026, 11:20 Dhaka time</span>');
  });

  it("a combination product's crumb uses the clinical drug display name", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, displayName: "Amoxicillin + Clavulanic acid tablet",
      ingredients: [item, { ...item, bdsId: "BDS-000002", name: "Clavulanic acid" }] } } });
    expect(await renderProduct()).toContain('<span aria-hidden="true">/</span><span>Amoxicillin + Clavulanic acid tablet</span><span aria-hidden="true">/</span><span>Napa</span>');
  });

  it("What's in it: the three trace columns and the names grouped with their sources", async () => {
    const html = await renderProduct();
    expect(html).toContain("What&#x27;s in it");
    expect(html).toContain("Brand, as filed with DGDA");
    expect(html).toContain('<span class="raw">Paracetamol 500 mg</span>');
    expect(html).toContain("Tablet, systemic route");
    expect(html).toContain("Acetaminophen, 500 mg");
    expect(html).toContain("Also listed as Paracetamol");
    expect(html).toMatch(/<li>Paracetamol <span>DGDA register<\/span><\/li><li>acetaminophen <span>RxNorm<\/span><\/li><li>Acetaminophen <span>ICD-11, DDInter<\/span><\/li>/);
  });

  it("Codes: one labelled scroll region with a caption, five columns, the Source links, and the chosen DDInter entry", async () => {
    const html = await renderProduct();
    expect(html).toContain('role="region" aria-label="Codes for Acetaminophen"');
    expect(html).toContain('<caption class="sr-only">Crosswalk codes for Acetaminophen</caption>');
    for (const col of ["System", "Code", "What the system is", "How it was matched", "Source"]) expect(html).toContain(`<th scope="col">${col}</th>`);
    expect(html).toContain("5 code systems and the DDInter entry, for Acetaminophen");
    expect(html).toContain("WHO&#x27;s ICD-11 medicament code. The DGDA register lists ingredients with it.");
    expect(html).toContain("xm, confidence 1.0");
    expect(html).toContain("drugbank, confidence 1.0, systemic");
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=161"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Search ICD-11 for XM5DJ7");
    expect(html).toContain('<span class="code">387517004</span><span class="code">90332006</span>');
  });

  it("a no-data substance's DDInter row is the No data chip; a no-route one is plain text with no hatch", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    const none = { ...item, summary: { ...item.summary!, coverage: { coverage: "none" as const, note: "" }, ddinter: { chosen: [], entries: [] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, ingredients: [none] } } });
    expect(await renderProduct()).toContain('<td><span class="sev sev--nodata">No data</span></td>');
    const noRoute = { ...item, summary: { ...item.summary!, ddinter: { ...item.summary!.ddinter, chosen: [] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, route: "otic", ingredients: [noRoute] } } });
    const html = await renderProduct();
    expect(html).toContain("No entry for route otic");
    expect(html).not.toContain("sev--nodata");
  });
});

describe("approved product (§6.5 item 6)", () => {
  it("data found: the pair count heading, the severity chips and the disease and food counts; never a count of 0 for missing data", async () => {
    const html = await renderProduct();
    expect(html).toContain("From DDInter 2.0, for Acetaminophen");
    expect(html).toContain("645 drug–drug pairs");
    expect(html).toContain('<span class="sev sev--major">Major <b class="sev-n">10</b></span>');
    expect(html).toContain("<b>3</b>drug–disease interactions");
    expect(html).toContain("<b>1</b>drug–food interaction");
    expect(html).not.toContain("is checked against");    // systemic and not assumed: no statement
  });

  it("no data: the hatch block with the full sentence and the second line, no count anywhere", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, ingredients: [{ ...item,
      summary: { ...item.summary!, coverage: { coverage: "none", note: "" }, ddinter: { chosen: [], entries: [] } } }] } } });
    const html = await renderProduct();
    expect(html).toContain("No interaction data in DDInter for this substance. This does not mean it is safe to combine.");
    expect(html).toContain("Drug, disease and food interactions: no data in DDInter 2.0.");
    expect(html).not.toMatch(/\b0 drug–drug pairs/);
  });

  it("an eye drop names the entry it is checked against; no route entry is the plain line", async () => {
    const item = NAPA.clinicalDrug!.ingredients[0];
    const eye = { ...item, name: "Chloramphenicol", summary: { ...item.summary!, name: "Chloramphenicol", ddinter: { chosen: [{ ddinterId: "DDInter352",
      name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic", routeAssumed: false }], entries: [{ ddinterId: "DDInter352",
      name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic", counts: { major: 1, moderate: 111, minor: 0, unknown: 0, total: 112 },
      diseaseCount: 0, foodCount: 0, source: null }] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, route: "ophthalmic", ingredients: [eye] } } });
    const html = await renderProduct();
    expect(html).toContain('Chloramphenicol is checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic).');
    expect(html).toContain("112 drug–drug pairs");
    const none = { ...eye, summary: { ...eye.summary, ddinter: { ...eye.summary.ddinter, chosen: [] } } };
    getPublicProduct.mockResolvedValue({ ok: true, data: { ...NAPA, clinicalDrug: { ...NAPA.clinicalDrug!, route: "otic", ingredients: [none] } } });
    const nr = await renderProduct();
    expect(nr).toContain("No DDInter entry for this product&#x27;s route (otic). Its pairs are not checked.");
    expect(nr).not.toContain("sev--nodata");
  });

  it("With other approved medicines: grouped cards with brands, the label and review state, the unclassified panel, no-data and other lines", async () => {
    getProductInteractions.mockResolvedValue({ ok: true, data: NAPA_PAIRS });
    const html = await renderProduct();
    expect(html).toContain("With other approved medicines");
    expect(html).toContain(">Acetaminophen + Warfarin</h4>");
    expect(html).toContain("With 4 approved brands: G Warfarin, Warin, Coumarol and 1 more. Action: synergy");
    expect(html).toContain("From DDInter 2.0");
    expect(html).toContain("Pair reviewed by a senior pharmacist on 16/10/2026");
    expect(html).toContain("<summary>All 4 brands</summary>");
    expect(html).toContain('<a href="/products/W-7">Warfa</a>');
    expect(html).toContain('Source: DDInter 2.0, <span class="mono">DDInter14</span> + <span class="mono">DDInter1951</span>');
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">2</b></span>');
    expect(html).toContain("Acetaminophen with Amlodipine (pair not yet reviewed by a senior pharmacist) and Acetylsalicylic acid (pair reviewed by a senior pharmacist on 15/10/2026).");
    expect(html).toContain("DDInter 2.0 lists these pairs with action &quot;unknown&quot; and no text. They are not treated as low risk.");
    expect(html).toContain("Not checked: Acetaminophen + Domperidone, in 1 approved brand");
    expect(html).toContain("Not checked: Otimol&#x27;s route is systemic and DDInter has no entry for Oticmol on that route.");
    expect(html).not.toContain("No interaction listed in DDInter 2.0");
  });

  it("pages of 20 partner substances with More and Previous interactions; the empty line on page 0", async () => {
    getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, page: 1, totalPartners: 45 } });
    const html = await renderProduct(NAPA.conceptId, { ix: "1" });
    expect(html).toContain('href="/products/186-0030-006--napa?ix=2#with-other">More interactions</a>');
    expect(html).toContain('href="/products/186-0030-006--napa?ix=0#with-other">Previous interactions</a>');
    getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, totalPartners: 0, partners: [], notChecked: [] } });
    expect(await renderProduct()).toContain("No other approved medicine has an interaction with Acetaminophen listed in DDInter 2.0 yet.");
    getProductInteractions.mockResolvedValue({ ok: false, status: 503 });
    expect(await renderProduct()).not.toContain("With other approved medicines");
  });

  it("a page past the end: the empty line at any ix when there are no partners; otherwise Previous to the last real page", async () => {
    getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, page: 3, totalPartners: 0, partners: [], notChecked: [] } });
    const none = await renderProduct(NAPA.conceptId, { ix: "3" });
    expect(none).toContain("No other approved medicine has an interaction with Acetaminophen listed in DDInter 2.0 yet.");
    expect(none).not.toContain("Previous interactions");
    expect(none).not.toContain("More interactions");
    getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, page: 10000, totalPartners: 45, partners: [], notChecked: [] } });
    const past = await renderProduct(NAPA.conceptId, { ix: "10000" });
    expect(past).toContain('href="/products/186-0030-006--napa?ix=2#with-other">Previous interactions</a>');
    expect(past).not.toContain("?ix=9999");
    expect(past).not.toContain("More interactions");
    expect(past).not.toContain("No other approved medicine has an interaction");
  });

  it("placeholder text from DDInter is never printed on a partner card; unknown severity with only placeholders joins the panel", async () => {
    const [warf, amlo, asa] = NAPA_PAIRS.partners;
    getProductInteractions.mockResolvedValue({ ok: true, data: { ...NAPA_PAIRS, partners: [
      { ...warf, management: "None", interaction: "Raises levels." }, { ...amlo, management: "None", interaction: "-" }, asa] } });
    const html = await renderProduct();
    expect(html).toContain("DDInter 2.0 gives no management text for this pair.");
    expect(html).toContain("Raises levels.");
    expect(html).not.toMatch(/>None</);
    expect(html).not.toMatch(/>-</);
    expect(html).toContain("Acetaminophen with Amlodipine (pair not yet reviewed by a senior pharmacist) and Acetylsalicylic acid (pair reviewed by a senior pharmacist on 15/10/2026).");
  });
});
