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
import { PROBLEM_REPORTED, UNREVIEWED_CAUTION } from "@/lib/copy";

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
      "A public check today would list them as not reviewed"]) expect(t).not.toContain(old);
  });

  it("start, process, faq: the show-mode sentences, and the FAQ's Napa question is left out", async () => {
    const start = text(await page("start"));
    expect(start).toContain("Marked until a pharmacist approves");
    expect(start).toContain('"Not yet reviewed by a pharmacist" means no pharmacist has approved the record yet.');
    expect(start).toContain("Each record says whether a pharmacist has checked it.");
    const process = text(await page("process"));
    expect(process).toContain("Until then the public site shows it marked \"Not yet reviewed by a pharmacist\".");
    expect(process).toContain(">Marked</span>");
    expect(process).toContain(`An issue reported also shows "${PROBLEM_REPORTED}"`);
    const faq = text(await page("faq"));
    expect(faq).not.toContain("Why can't I see Napa on the public site?");
    expect(faq).toContain("Can an engineer approve a record?");
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
    expect(text(await page("faq"))).not.toContain(UNREVIEWED_CAUTION);
  });

  it("approved-only mode: no caution and today's sentences", async () => {
    getStats.mockResolvedValue(pilotStats());
    const start = text(await page("start"));
    expect(start).not.toContain(UNREVIEWED_CAUTION);
    expect(start).toContain("Not public until a pharmacist approves");
    expect(text(await page("faq"))).toContain("Why can't I see Napa on the public site?");
  });

  it("SNAPSHOT_CHAPTERS names exactly the chapters that render a snapshot block or a live pill", () => {
    const uses = (slug: string) => /<(SnapshotBlock|LivePill|BatchNote)\b/.test(readFileSync(`${WEB}content/learn/${slug === "start" ? "start" : slug}.tsx`, "utf8"));
    expect(CHAPTER_SLUGS.filter((s) => { try { return uses(s); } catch { return false; } })).toEqual([...SNAPSHOT_CHAPTERS]);
  });
});
