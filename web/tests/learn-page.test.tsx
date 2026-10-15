import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pilotStats } from "./fixtures/learn-stats";

const getStats = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()), getStats: () => getStats(), listReviewBatches: async () => [] }));
const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const requestHeaders = new Headers();
const cookieStore = { get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => requestHeaders }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
}));

import LearnChapterPage, { dynamic, generateMetadata } from "@/app/learn/[chapter]/page";
import LearnIndex, { dynamic as indexDynamic } from "@/app/learn/page";
import RootLayout from "@/app/layout";
import { CHAPTER_SLUGS } from "@/content/learn/chapters";

const page = async (chapter: string) => renderToStaticMarkup(await LearnChapterPage({ params: Promise.resolve({ chapter }) }));

beforeEach(() => {
  getStats.mockReset();
  getStats.mockResolvedValue(pilotStats());
  getSession.mockReset();
  getSession.mockResolvedValue(null);
  cookieStore.get.mockReset();
  requestHeaders.delete("x-pathname");
});

describe("/learn and /learn/[chapter] (§2.1, §6.8)", () => {
  it("/learn redirects to /learn/start; both routes are dynamic (§4.1)", () => {
    expect(() => LearnIndex()).toThrow("NEXT_REDIRECT /learn/start");
    expect([dynamic, indexDynamic]).toEqual(["force-dynamic", "force-dynamic"]);
  });

  it("only the ten exact slugs render a chapter (Review Focus 4)", async () => {
    for (const bad of ["Start", "START", "start ", "start%20", "start.html", "nope", "", "glossary/extra"]) await expect(page(bad)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getStats).not.toHaveBeenCalled();
  });

  it("a failed stats read renders the shell and the banner, and no chapter (Review Focus 1, §6.8 'Stats unavailable')", async () => {
    for (const failure of [new Error("API error 502"), new Error("API error: malformed stats"), new TypeError("fetch failed")]) {
      getStats.mockReset();
      getStats.mockRejectedValue(failure);
      for (const slug of ["start", "process"]) {
        const html = await page(slug);
        expect(html).toContain('<a class="skip" href="#main">Skip to content</a>');
        expect(html.match(/<main id="main"/g)).toHaveLength(1);
        expect(html.match(/<h1[ >]/g)).toHaveLength(1);
        expect(html).toContain('<p class="banner-title">Couldn&#x27;t load this chapter.</p>');
        expect(html).toContain("The live pilot numbers did not load, so no example is shown. Nothing was changed.");
        expect(html).toContain(`<a class="btn btn--tonal btn--sm" href="/learn/${slug}">Try again</a>`);
        for (const leak of ["data-snapshot", "data-withdrawn", "BDS-", "BDC-", "DDInter1", "navNote", "data-learn-rail"]) expect(html, `${slug} ${leak}`).not.toContain(leak);
      }
    }
    expect(await page("process")).toContain('<h1 id="h-process"><span class="chN">4</span> The process</h1>');
  });

  it("every chapter renders in the shell with exactly one <h1> and its nav link current", async () => {
    for (const slug of CHAPTER_SLUGS) {
      const html = await page(slug);
      expect(html.match(/<h1[ >]/g), slug).toHaveLength(1);
      expect(html).toContain(`<a class="nl" href="/learn/${slug}" aria-current="page">`);
      expect(html).toContain("Endpoint paths come from the API controllers");
      expect(html, slug).not.toContain("data-withdrawn");
      expect(html.match(/aria-live=/g), slug).toHaveLength(1);
    }
    expect(await page("start")).toContain('<h1>Learn IntelliDrugs</h1>');
    expect(await page("glossary")).toContain('<h1 id="h-glossary"><span class="chN">9</span> Glossary</h1>');
  });

  it("reads the theme cookie for the toolbar's control", async () => {
    cookieStore.get.mockImplementation((name: string) => (name === "intellidrugs-theme" ? { name, value: "dark" } : undefined));
    expect(await page("faq")).toMatch(/aria-pressed="true"[^>]*>Dark</);
  });

  it("titles each chapter page", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ chapter: "codes" }) })).toEqual({ title: "Our IDs and the code systems | Learn IntelliDrugs" });
    expect(await generateMetadata({ params: Promise.resolve({ chapter: "nope" }) })).toEqual({});
  });
});

describe("the root layout on Learn pages", () => {
  const layout = async () => renderToStaticMarkup(await RootLayout({ children: <p>learn page</p> }));

  it("adds no site chrome around a Learn chapter (the shell brings its own)", async () => {
    requestHeaders.set("x-pathname", "/learn/process");
    const html = await layout();
    expect(html).toContain("<body><p>learn page</p></body>");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("keeps the site chrome for anything that is not a chapter, so a 404 there has a header and <main>", async () => {
    requestHeaders.set("x-pathname", "/learn/Start");
    const html = await layout();
    expect(html).toContain('<main id="content"');
    expect(html).toContain('<a href="/learn">Learn</a>');
  });
});
