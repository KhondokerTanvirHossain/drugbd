import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairView, pairsPage, substanceDetail } from "./fixtures/senior";

const getSession = vi.fn();
const getPairQueue = vi.fn();
const listSeniorSubstances = vi.fn();
const getSeniorSubstance = vi.fn();
const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ getPairQueue: (...a: unknown[]) => getPairQueue(...a), listSeniorSubstances: (...a: unknown[]) => listSeniorSubstances(...a),
  getSeniorSubstance: (...a: unknown[]) => getSeniorSubstance(...a) }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: vi.fn(), logSeniorOpen: vi.fn() }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/TurnstileField", () => ({ default: () => null }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ notFound: () => notFound(), redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));

import PairQueuePage from "@/app/review/pairs/page";
import SubstancesPage from "@/app/review/substances/page";
import SubstancePage from "@/app/review/substances/[bdsId]/page";

const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const queue = async (o: Record<string, string> = {}) => renderToStaticMarkup(await PairQueuePage({ searchParams: sp(o) }));
const substancePage = async (o: Record<string, string> = {}, bdsId = "BDS-000003") =>
  renderToStaticMarkup(await SubstancePage({ params: Promise.resolve({ bdsId }), searchParams: sp(o) }));
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

beforeEach(() => {
  for (const f of [getSession, getPairQueue, listSeniorSubstances, getSeniorSubstance, notFound]) f.mockClear();
  getSession.mockResolvedValue(SENIOR);
  getPairQueue.mockResolvedValue(pairsPage([pairView()]));
  getSeniorSubstance.mockResolvedValue(substanceDetail());
  listSeniorSubstances.mockResolvedValue({ total: 1, items: [{ bdsId: "BDS-000003", name: "Warfarin", brands: 2, batches: 2, pairsToReview: 5, majorPairsToReview: 2 }] });
});

describe("access (§5.17: role senior only)", () => {
  it.each(["pharmacist", "engineer"])("a %s gets status 200, the info banner and no data", async (role) => {
    getSession.mockResolvedValue({ ...SENIOR, role });
    const pages: [string, string][] = [[await queue(), "Pair queue"],
      [renderToStaticMarkup(await SubstancesPage({ searchParams: sp() })), "Substances"], [await substancePage(), "Substances"]];
    for (const [html, h1] of pages) {
      // Every page has its h1 (WCAG 2.4.6), above the banner; never the substance's name, which is data (§5.17 "Access").
      expect(html.match(/<h1>/g)).toHaveLength(1);
      expect(html).toContain(`<main id="content" class="page"><h1>${h1}</h1><div class="banner`);
      expect(html).not.toContain("Warfarin");
      expect(html).toContain("Senior review is for senior pharmacists.");
      expect(html).toContain("Your account reviews batches. Ask the IntelliDrugs team if you need senior access.");
      expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/review">Open the review desk</a>');
      expect(html).not.toContain("pair-row");
    }
    expect(getPairQueue).not.toHaveBeenCalled();
    expect(listSeniorSubstances).not.toHaveBeenCalled();
    expect(getSeniorSubstance).not.toHaveBeenCalled();
  });
});

describe("the pair queue (§5.17.1, §5.17.2)", () => {
  it("reads every batch with the defaults and the viewer; the toolbar, the nav and the filters", async () => {
    const html = await queue();
    expect(getPairQueue).toHaveBeenCalledWith({ show: "todo", pairs: "all", severity: null, page: 0 }, "senior@e2e.test");
    expect(html).toContain("<h1>Pair queue</h1>");
    expect(html).toContain("Every DDInter 2.0 pair between substances we hold, from all batches. Major first.");
    expect(strip(html)).toContain("Senior review1 pair to review");
    expect(html).toContain('<nav class="nav" aria-label="Senior review"><a href="/review/pairs" aria-current="page">Pair queue</a><a href="/review/substances">Substances</a></nav>');
    expect(html).toContain('<a class="filter" href="/review/pairs" aria-current="true">To review<span class="filter-n">1</span></a>');
    expect(html).toContain('<a class="filter" href="/review/pairs?show=issue">Issue reported<span class="filter-n">0</span></a>');
    expect(html).toContain('<a href="/review/pairs?pairs=applies">Applies to our brands</a>');
    expect(html).toContain('<a href="/review/pairs?severity=unknown">Severity not classified by DDInter</a>');
    expect(html).toContain("1–1 of 1 pairs");
    expect(html).toContain("Reviewing pairs needs JavaScript for the bot check.");
  });

  it("a pair row: heading with substance links, FROM_DDINTER and entry links, text, pair link, state line; no action without JavaScript", async () => {
    const html = await queue();
    expect(html).toContain('<article class="pair-row row" id="pair-DDInter1951-DDInter20" aria-labelledby="pair-DDInter1951-DDInter20-h"');
    expect(html).toContain('<h2 class="rowTitle" id="pair-DDInter1951-DDInter20-h" tabindex="-1"><a href="/review/substances/BDS-000003">Warfarin</a> + <a href="/review/substances/BDS-000004">Acetylsalicylic acid</a></h2>');
    expect(strip(html)).toContain("From DDInter 2.0. DDInter1951 DDInter 2.0 (opens in a new tab) fetched on 12/10/2026 Warfarin (systemic) + DDInter20");
    expect(html).toContain("Avoid the combination.");
    expect(html).toContain('href="https://ddinter2.scbdd.com/server/interact/3039/"');
    expect(html).toContain('<p class="pair-review">Pair not yet reviewed by a senior pharmacist</p>');
    expect(html).not.toContain("Mark reviewed");
    expect(strip(html)).toContain("1 brand of Warfarin and 1 brand of Acetylsalicylic acid, in 2 batches.");
    expect(html).toContain('<a href="/review/0001-pilot/185-0138-012--g-warfarin">G Warfarin (batch <span class="mono">0001-pilot</span>)</a>');
    expect(html).not.toContain("banner--warn");
  });

  it("a pair that does not apply: one plain line, never a warning tone; either id when neither side is chosen", async () => {
    getPairQueue.mockResolvedValue(pairsPage([pairView({ applies: false, brands: [pairView().brands[1]], brandCounts: { a: 0, b: 1, batches: 1 } })]));
    let html = await queue();
    expect(html).toContain('Does not apply to the medicines we hold: none of them is checked against <span class="mono">DDInter1951</span> for its route.');
    expect(html).not.toMatch(/banner--warn|stage--warn|hatch/);
    getPairQueue.mockResolvedValue(pairsPage([pairView({ applies: false, brands: [], brandCounts: { a: 0, b: 0, batches: 0 } })]));
    html = await queue();
    expect(html).toContain('checked against <span class="mono">DDInter1951</span> or <span class="mono">DDInter20</span> for its route.');
  });

  it("more than 10 brands on a side: and {n} more. and the link to every brand of that substance", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ conceptId: `c${i}`, tradeName: `Warin ${i}`, batchId: "e2e-p1c",
      displayStatus: "pending" as const, side: "a" as const }));
    getPairQueue.mockResolvedValue(pairsPage([pairView({ brands: [...many, pairView().brands[1]], brandCounts: { a: 13, b: 1, batches: 2 } })]));
    const html = await queue();
    expect(strip(html)).toContain("13 brands of Warfarin and 1 brand of Acetylsalicylic acid, in 2 batches.");
    expect(strip(html)).toContain("and 3 more.");
    expect(html).toContain('<a href="/review/substances/BDS-000003">All brands of Warfarin</a>');
  });

  it("changed: the reviewer line and What changed in DDInter; history oldest first with (you) and the changed-after line", async () => {
    getPairQueue.mockResolvedValue(pairsPage([pairView({
      review: { state: "changed", at: "2026-10-14T03:00:00Z", mine: false, note: null },
      changes: [{ field: "Severity", atReview: "moderate", now: "major" }],
      history: [{ decision: "reviewed", at: "2026-10-14T03:00:00Z", note: null, mine: true, changedAfter: true },
        { decision: "issue", at: "2026-10-14T04:00:00Z", note: "text contradicts the severity", mine: false, changedAfter: false }] })]));
    const html = await queue();
    expect(html).toContain("Pair changed in DDInter after a senior pharmacist reviewed it on 14/10/2026.");
    expect(html).toContain("<summary>What changed in DDInter</summary>");
    expect(html).toContain('<th scope="col">At review</th><th scope="col">Now</th>');
    expect(html).toContain('<tr><th scope="row">Severity</th><td>moderate</td><td>major</td></tr>');
    expect(html).toContain("<summary>Pair history</summary>");
    expect(strip(html)).toContain("Reviewed by a senior pharmacist (you)DDInter data changed after this review");
    expect(strip(html)).toContain("Issue reported by a senior pharmacist. Note: text contradicts the severity");
    // No reviewer email in the rows or the history (§7.7); the toolbar's account menu shows only the viewer's own (P1B).
    expect(html.slice(html.indexOf("<main"), html.indexOf("</main>"))).not.toContain("@");
  });

  it.each([
    ["todo", "No pairs to review."], ["changed", "No pair changed in DDInter since its review."], ["issue", "No pair issues reported."],
    ["reviewed", "No pairs reviewed yet."], ["all", "No pairs between the substances we hold."],
  ])("empty %s: its sentence and Show all pairs", async (show, text) => {
    getPairQueue.mockResolvedValue(pairsPage([], { counts: { todo: 0, changed: 0, issue: 0, reviewed: 0, all: 0 } }));
    const html = await queue({ show });
    expect(html).toContain(text);
    expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/review/pairs?show=all">Show all pairs</a>');
  });

  it("a page past the end shows Previous page, not the empty copy (Review Focus 5)", async () => {
    getPairQueue.mockResolvedValue(pairsPage([], { total: 31, counts: { todo: 31, changed: 0, issue: 0, reviewed: 0, all: 31 } }));
    const html = await queue({ page: "40" });
    expect(getPairQueue).toHaveBeenCalledWith({ show: "todo", pairs: "all", severity: null, page: 40 }, "senior@e2e.test");
    expect(html).toContain('<a href="/review/pairs">Previous page</a>');
    expect(html).not.toContain("No pairs to review.");
    expect(html).not.toContain("Show all pairs");
  });

  it("unknown filters fall back to the defaults (Review Focus 5)", async () => {
    await queue({ show: "bogus", severity: "urgent", pairs: "x", page: "-3" });
    expect(getPairQueue).toHaveBeenCalledWith({ show: "todo", pairs: "all", severity: null, page: 0 }, "senior@e2e.test");
  });

  it("51 pairs: Next page from the first page, Previous page from the second", async () => {
    const items = Array.from({ length: 50 }, (_, i) => pairView({ ddinterA: `DDInter${100 + i}`, ddinterB: "DDInter999" }));
    getPairQueue.mockResolvedValue(pairsPage(items, { total: 51 }));
    let html = await queue();
    expect(html).toContain("1–50 of 51 pairs");
    expect(html).toContain('<a href="/review/pairs?page=1">Next page</a>');
    getPairQueue.mockResolvedValue(pairsPage([pairView()], { total: 51 }));
    html = await queue({ page: "1" });
    expect(html).toContain("51–51 of 51 pairs");
    expect(html).toContain('<a href="/review/pairs">Previous page</a>');
  });
});

describe("the toolbar's \"{t} pair[s] to review\" (§5.17): one count, the default queue's, on every senior page", () => {
  const DEFAULTS = { show: "todo", pairs: "all", severity: null, page: 0 };
  const toolbar = (html: string) => strip(html.slice(html.indexOf("<header"), html.indexOf("</header>")));
  const counted = (todo: number) => pairsPage([pairView()], { counts: { todo, changed: 0, issue: 0, reviewed: 0, all: todo } });

  it("substances: reads the default queue for its count only (one row), and shows it", async () => {
    getPairQueue.mockResolvedValue(counted(7));
    const html = renderToStaticMarkup(await SubstancesPage({ searchParams: sp() }));
    expect(getPairQueue).toHaveBeenCalledTimes(1);
    expect(getPairQueue).toHaveBeenCalledWith(DEFAULTS, "senior@e2e.test", 1);
    expect(toolbar(html)).toContain("Senior review7 pairs to review");
  });
  it("the substance page: the same count, whatever its own scope", async () => {
    getPairQueue.mockResolvedValue(counted(1));
    const html = await substancePage({ pairs: "applies" });
    expect(getPairQueue).toHaveBeenCalledTimes(1);
    expect(getPairQueue).toHaveBeenCalledWith(DEFAULTS, "senior@e2e.test", 1);
    expect(toolbar(html)).toContain("Senior review1 pair to review");
  });
  it("the queue scoped to applies: the toolbar keeps the default count, read once more for it", async () => {
    getPairQueue.mockImplementation(async (q: { pairs: string }) => counted(q.pairs === "applies" ? 2 : 9));
    const html = await queue({ pairs: "applies" });
    expect(getPairQueue).toHaveBeenCalledTimes(2);
    expect(getPairQueue).toHaveBeenCalledWith({ ...DEFAULTS, pairs: "applies" }, "senior@e2e.test");
    expect(getPairQueue).toHaveBeenCalledWith(DEFAULTS, "senior@e2e.test", 1);
    expect(toolbar(html)).toContain("Senior review9 pairs to review");
  });
  it("the queue over all pairs: its own counts already are the default ones (they follow only the scope), so one read", async () => {
    getPairQueue.mockResolvedValue(counted(4));
    const html = await queue({ show: "issue", severity: "major", page: "2" });
    expect(getPairQueue).toHaveBeenCalledTimes(1);
    expect(toolbar(html)).toContain("Senior review4 pairs to review");
  });
});

describe("substances (§5.17.3)", () => {
  it("the list: filter, table with its caption and columns, linked names", async () => {
    const html = renderToStaticMarkup(await SubstancesPage({ searchParams: sp({ q: " war " }) }));
    expect(listSeniorSubstances).toHaveBeenCalledWith("war", 0);
    expect(html).toContain("<h1>Substances</h1>");
    expect(html).toContain('<label class="sr-only" for="sub-q">Filter substances by name or BDS id</label>');
    expect(html).toContain('placeholder="Filter by name or BDS id"');
    expect(html).toContain('<caption class="sr-only">Substances we hold</caption>');
    expect(strip(html)).toContain("SubstanceBDS idBrandsBatchesPairs to reviewMajor pairs to review");
    expect(html).toContain('<a href="/review/substances/BDS-000003">Warfarin</a>');
  });
  it("no match: the sentence and Show all substances", async () => {
    listSeniorSubstances.mockResolvedValue({ total: 0, items: [] });
    const html = renderToStaticMarkup(await SubstancesPage({ searchParams: sp({ q: "zzz" }) }));
    expect(html).toContain("No substances match “zzz”.");
    expect(html).toContain('<a href="/review/substances">Show all substances</a>');
  });
});

describe("the substance page (§5.17.4)", () => {
  it("brands from two batches, names, codes with source links, entries, and the pairs as h3 rows", async () => {
    const html = await substancePage({ pairs: "applies" });
    expect(getSeniorSubstance).toHaveBeenCalledWith("BDS-000003", { pairs: "applies", severity: null, page: 0 }, "senior@e2e.test");
    expect(html).toContain('<h1>Warfarin <span class="mono">BDS-000003</span></h1>');
    expect(strip(html)).toContain("2 brands in 2 batches");
    expect(html).toContain('<caption class="sr-only">Brands of Warfarin in every batch</caption>');
    expect(html).toContain('<a href="/review/e2e-p1c/900-0001-001--warin">Warin</a>');
    expect(html).toContain('<span class="rv rv--approved">Approved by a pharmacist</span>');
    expect(html).toContain('href="https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&amp;searchTerm=11289"');
    expect(strip(html)).toContain("500 drug pairs in total. 12 drug and disease interactions, 7 drug and food interactions.");
    expect(html).toContain("<h2 id=\"sub-pairs\">Pairs with substances we hold</h2>");
    expect(html).toContain('<h3 class="rowTitle" id="pair-DDInter1951-DDInter20-h"');
    expect(html).toContain('<a href="/review/substances/BDS-000003?pairs=applies" aria-current="true">Applies to our brands</a>');
  });
  it("coverage none: the no-data block and the not-checked line, and no pair list", async () => {
    getSeniorSubstance.mockResolvedValue(substanceDetail({ coverage: "none", entries: [], pairs: { total: 0, items: [] } }));
    const html = await substancePage();
    expect(html).toContain('<div class="nodata-block hatch" role="note">');
    expect(html).toContain("Pairs with Warfarin are not checked.");
    expect(html).not.toContain("pair-row");
  });
  it("no pair: its sentence", async () => {
    getSeniorSubstance.mockResolvedValue(substanceDetail({ pairs: { total: 0, items: [] } }));
    expect(await substancePage()).toContain("No stored DDInter pair links Warfarin with another substance we hold.");
  });
  it("a substance that is not held is a 404", async () => {
    getSeniorSubstance.mockResolvedValue(null);
    await expect(substancePage({}, "BDS-999999")).rejects.toThrow("NOT_FOUND");
  });
});

describe("reflow at 320 px and 24 × 24 px targets (§10.4, WCAG 1.4.10 and 2.5.8)", () => {
  const css = readFileSync(join(process.cwd(), "components/review/senior/pages.module.css"), "utf8");
  const narrow = /@media \(max-width: 639px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  /** The declarations of the innermost rule whose selector list names `sel`, or null. */
  const body = (src: string, sel: string) => {
    for (const m of src.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1].split(",").map((x) => x.trim()).includes(sel)) return m[2];
    return null;
  };

  it("the senior shell carries its own class, so the toolbar can wrap on these pages only", async () => {
    expect(await queue()).toContain('<div class="shell senior">');
  });
  it("under 640 px the toolbar wraps and grows, and its centre loses the auto margin and wraps (as desk.module.css does)", () => {
    expect(narrow).not.toBe("");
    const bar = body(narrow, ".senior :global(.chrome-toolbar)");
    expect(bar).not.toBeNull();
    expect(bar).toMatch(/flex-wrap:\s*wrap/);
    expect(bar).toMatch(/height:\s*auto/);
    expect(bar).toMatch(/min-height:\s*52px/);
    const center = body(narrow, ".center");
    expect(center).not.toBeNull();
    expect(center).toMatch(/margin:\s*0/);
    expect(center).toMatch(/flex-wrap:\s*wrap/);
    expect(center).toMatch(/gap:\s*8px/);
  });
  it("the disclosure summaries get a 24 px line and keep their marker (never flex)", () => {
    for (const sel of [".brands summary", ".details summary"]) {
      const b = body(css, sel);
      expect(b, sel).not.toBeNull();
      expect(b).toMatch(/min-height:\s*24px/);
      expect(b).toMatch(/line-height:\s*24px/);
      expect(b).not.toMatch(/display:/);
    }
  });
  it("the nav, filter and paging links are 24 px inline-flex targets", () => {
    for (const sel of [".links a", ".nav a", ".paging a"]) {
      const b = body(css, sel);
      expect(b, sel).not.toBeNull();
      expect(b).toMatch(/min-height:\s*24px/);
      expect(b).toMatch(/display:\s*inline-flex/);
      expect(b).toMatch(/align-items:\s*center/);
    }
  });
  it("a brand link gets a 24 px line, inline-block so the space before its mono batch id survives (never flex)", () => {
    for (const sel of [".brands li > a", ".brands p > a"]) {
      const b = body(css, sel);
      expect(b, sel).not.toBeNull();
      expect(b).toMatch(/display:\s*inline-block/);
      expect(b).toMatch(/min-height:\s*24px/);
      expect(b).toMatch(/line-height:\s*24px/);
    }
  });
});
