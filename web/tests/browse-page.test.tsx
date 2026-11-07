import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowseProduct, BrowseResult } from "@/lib/public-types";

const browseMedicines = vi.fn(), searchMedicines = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  browseMedicines: (l: string | null, p: number) => browseMedicines(l, p), searchMedicines: (q: string, p: number) => searchMedicines(q, p) }));
import { getPublicMode } from "@/lib/public-mode-read";
import SearchPage, { generateMetadata } from "@/app/search/page";
import { NOT_REVIEWED, PROBLEM_REPORTED, UNREVIEWED_CAUTION } from "@/lib/copy";

const sp = (x: Record<string, string>) => ({ searchParams: Promise.resolve(x) });
const render = async (x: Record<string, string>) => renderToStaticMarkup(await SearchPage(sp(x)));
const KEYS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0-9"];
const letters = (counts: Record<string, number>) => KEYS.map((letter) => ({ letter, count: counts[letter] ?? 0 }));
const row = (id: string, tradeName: string, review: BrowseProduct["review"], clinical = true): BrowseProduct => ({
  conceptId: id, tradeName, darNumber: `DAR-${id}`, company: "Beximco Pharmaceuticals Ltd.", dosageForm: "Tablet",
  genericContentRaw: "Paracetamol 500 mg", clinicalDrug: clinical ? { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet" } : null,
  status: review === "approved" ? "approved" : "not_reviewed", review });
const ALL: BrowseResult = { letter: null, total: 3, page: 0, hasMore: false, letters: letters({ A: 1, N: 2 }),
  products: [row("076-0028-006--aspirin", "Aspirin", "approved"), row("186-0030-006--napa", "Napa", "approved"),
    row("186-0030-007--napa-extend", "Napa Extend", "approved", false)] };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

beforeEach(() => {
  browseMedicines.mockReset(); browseMedicines.mockResolvedValue({ ok: true, data: ALL });
  searchMedicines.mockReset();
});

describe("/search with no query: the medicine list (§6.11.2), approved-only mode", () => {
  it("renders when q is absent or blank after trim; a 1-character q stays too short; a longer q searches", async () => {
    for (const x of [{}, { q: "" }, { q: "   " }, { q: "\u0000" }] as Record<string, string>[]) {
      browseMedicines.mockClear();
      const html = await render(x);
      expect(html, JSON.stringify(x)).toContain(">Medicines</h1>");
      expect(browseMedicines).toHaveBeenCalledWith(null, 0);
    }
    browseMedicines.mockClear();
    expect(await render({ q: "a" })).toContain("Type at least 2 characters.");
    expect(browseMedicines).not.toHaveBeenCalled();
    expect(searchMedicines).not.toHaveBeenCalled();
    searchMedicines.mockResolvedValue({ ok: false, status: 500 });
    await expect(render({ q: "napa", letter: "A" })).rejects.toThrow();
    expect(searchMedicines).toHaveBeenCalledWith("napa", 0);
    expect(browseMedicines).not.toHaveBeenCalled();
  });

  it("h1, lede, count line, then the letter bar; rows reuse the product hit with nothing marked", async () => {
    const html = await render({});
    const t = text(html);
    expect(t).toContain("Medicines Every medicine on IntelliDrugs, A to Z. To find one by brand, substance or DAR number, use the search above. 3 medicines All A B");
    expect(html.indexOf("3 medicines")).toBeLessThan(html.indexOf('<nav aria-label="Browse by first letter"'));
    expect(html).toContain('<a class="s-res-name" href="/products/186-0030-006--napa">Napa</a>');
    expect(html).toContain('<span>Tablet</span><span>Beximco Pharmaceuticals Ltd.</span><span class="mono">DAR DAR-186-0030-006--napa</span>');
    expect(html).toContain('Filed as Paracetamol 500 mg. Clinical drug Acetaminophen 500 mg tablet, <span class="mono">BDC-000001</span>.');
    expect(html).not.toContain("<mark>");
    expect(html.match(/rv--approved/g)).toHaveLength(3);
    expect(html.match(/Filed as/g)).toHaveLength(2);   // Napa Extend has no clinical drug, so no "Filed as" line
    expect(html).not.toContain(UNREVIEWED_CAUTION);
    expect(html).not.toContain(NOT_REVIEWED);
  });

  it("the letter bar: All, A–Z, 0–9; a letter with no product is a disabled span; the current choice is marked; links drop page", async () => {
    const html = await render({ page: "2" });
    expect(browseMedicines).toHaveBeenLastCalledWith(null, 2);
    const nav = html.slice(html.indexOf('<nav aria-label="Browse by first letter"'), html.indexOf("</nav>") + 6);
    expect(nav).toContain('<li><a href="/search" aria-current="page">All</a></li>');
    expect(nav).toContain('<li><a href="/search?letter=A">A</a></li>');
    expect(nav).toContain('<li><a href="/search?letter=N">N</a></li>');
    expect(nav).toContain('<li><span aria-disabled="true">B</span></li>');
    expect(nav).toContain('<li><span aria-disabled="true">0–9</span></li>');
    expect(nav.match(/<li>/g)).toHaveLength(28);
    expect(nav.match(/<a /g)).toHaveLength(3);
    expect(nav).not.toContain("page=");
    expect(text(nav)).toBe(`All ${KEYS.slice(0, 26).join(" ")} 0–9`);

    browseMedicines.mockResolvedValue({ ok: true, data: { ...ALL, letter: "N", total: 2, products: ALL.products.slice(1),
      letters: letters({ A: 1, N: 2, "0-9": 4 }) } });
    const n = await render({ letter: "n" });
    expect(browseMedicines).toHaveBeenLastCalledWith("N", 0);
    expect(n).toContain("2 medicines starting with N");
    expect(n).toContain('<li><a href="/search?letter=N" aria-current="page">N</a></li>');
    expect(n).toContain('<li><a href="/search">All</a></li>');
    expect(n).toContain('<li><a href="/search?letter=0-9">0–9</a></li>');
    expect(n.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("an unknown letter reads as no letter; 0-9 counts as a number or symbol; one medicine is singular", async () => {
    await render({ letter: "ab" });
    expect(browseMedicines).toHaveBeenLastCalledWith(null, 0);
    browseMedicines.mockResolvedValue({ ok: true, data: { ...ALL, letter: "0-9", total: 1, products: [row("1", "3-Day Cream", "approved")],
      letters: letters({ "0-9": 1 }) } });
    const html = await render({ letter: "0-9" });
    expect(browseMedicines).toHaveBeenLastCalledWith("0-9", 0);
    expect(html).toContain("1 medicine starting with a number or symbol");
    expect(html).toContain('<li><a href="/search?letter=0-9" aria-current="page">0–9</a></li>');
    browseMedicines.mockResolvedValue({ ok: true, data: { ...ALL, total: 1, products: [row("1", "Napa", "approved")], letters: letters({ N: 1 }) } });
    expect(text(await render({}))).toContain("use the search above. 1 medicine All");
  });

  it("pages of 50 keep the letter: Previous and Next, and the cap line at index 9 (or past it)", async () => {
    browseMedicines.mockResolvedValue({ ok: true, data: { ...ALL, letter: "N", total: 600, hasMore: true, letters: letters({ N: 600 }) } });
    const p1 = await render({ letter: "N", page: "1" });
    expect(p1).toContain('href="/search?letter=N&amp;page=0">Previous page</a>');
    expect(p1).toContain('href="/search?letter=N&amp;page=2">Next page</a>');
    expect(p1).not.toContain("Showing the first 500");
    const p0 = await render({ letter: "N" });
    expect(p0).not.toContain("Previous page");
    expect(p0).toContain('href="/search?letter=N&amp;page=1">Next page</a>');
    const p9 = await render({ letter: "N", page: "9" });
    expect(p9).toContain("Showing the first 500 medicines starting with N. Search to find the others.");
    expect(p9).not.toContain("Next page");
    expect(p9).toContain('href="/search?letter=N&amp;page=8">Previous page</a>');
    await render({ letter: "N", page: "57" });
    expect(browseMedicines).toHaveBeenLastCalledWith("N", 9);
    browseMedicines.mockResolvedValue({ ok: true, data: { ...ALL, total: 900, hasMore: true, letters: letters({ N: 900 }) } });
    const all9 = await render({ page: "9" });
    expect(all9).toContain("Showing the first 500 medicines. Choose a letter or search to find the others.");
    expect(all9).toContain('href="/search?page=8">Previous page</a>');
    browseMedicines.mockResolvedValue({ ok: true, data: { ...ALL, letter: "0-9", total: 700, hasMore: true, letters: letters({ "0-9": 700 }) } });
    expect(await render({ letter: "0-9", page: "9" }))
      .toContain("Showing the first 500 medicines starting with a number or symbol. Search to find the others.");
    browseMedicines.mockResolvedValue({ ok: true, data: { ...ALL, total: 51, hasMore: false, letters: letters({ N: 51 }) } });
    const last = await render({ page: "1" });
    expect(last).not.toContain("Next page");
    expect(last).not.toContain("Showing the first 500");
  });

  it("both empty states: nothing at all (no bar), and a letter with nothing (the bar stays)", async () => {
    browseMedicines.mockResolvedValue({ ok: true, data: { letter: null, total: 0, page: 0, hasMore: false, letters: letters({}), products: [] } });
    const none = await render({});
    expect(none).toContain("No medicines on IntelliDrugs yet.");
    expect(none).not.toContain("0 medicines");
    expect(none).not.toContain("Browse by first letter");
    browseMedicines.mockResolvedValue({ ok: true, data: { letter: "Q", total: 0, page: 0, hasMore: false, letters: letters({ N: 2 }), products: [] } });
    const q = await render({ letter: "Q" });
    expect(q).toContain("No medicine on IntelliDrugs starts with Q yet.");
    expect(q).toContain('<li><span aria-disabled="true" aria-current="page">Q</span></li>');
    expect(q).toContain('<li><a href="/search?letter=N">N</a></li>');
    browseMedicines.mockResolvedValue({ ok: true, data: { letter: "0-9", total: 0, page: 0, hasMore: false, letters: letters({ N: 2 }), products: [] } });
    expect(await render({ letter: "0-9" })).toContain("No medicine on IntelliDrugs starts with a number or symbol yet.");
  });

  it("an API error throws to the public error page, as search does", async () => {
    browseMedicines.mockResolvedValue({ ok: false, status: 503 });
    await expect(render({})).rejects.toThrow("browse failed (503)");
  });

  it("the title is Medicines for the list and Search medicines otherwise", async () => {
    expect(await generateMetadata(sp({}))).toEqual({ title: "Medicines · IntelliDrugs" });
    expect(await generateMetadata(sp({ q: " " }))).toEqual({ title: "Medicines · IntelliDrugs" });
    expect(await generateMetadata(sp({ q: "napa" }))).toEqual({ title: "Search medicines · IntelliDrugs" });
    expect(await generateMetadata(sp({ q: "a" }))).toEqual({ title: "Search medicines · IntelliDrugs" });
  });
});

describe("the medicine list in show mode (§6.10, §6.11.2)", () => {
  beforeEach(() => vi.mocked(getPublicMode).mockResolvedValue("show_unreviewed"));
  const MIXED: BrowseResult = { ...ALL, products: [row("A1", "Aspirin", "approved"), row("C1", "Clarith", "problem"), row("N1", "Napa", "not_reviewed")] };

  it("every visible row with its label, the problem line, and the caution once before the page", async () => {
    browseMedicines.mockResolvedValue({ ok: true, data: MIXED });
    const html = await render({});
    expect(html.indexOf(UNREVIEWED_CAUTION)).toBeLessThan(html.indexOf("<section"));
    expect(html.match(new RegExp(UNREVIEWED_CAUTION, "g"))).toHaveLength(1);
    expect(html.match(/rv--approved/g)).toHaveLength(1);
    expect(html.match(new RegExp(`<span class="rv rv--pending">${NOT_REVIEWED}</span>`, "g"))).toHaveLength(2);
    expect(html.match(new RegExp(PROBLEM_REPORTED.replace(/[.;]/g, "\\$&"), "g"))).toHaveLength(1);
    const clarith = html.slice(html.indexOf("Clarith</a>"), html.indexOf("Napa</a>"));
    expect(clarith).toContain(PROBLEM_REPORTED);
    expect(html.match(/Filed as/g)).toHaveLength(3);   // the full hit for every visible row, whatever its label
  });

  it("no caution when every listed row is approved", async () => {
    expect(await render({})).not.toContain(UNREVIEWED_CAUTION);
  });

  it("approved-only mode never shows the caution, even for a labelled row", async () => {
    vi.mocked(getPublicMode).mockResolvedValue("approved_only");
    browseMedicines.mockResolvedValue({ ok: true, data: MIXED });
    expect(await render({})).not.toContain(UNREVIEWED_CAUTION);
  });
});
