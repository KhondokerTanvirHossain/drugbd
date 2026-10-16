import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "./session";

/*
 * Learn end to end (§6.8, §11.4) on the production build and the Board R pilot seed. It runs after foundation.spec.ts
 * and before the review specs (files run in name order), so batch 0001-pilot is untouched: ten records, none approved,
 * none with an issue.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CHAPTERS = ["start", "model", "codes", "process", "why", "interactions", "reviewers", "partners", "glossary", "faq"];
const main = (page: Page) => page.locator("main#main");

test.describe.configure({ timeout: 180_000 });

test("/learn redirects 307 to /learn/start (§2.1)", async ({ request }) => {
  const res = await request.get("/learn", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/\/learn\/start$/);
});

test("an almost-right chapter URL is a 404 inside the site chrome (Review Focus 4)", async ({ page, request }) => {
  for (const path of ["/learn/Start", "/learn/START", "/learn/start%20", "/learn/nope", "/learn/start.html", "/learn/glossary/extra"])
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  await page.goto("/learn/nope");
  await expect(page.locator("main#content")).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
});

test("the 404 chrome is in the server HTML, so it holds without JavaScript (Review Focus 4, §4.4, §10.1)", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  for (const path of ["/learn/Start", "/learn/START", "/learn/start%20", "/learn/nope", "/learn/start.html", "/learn/glossary/extra"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.locator("main#content"), path).toHaveCount(1);
    await expect(page.locator('a[href="#content"]'), path).toHaveText("Skip to content");
    await expect(page.locator("header").getByRole("link", { name: "Learn", exact: true }), path).toHaveAttribute("href", "/learn");
    await expect(page.locator("h1"), path).toHaveCount(1);
  }
  // Next decodes the slug, so this one is the start chapter in the Learn shell: one <main>, one <h1> (Task 13b ruling).
  const res = await page.goto("/learn/st%61rt");
  expect(res?.status()).toBe(200);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main#main h1")).toHaveText("Learn IntelliDrugs");
  await expect(page.locator("h1")).toHaveCount(1);
  await ctx.close();
});

test("every chapter: one h1, its nav link current, no withdrawn example, Board L's footer, no CSP violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  for (const slug of CHAPTERS) {
    await page.goto(`/learn/${slug}`);
    await expect(page.locator("h1"), slug).toHaveCount(1);
    await expect(page.locator('nav[aria-label="Chapters"] a[aria-current="page"]')).toHaveAttribute("href", `/learn/${slug}`);
    await expect(page.locator("[data-withdrawn]"), slug).toHaveCount(0);
    await expect(main(page).locator("footer")).toContainText("batch 0001-pilot as stored on");
    await expect(page.locator('nav[aria-label="Chapters"]')).toContainText("All 10 pilot records, batch 0001-pilot.");
    // §10.2: one live region per page (light DOM; Next's route announcer lives in a shadow root).
    expect(await page.evaluate(() => document.querySelectorAll("[aria-live]").length), slug).toBe(1);
  }
  expect(violations).toEqual([]);
});

test("/learn/start shows the live numbers from /v1/stats (§6.8)", async ({ page }) => {
  await page.goto("/learn/start");
  await expect(page.getByRole("heading", { level: 1, name: "Learn IntelliDrugs" })).toBeVisible();
  await expect(page.locator('[role="listitem"] b')).toHaveText(["39,196", "10", "11", "0 of 10"]);
  await expect(main(page)).toContainText("Pilot run 11/10/2026 21:27 UTC, which is 12/10/2026 03:27 in Dhaka. Nothing from the pilot is public yet.");
});

test("the §1.6 Learn corrections are on the pages (§12.1 phase 3 exit)", async ({ page }) => {
  const has = async (slug: string, ...texts: string[]) => {
    await page.goto(`/learn/${slug}`);
    for (const t of texts) await expect(main(page), `${slug}: ${t}`).toContainText(t);
  };
  await has("start", "This is Napa as the review desk shows it.", "What a public visitor sees for Napa today.");
  // P2 serves the §7.4 stub (Task 1), so chapter 1 states the API's answer (§6.8 "Before P2").
  await expect(main(page)).toContainText('The API returns the same thing: the id, trade name, status "not_reviewed" and hidden: true.');
  await has("model", "This eye-drop product is checked against DDInter352, the ophthalmic entry. When a product's route has no DDInter entry, the systemic entry is used and marked \"route assumed\".");
  await has("process", "Approval comes from the decision history. Each decision updates the record's review status, and a re-run resets it, so a decision made before the latest extraction never counts.",
    "9 of 10 records warned. Eight list pairs with no DDInter text. Domperidone has no DDInter data. Chloramphenicol is OK.",
    "An engineer presses A and the undo window (8 seconds by default; 20 or 60 in desk settings) closes", "When the undo window closes, the record is public.");
  await has("interactions", "The counts are the 28 DDInter pairs that apply to the pilot products.", "The pairs that apply to the pilot products",
    "Synergy", "3 pilot pairs", "6 pilot pairs", "16 pilot pairs", 'DDInter 2.0 lists this pair with action "unknown" and no text. It is not treated as low risk.');
  await has("reviewers", "Chloramphenicol eye drops: route is ophthalmic, and the interactions use DDInter352 (ophthalmic).",
    "Opens the undo window (8 seconds by default; 20 or 60 in desk settings).");
  await has("partners", "scope=all with the internal token, used only by integration tests. Reviewers read unreviewed data through /v1/review/*.",
    "Decision history, newest first, with notes, roles and reviewer emails. Internal token only.");
  // ...and chapter 8's caption under the public product body (§6.8 "Before P2").
  await expect(main(page)).toContainText('Napa is not approved yet, so a public caller gets its id, trade name and status "not_reviewed", with hidden: true.');
  await has("glossary", "4 Major, 6 Moderate, 2 Minor, 16 not classified", "DDInter for 9 of 10 records",
    'The undo window after "Looks correct" (8 seconds by default; 20 or 60 in desk settings) when U cancels it.');
  await has("faq", "Press U or Undo before the undo window closes (8 seconds unless you lengthened it).");
  for (const slug of ["interactions", "glossary"]) {
    await page.goto(`/learn/${slug}`);
    for (const stale of ["35 pairs", "35 DDInter", "9 Moderate", "20 not classified", "10 of 10 records warned"]) await expect(main(page)).not.toContainText(stale);
  }
});

test("glossary filter: debounced count, empty state, Clear the filter and Esc (§6.8)", async ({ page }) => {
  await page.goto("/learn/glossary");
  const box = page.getByRole("searchbox", { name: "Filter the glossary" });
  const count = page.locator("[data-gl-count]");
  const live = page.locator("[data-learn-live]");
  const shown = page.locator("[data-gl-item]:visible");
  await expect(count).toHaveText("Showing all 55 terms");
  await box.fill("salt");
  await expect(count).toHaveText(/^Showing \d+ of 55 terms$/);
  await expect(live).toHaveText(/^Showing \d+ of 55 terms$/);
  await expect(live).toHaveClass(/sr-only/);
  expect(await shown.count()).toBeGreaterThan(0);
  expect(await shown.count()).toBeLessThan(55);
  await box.fill(".*");
  await expect(shown).toHaveCount(0);
  await expect(page.getByText("No terms match.")).toBeVisible();
  await page.getByRole("button", { name: "Clear the filter" }).click();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");
  await expect(shown).toHaveCount(55);
  await box.fill("dar");
  await box.press("Escape");
  await expect(box).toHaveValue("");
  await expect(shown).toHaveCount(55);
});

test("without JavaScript: every glossary term and both example panels show, with no filter and no switch (§4.4, §6.8)", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto("/learn/glossary");
  await expect(page.locator("[data-gl-item]:visible")).toHaveCount(55);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.goto("/learn/partners");
  for (const id of ["prod-public", "prod-all", "chk-public", "chk-all"]) await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reviewer access" })).toHaveCount(0);
  await context.close();
});

test("chapter 8: with JavaScript the example switch shows one panel at a time (§6.8)", async ({ page }) => {
  await page.goto("/learn/partners");
  const group = page.locator('[data-switch="prod"]');
  await expect(group).toBeVisible();
  await expect(page.locator("#prod-public")).toBeVisible();
  await expect(page.locator("#prod-all")).toBeHidden();
  await group.getByRole("button", { name: "Reviewer access" }).click();
  await expect(page.locator("#prod-all")).toBeVisible();
  await expect(page.locator("#prod-public")).toBeHidden();
  await expect(group.getByRole("button", { name: "Reviewer access" })).toHaveAttribute("aria-pressed", "true");
});

test("chapter 6: the worked check's DDInter text opens with Show full text (Expander, §4.2)", async ({ page }) => {
  await page.goto("/learn/interactions");
  const button = page.getByRole("button", { name: "Show full text" });
  await button.click();
  await expect(page.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
});

test("the rail marks the section being read (§4.2 LearnRail)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/learn/process");
  await expect(page.locator('aside a[href="#process-flow"]')).toHaveAttribute("aria-current", "true");
  await page.locator("#process-gate").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator('aside a[href="#process-gate"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator('aside a[aria-current="true"]')).toHaveCount(1);
});

test("below 860 px: a sticky chapter row, the current chapter in view, and an anchored heading not under it (§6.8, §11.4)", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("/learn/faq");
  const nav = page.locator('nav[aria-label="Chapters"]');
  await expect.poll(() => nav.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const navBox = (await nav.boundingBox())!;
  const current = (await nav.locator('a[aria-current="page"]').boundingBox())!;
  expect(current.x + current.width).toBeLessThanOrEqual(navBox.x + navBox.width + 1);
  await page.goto("/learn/process#process-gate");
  await expect.poll(async () => (await page.getByRole("heading", { name: "The review gate" }).boundingBox())!.y).toBeGreaterThanOrEqual(
    navBox.y + navBox.height - 1);
  const stuck = (await nav.boundingBox())!;
  expect(Math.round(stuck.y)).toBe(52);
});

test("reflow at 320 CSS px: no horizontal page scroll on any chapter (§10.4)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const slug of CHAPTERS) {
    await page.goto(`/learn/${slug}`);
    // On failure, name what sticks out: each element past the right edge that no clipping or scrolling ancestor contains.
    const { width, over } = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const clippedBy = (el: Element) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement)
          if (getComputedStyle(a).overflowX !== "visible" && a.getBoundingClientRect().right <= vw + 0.5) return true;
        return false;
      };
      const over = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 0.5 && !clippedBy(el))
        .slice(0, 5).map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}"> right ${Math.round(el.getBoundingClientRect().right)}px: "${el.textContent?.trim().slice(0, 50)}"`);
      return { width: document.documentElement.scrollWidth, over };
    });
    expect(width, `/learn/${slug} scrolls sideways; past 320 px: ${over.join("; ") || "nothing found"}`).toBeLessThanOrEqual(320);
  }
});

test("1280×800 at 400% zoom (320×200 CSS px): tabbing through a chapter, the toolbar and the chapter row never cover the focused element (§10.4, WCAG 2.4.11)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 200 });
  await page.goto("/learn/process");
  let tabbed = 0;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement === document.body)) break;
    tabbed++;
    const covered = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "no focused element";
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 0), window.innerHeight - 1);
      const cover = document.elementFromPoint(x, y)?.closest('.chrome-toolbar, nav[aria-label="Chapters"]');
      return cover && !cover.contains(el) ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)} under ${cover.tagName}` : null;
    });
    expect(covered, `Tab ${i + 1}`).toBeNull();
  }
  expect(tabbed).toBeGreaterThan(15);   // skip link, lockup, three theme buttons, ten chapter links, the scroll regions
});

const LOOKS = [
  { name: "light", theme: "light", forced: false },
  { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true },
] as const;
for (const look of LOOKS) {
  test(`axe (${look.name}): every Learn chapter has no WCAG 2.2 AA violation (§10, §11.4)`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
    await context.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
    const page = await context.newPage();
    for (const slug of CHAPTERS) {
      await page.goto(`/learn/${slug}`);
      const found = (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => `${slug} ${v.id}: ${v.nodes.length}`);
      expect(found).toEqual([]);
    }
    await context.close();
  });
}

test("axe at 360×800: the narrow layout (sticky chapter row, no nav note, no site label) has no WCAG 2.2 AA violation", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  for (const slug of ["start", "partners", "glossary"]) {
    await page.goto(`/learn/${slug}`);
    const found = (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => `${slug} ${v.id}: ${v.nodes.length}`);
    expect(found).toEqual([]);
  }
  await context.close();
});
