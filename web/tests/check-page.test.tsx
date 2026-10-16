import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAPA, emptyCheck } from "./fixtures/public";

const getPublicProduct = vi.fn(), checkPublic = vi.fn(), suggestProducts = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  getPublicProduct: (id: string) => getPublicProduct(id), checkPublic: (ids: string[]) => checkPublic(ids),
  suggestProducts: (q: string, ex: string[]) => suggestProducts(q, ex) }));
const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
import CheckPage from "@/app/check/page";
import { SCENARIOS } from "@/content/check-scenarios";

const render = async (sp: Record<string, string | string[]>) => renderToStaticMarkup(await CheckPage({ searchParams: Promise.resolve(sp) }));
const approved = (id: string, tradeName: string) => ({ ok: true, data: { ...NAPA, conceptId: id, tradeName } });
const stub = (id: string, tradeName: string) => ({ ok: true, data: { conceptId: id, tradeName, status: "not_reviewed", batchId: "B", hidden: true } });
/** The second line of one selected row (between the brand and its remove button). */
const selLine = (html: string, brand: string) => html.match(new RegExp(`<b>${brand}</b><span>(.*?)</span><button`))?.[1];
const PILL = "Not yet reviewed by a pharmacist";

beforeEach(() => {
  getPublicProduct.mockReset();
  getPublicProduct.mockImplementation(async (id: string) => id === "gone" ? { ok: false, status: 404 }
    : id === "HID" ? stub(id, "Hidasprin") : approved(id, `Brand ${id}`));
  checkPublic.mockReset();
  checkPublic.mockImplementation(async (ids: string[]) => ({ ok: true, data: emptyCheck({ summary: { ...emptyCheck().summary, medicines: ids.length } }) }));
  suggestProducts.mockReset(); suggestProducts.mockResolvedValue({ ok: true, data: [] });
  redirect.mockClear();
});

describe("/check (§6.7)", () => {
  it("the h1 at the top of the side column, the summary h2 opening the main column, one polite live region", async () => {
    const html = await render({});
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Check interactions</h1>");
    expect(html).toContain(">Add at least 2 medicines to check them against each other.</h2>");
    expect(html).toContain("Add medicines with the field on the left, or start from a scenario. Pairs appear here, Major first.");
    expect(html).toContain('id="check-live" class="sr-only" aria-live="polite" aria-atomic="true"');
    expect(html).toContain("No medicines yet.");
    expect(html).toContain('aria-disabled="true"');            // Clear all, never disabled
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });

  it("the no-JavaScript field: label, Find submit, help; the current ids as hidden inputs; remove buttons per medicine", async () => {
    const html = await render({ ids: ["A", "HID"] });
    // React 19's server renderer writes a form's action and method after its other attributes, and a button's name last.
    expect(html).toMatch(/<form [^>]*action="\/check" method="get">/);
    expect(html).toContain("Add a medicine");
    expect(html).toContain('name="q"');
    expect(html).toContain(">Find</button>");
    expect(html).toContain('<input type="hidden" name="ids" value="A"/>');
    expect(html).toMatch(/<button type="submit" value="HID"[^>]* name="remove">/);
    expect(html).toContain('<span class="sr-only">Remove Hidasprin</span>');
    expect(html).toContain("Selected, 2 of 20");
    expect(html).toContain("Acetaminophen 500 mg tablet");
    expect(html).toContain("Not yet reviewed by a pharmacist");
  });

  it("Find lists matches as submit buttons named ids inside the same form, or says nothing matched", async () => {
    suggestProducts.mockResolvedValue({ ok: true, data: [{ conceptId: "N", tradeName: "Napa", dosageForm: "Tablet", status: "approved",
      clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: { name: "Paracetamol", substance: "Acetaminophen" } }] });
    const html = await render({ ids: ["A"], q: "paracetamol" });
    expect(suggestProducts).toHaveBeenCalledWith("paracetamol", ["A"]);
    expect(html).toMatch(/<button type="submit" value="N" name="ids">/);
    expect(html).toContain("Acetaminophen 500 mg tablet. Matches Paracetamol, a name for Acetaminophen");
    suggestProducts.mockResolvedValue({ ok: true, data: [] });
    expect(await render({ q: "zzz" })).toContain("No medicine matches &quot;zzz&quot;.");
  });

  // Review Focus 3
  it("an unknown id is dropped with the info banner; repeated, blank or extra ids redirect to the canonical list", async () => {
    const html = await render({ ids: ["A", "gone", "B"] });
    expect(html).toContain("One medicine in the link no longer exists, so it was removed.");
    expect(checkPublic).toHaveBeenCalledWith(["A", "B"]);
    await expect(render({ ids: ["A", "A", " ", "B"] })).rejects.toThrow("REDIRECT /check?ids=A&ids=B");
    await expect(render({ ids: ["A", "B"], remove: "A" })).rejects.toThrow("REDIRECT /check?ids=B");
    await expect(render({ ids: ["A", "B"], clear: "1" })).rejects.toThrow("REDIRECT /check");
    const many = Array.from({ length: 25 }, (_, i) => `P${i}`);
    await expect(render({ ids: many })).rejects.toThrow(`REDIRECT ${"/check?" + new URLSearchParams(many.slice(0, 20).map((id) => ["ids", id]))}`);
  });

  it("at 20 medicines the field is aria-disabled and readonly with the maximum help text", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `P${i}`);
    const html = await render({ ids: twenty });
    expect(html).toMatch(/<input[^>]*aria-disabled="true"[^>]*readOnly=""/i);
    expect(html).toContain("20 medicines is the maximum. Remove one to add another.");
  });

  it("a failed check is the crit banner with Try again, and nothing was saved", async () => {
    checkPublic.mockImplementation(async (ids: string[]) => (ids.length === 2 ? { ok: false, status: 503, unknownId: null }
      : { ok: true, data: emptyCheck() }));
    const html = await render({ ids: ["A", "B"] });
    expect(html).toContain("Couldn&#x27;t check these medicines.");
    expect(html).toContain("Nothing was saved. Try again in a moment.");
    expect(html).toContain('href="/check?ids=A&amp;ids=B">Try again</a>');
    expect(html).toContain(">2 medicines</h2>");
  });

  it("scenarios render only when all their products exist", async () => {
    checkPublic.mockImplementation(async (ids: string[]) => ids.includes(SCENARIOS[1].ids[1])
      ? { ok: false, status: 404, unknownId: SCENARIOS[1].ids[1] } : { ok: true, data: emptyCheck() });
    const html = await render({});
    expect(html).toContain("Start from a scenario");
    expect(html).toContain(`>${SCENARIOS[0].label}</a>`);
    expect(html).not.toContain(`>${SCENARIOS[1].label}</a>`);
    expect(html).not.toContain(`>${SCENARIOS[2].label}</a>`);    // shares the unknown simvastatin id
  });

  // §10.2: #check-live is the only live region; banners carry no role (Task 32 announces them through #check-live).
  it("the unknown-id and failed-check banners render with no role, so #check-live stays the only live region", async () => {
    checkPublic.mockResolvedValue({ ok: false, status: 503, unknownId: null });
    const html = await render({ ids: ["A", "gone", "B"] });
    expect(html).toContain("One medicine in the link no longer exists, so it was removed.");
    expect(html).toContain("Couldn&#x27;t check these medicines.");
    expect(html).toContain("Nothing was saved. Try again in a moment.");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
    expect(html.match(/aria-live=/g)).toHaveLength(1);
  });

  // §3.6 / §6.7.1: the NOT_REVIEWED pill is only for an unapproved record.
  it("an approved product with no clinical drug shows its dosage form, never the not-reviewed pill", async () => {
    getPublicProduct.mockImplementation(async (id: string) => id === "C"
      ? { ok: true, data: { ...NAPA, conceptId: "C", tradeName: "Cough Syrup", dosageForm: "Syrup", clinicalDrug: null } }
      : approved(id, `Brand ${id}`));
    const html = await render({ ids: ["A", "C"] });
    expect(selLine(html, "Cough Syrup")).toBe("Syrup");
    expect(selLine(html, "Brand A")).toBe("Acetaminophen 500 mg tablet");
    expect(html).not.toContain(PILL);
  });

  it("a product read that fails (503) takes its brand and status from the check, and never shows a pill for an unknown status", async () => {
    getPublicProduct.mockImplementation(async (id: string) => ["X", "Y", "Z"].includes(id) ? { ok: false, status: 503 } : approved(id, `Brand ${id}`));
    checkPublic.mockImplementation(async (ids: string[]) => ({ ok: true, data: emptyCheck({
      summary: { ...emptyCheck().summary, medicines: ids.length },
      products: [{ conceptId: "X", tradeName: "Xylo", route: null, substances: [] }],
      notReviewed: [{ conceptId: "Y", tradeName: "Yellow" }] }) }));
    const html = await render({ ids: ["A", "X", "Y", "Z"] });
    expect(selLine(html, "Xylo")).toBe("");                       // approved per the check, no clinical line to show
    expect(selLine(html, "Yellow")).toContain(PILL);              // unapproved per the check
    expect(selLine(html, "Z")).toBe("");                          // unknown: the id, and no pill
    checkPublic.mockResolvedValue({ ok: false, status: 503, unknownId: null });
    const failed = await render({ ids: ["A", "X"] });
    expect(selLine(failed, "X")).toBe("");                        // the check failed too: the id, never the pill
    expect(failed).not.toContain(PILL);
  });
});
