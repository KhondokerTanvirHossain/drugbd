import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));

import { learnContext } from "@/components/learn/context";
import LearnShell from "@/components/learn/LearnShell";
import { P, PILOT_IDS } from "@/content/learn/pilot-snapshot";
import { pilotStats } from "./fixtures/learn-stats";

const render = (slug: "process" | "faq" = "process", stats = pilotStats()) =>
  renderToStaticMarkup(<LearnShell slug={slug} ctx={learnContext(stats)} theme="dark"><p>chapter body</p></LearnShell>);

describe("Learn shell (Board L, §6.8)", () => {
  it("skip link, then the material toolbar: lockup to /learn/start named IntelliDrugs Learn, the site label, the theme control", () => {
    const html = render();
    expect(html.indexOf('<a class="skip" href="#main">Skip to content</a>')).toBeLessThan(html.indexOf("<header"));
    expect(html).toContain('<header class="material chrome-toolbar bar">');
    expect(html).toContain('<a class="brand" href="/learn/start" aria-label="IntelliDrugs Learn">');
    expect(html).not.toContain("back to top");
    expect(html).toContain('<span class="site">drugdb.eliooo.org</span>');
    expect(html).toMatch(/aria-label="Colour theme"[\s\S]*?aria-pressed="true"[^>]*>Dark</);
  });

  it("the chapter nav: ten numbered links, only the current one with aria-current=page", () => {
    const html = render("faq");
    expect(html).toContain('<nav class="material chrome-sidebar nav" aria-label="Chapters" data-learn-nav="">');
    expect(html.match(/<a class="nl" href="\/learn\/[a-z]+"/g)).toHaveLength(10);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('<a class="nl" href="/learn/faq" aria-current="page"><span class="n">10</span><span>FAQ</span></a>');
    expect(html).toContain('<span class="n">3</span><span>IDs and code systems</span>');
  });

  it("the nav note is live: the batch pill and its record count", () => {
    expect(render()).toContain('<div class="navNote"><span class="rv rv--pending">Not yet reviewed by a pharmacist</span><span>All 10 pilot records, batch <span class="mono">0001-pilot</span>.</span></div>');
    expect(render("process", pilotStats({ approved: [...PILOT_IDS] }))).toContain('<div class="navNote"><span class="rv rv--approved">');
    expect(render("process", pilotStats({ missing: [P.napa] }))).toContain("All 9 pilot records");
    // Review Focus 5: with 1 of 10 approved, the note never reads "Not yet reviewed by a pharmacist · All 10 pilot records".
    expect(render("process", pilotStats({ approved: [P.aspirin] }))).toContain('<div class="navNote"><span class="rv rv--approved">Approved by a pharmacist</span><span>1 of 10 pilot records, batch <span class="mono">0001-pilot</span>.</span></div>');
    expect(render()).not.toContain("rv--compact");
  });

  it("no nav note while /v1/stats does not report the pilot batch: no count, no pill from absence (§6.8)", () => {
    for (const stats of [{ ...pilotStats(), batches: [] }, pilotStats({ batchId: "0002-other" })]) {
      const nav = /<nav[^>]*aria-label="Chapters"[\s\S]*?<\/nav>/.exec(render("process", stats))![0];
      expect(nav).not.toContain("All 0");
      expect(nav).not.toContain("pilot records");
      expect(nav).not.toContain('class="rv ');
      expect(nav).not.toContain("navNote");
    }
  });

  it("one <main id=main> holding the chapter and Board L's footer with the snapshot date", () => {
    const html = render();
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('<main id="main" class="main" tabindex="-1"><div class="col"><p>chapter body</p><footer class="foot">');
    expect(html).toContain('Sources: the DGDA register (OCL concepts), NLM RxNav, DDInter 2.0, and batch <span class="mono">0001-pilot</span> as stored on 13/10/2026. Endpoint paths come from the API controllers; example response bodies are illustrative.');
    expect(html).toContain('Anything marked <span class="example">Example</span> is an illustration, not a stored record, and carries no clinical meaning. IntelliDrugs is decision support and does not replace a clinician&#x27;s judgement.');
  });

  it("the rail lists the chapter's sections, none marked current until the scroll-spy runs (no false 'current' without JavaScript)", () => {
    const html = render();
    expect(html).toContain('<aside class="rail" aria-label="On this page" data-learn-rail=""><h2>On this page</h2><p class="railCh">The process</p>');
    expect(html).toContain('<li><a href="#process-flow">The whole flow</a></li>');
    expect(html.match(/<li><a href="#process-[a-z]+"/g)).toHaveLength(7);
    expect(html).not.toContain('aria-current="true"');
  });

  it("holds the page's one polite, sr-only live region (§10.2)", () => {
    const html = render();
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).toContain('<div class="sr-only" aria-live="polite" aria-atomic="true" data-learn-live=""></div>');
  });

  it("without stats (§6.8 'Stats unavailable'): skip link, toolbar, chapter nav without the nav note, no rail, the footer", () => {
    const html = renderToStaticMarkup(<LearnShell slug="process" ctx={null} theme="light"><p>banner</p></LearnShell>);
    expect(html).toContain('<a class="skip" href="#main">Skip to content</a>');
    expect(html).toContain('<a class="nl" href="/learn/process" aria-current="page">');
    expect(html).not.toContain("navNote");
    expect(html).not.toContain("data-learn-rail");
    expect(html).toContain('<main id="main" class="main" tabindex="-1"><div class="col"><p>banner</p><footer class="foot">');
    expect(html.match(/aria-live=/g)).toHaveLength(1);
  });
});
