import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pilotStats } from "./fixtures/learn-stats";
import { CLAIM_REGEX, text } from "./fixtures/show-mode";

const getStats = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()), getStats: () => getStats(), listReviewBatches: async () => [] }));
vi.mock("@/lib/session", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/session")>()), getSession: async () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: vi.fn(), delete: vi.fn() }), headers: async () => new Headers() }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: (to: string) => { throw new Error(to); } }));
import LearnChapterPage from "@/app/learn/[chapter]/page";
import { CHAPTER_SLUGS, SNAPSHOT_CHAPTERS } from "@/content/learn/chapters";
import { P } from "@/content/learn/pilot-snapshot";
import { PROBLEM_REPORTED, SHOW_COPY, UNREVIEWED_CAUTION } from "@/lib/copy";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const page = async (chapter: string) => renderToStaticMarkup(await LearnChapterPage({ params: Promise.resolve({ chapter }) }));
const show = (o: Parameters<typeof pilotStats>[0] = {}) => pilotStats({ mode: "show_unreviewed", ...o });

beforeEach(() => { getStats.mockReset(); getStats.mockResolvedValue(show()); });

describe("Learn in show mode (§6.8, §6.10)", () => {
  it.each([...CHAPTER_SLUGS])("%s: no sentence says the public site shows approved records only", async (slug) => {
    const t = text(await page(slug));
    expect(CLAIM_REGEX.exec(t)?.[0] ?? null).toBeNull();
    for (const old of ["Nothing from the pilot is public yet", "so none is public.", "Your approval is what publishes a record.",
      "Approved records only", "Readers and the public API see only the id, trade name and review status", "Only these are public.",
      "A public check today would list them as not reviewed", "read only what a pharmacist has approved",
      "Anyone can read approved records", "listed under not reviewed", "Why only a pharmacist can publish",
      "the simpler choice would put a wrong or unchecked fact in front of a prescriber.", "Hidden from public", "approved only",
      "leaves the record hidden", "the record becomes public on the site"]) expect(t).not.toContain(old);
  });

  it("process: the swimlane diagram's lane, box and description read the show-mode way, SVG text and <desc> included", async () => {
    const html = await page("process");
    const svg = text(html.match(/<svg[^>]*dg-swim-t[\s\S]*?<\/svg>/)?.[0] ?? "");
    expect(svg).toContain(`<text x="14" y="440"`);
    expect(svg).toContain(`>${SHOW_COPY.learnSwimPublicSub}</text>`);
    expect(svg).toContain(`>${SHOW_COPY.learnSwimMarked}</text>`);
    const desc = svg.match(/<desc id="dg-swim-d">([\s\S]*?)<\/desc>/)?.[1] ?? "";
    expect(desc).toContain('An engineer check is recorded but keeps the record marked "Not yet reviewed by a pharmacist".');
    expect(desc).toContain('the record shows "Approved by a pharmacist" on the site, checker and API.');
    expect(CLAIM_REGEX.exec(svg)?.[0] ?? null).toBeNull();
  });

  it("why: the pharmacist rule's heading (page and rail) and the chapter lede read the show-mode way", async () => {
    const t = text(await page("why"));
    expect(t).toContain(`<h2>${SHOW_COPY.learnWhyPharmacistTitle}</h2>`);
    expect(t).toContain(`<a href="#why-pharmacist">${SHOW_COPY.learnWhyPharmacistTitle}</a>`);
    expect(t).toContain(SHOW_COPY.learnLedeWhy);
  });

  it("start, process, faq: the show-mode sentences, and the FAQ's Napa question is left out", async () => {
    const start = text(await page("start"));
    expect(start).toContain("Marked until a pharmacist approves");
    expect(start).toContain('"Not yet reviewed by a pharmacist" means no pharmacist has approved the record yet.');
    expect(start).toContain("Each record says whether a pharmacist has checked it.");
    expect(start).toContain(SHOW_COPY.learnStartReaders);
    const process = text(await page("process"));
    expect(process).toContain("Until then the public site shows it marked \"Not yet reviewed by a pharmacist\".");
    expect(process).toContain(">Marked</span>");
    expect(process).toContain(`An issue reported also shows "${PROBLEM_REPORTED}"`);
    const faq = text(await page("faq"));
    expect(faq).not.toContain("Why can't I see Napa on the public site?");
    expect(faq).toContain("Can an engineer approve a record?");
    // The no-alerts answer is open by default here (no Napa question): it names the checker's show-mode heading, which exists
    expect(faq).toMatch(/<details open=""><summary>No alerts came back\. Is the combination safe\?<\/summary>/);
    expect(faq).toContain(SHOW_COPY.learnFaqNoAlertsA);
    expect(SHOW_COPY.learnFaqNoAlertsA.toLowerCase()).toContain(SHOW_COPY.withdrawnHeading.split(",")[0].toLowerCase());
    expect(faq).toContain(SHOW_COPY.learnFaqReviewerA);
    const partners = text(await page("partners"));
    expect(partners).toContain("Every public record, each with its review label; withdrawn records come back as stubs.");
    expect(partners).toContain("/v1/public-mode");
    expect(partners).toContain("While the public site shows unreviewed records, a public caller gets Napa in full");
  });

  it("a hidden pilot record keeps its hidden-state sentences in show mode (evaluated against hidden)", async () => {
    getStats.mockResolvedValue(show({ hidden: [P.napa] }));
    expect(text(await page("start"))).toContain("Public visitors see the smaller card below");
  });

  it("a snapshot chapter opens with the caution while a pilot record is not approved; a stats item labelled problem adds the problem line", async () => {
    getStats.mockResolvedValue(show({ problem: [P.napa] }));
    const html = await page("model");
    expect(text(html)).toContain(UNREVIEWED_CAUTION);
    expect(text(html)).toContain(PROBLEM_REPORTED);
    // §7.4.1 Privacy: the API withdraws every problem item alike, so Napa's examples are stubs, with the problem line
    expect(html).toContain("data-withdrawn");
    expect(text(await page("faq"))).not.toContain(UNREVIEWED_CAUTION);
  });

  it("approved-only mode: no caution and today's sentences", async () => {
    getStats.mockResolvedValue(pilotStats());
    const start = text(await page("start"));
    expect(start).not.toContain(UNREVIEWED_CAUTION);
    expect(start).toContain("Not public until a pharmacist approves");
    expect(start).toContain("Doctors, pharmacists and partner systems read only what a pharmacist has approved.");
    const faq = text(await page("faq"));
    expect(faq).toContain("Why can't I see Napa on the public site?");
    expect(faq).toContain("Check that no product is listed under not reviewed and no substance under no data");
    expect(faq).toContain("Anyone can read approved records without signing in");
    const process = text(await page("process"));
    expect(process).toContain(">Hidden from public</text>");
    expect(process).toContain(">approved only</text>");
    expect(process).toContain("leaves the record hidden as Not yet reviewed by a pharmacist");
    const why = text(await page("why"));
    expect(why).toContain("<h2>Why only a pharmacist can publish</h2>");
    expect(why).toContain('<a href="#why-pharmacist">Why only a pharmacist can publish</a>');
    expect(why).toContain("the simpler choice would put a wrong or unchecked fact in front of a prescriber.");
  });

  it("SNAPSHOT_CHAPTERS names exactly the chapters that render a snapshot block or a live pill", () => {
    const uses = (slug: string) => /<(SnapshotBlock|LivePill|BatchNote)\b/.test(readFileSync(`${WEB}content/learn/${slug === "start" ? "start" : slug}.tsx`, "utf8"));
    expect(CHAPTER_SLUGS.filter((s) => { try { return uses(s); } catch { return false; } })).toEqual([...SNAPSHOT_CHAPTERS]);
  });
});
