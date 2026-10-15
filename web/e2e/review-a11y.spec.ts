import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { approveAllExcept, restamp } from "./db";
import { PILOT_IDS, STALE, blockIslands, interceptActions, openRecord, replaceNextActionResult, shown } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(500);   // let the drawer, sheet and panel entrance animations finish: axe reads mid-fade colours otherwise
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations
    .map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}

/** §11.4: every desk state in light, dark and forced colours (§10.3), each on its own seeded batch. */
type Look = { name: string; batch: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [
  { name: "light", batch: "e2e-a11y-light", theme: "light", forced: false },
  { name: "dark", batch: "e2e-a11y-dark", theme: "dark", forced: false },
  { name: "forced colours", batch: "e2e-a11y-forced", theme: "light", forced: true },
];

async function contextFor(browser: Browser, look: Look, role: "pharmacist" | "user", cookies: Record<string, string> = {}): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
  await context.addCookies(Object.entries({ "intellidrugs-theme": look.theme, ...cookies }).map(([name, value]) => ({ name, value, url: BASE_URL })));
  await signInAs(context, role);
  return context;
}

test.describe.configure({ timeout: 300_000 });

for (const look of LOOKS) {
  test(`axe (${look.name}): every desk state, the lists and the not-authorised page (§10, §11.4)`, async ({ browser }) => {
    const B = look.batch, P = PILOT_IDS;
    const ctx = await contextFor(browser, look, "pharmacist");

    // ready, drawer, sheet with settings, armed
    const page = await ctx.newPage();
    await openRecord(page, B, P.amlodipine);
    await axe(page, "ready");
    await page.keyboard.press("e");
    await expect(page.locator("#drawer")).toBeVisible();
    await axe(page, "drawer");
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await axe(page, "sheet");
    await page.keyboard.press("Escape");
    await page.keyboard.press("a");
    await expect(page.locator(".toast.is-running")).toBeVisible();
    await axe(page, "armed");
    await page.keyboard.press("u");

    // report error: the report POST is lost; Try again then sends it
    const stopReport = await interceptActions(page, B, "abort");
    await page.keyboard.press("r");
    await page.locator("#note").fill("Strength on the pack is 10 mg");
    await page.keyboard.press("Control+Enter");
    await expect(shown(page, "Couldn't send your report.")).toBeVisible({ timeout: 25_000 });
    await axe(page, "report error");
    await stopReport();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(shown(page, "Couldn't send your report.")).toHaveCount(0, { timeout: 25_000 });

    // stale
    restamp(B, P.amlodipine);
    await expect(shown(page, STALE)).toBeVisible({ timeout: 30_000 });
    await axe(page, "stale");
    await page.getByRole("button", { name: "Reload record" }).click();
    await expect(shown(page, STALE)).toHaveCount(0, { timeout: 15_000 });

    // committing, then unconfirmed (the decide POST is held until the desk's 10 s timeout), then Try again
    await openRecord(page, B, P.aspirin);
    const release = await interceptActions(page, B, "hold");
    await page.keyboard.press("a");
    await expect(page.locator(".toast")).toContainText("saving.", { timeout: 20_000 });
    await axe(page, "committing");
    await expect(shown(page, "Couldn't confirm your decision.")).toBeVisible({ timeout: 25_000 });
    await axe(page, "net error, unconfirmed");
    await release();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(shown(page, "Couldn't confirm your decision.")).toHaveCount(0, { timeout: 25_000 });

    // net error, not saved: the action's rate_limited outcome (the server's real answer is replaced)
    await openRecord(page, B, P.simvastatin);
    await replaceNextActionResult(page, B, { ok: false, code: "rate_limited" });
    await page.keyboard.press("a");
    await expect(shown(page, "Couldn't save your decision.")).toBeVisible({ timeout: 25_000 });
    await axe(page, "net error, not saved");
    await page.close();

    // loading: the record request is held while the desk shows its in-flight state. A move inside the batch is a React
    // transition, so Next keeps the old panes and never mounts the skeleton (loading.tsx); the bar is what loads (§5.7).
    const lp = await ctx.newPage();
    await installTurnstileFake(lp, "pass");   // the live widget keeps a blob request open, so "networkidle" would never come
    await openRecord(lp, B, P.metformin);
    await lp.waitForLoadState("networkidle");   // the desk has prefetched the previous and next records (§5.4)
    let releaseNav = () => {};
    const gate = new Promise<void>((resolve) => { releaseNav = resolve; });
    // End goes to the last record, which is not prefetched, so its request is the one held.
    await lp.route(`**/review/${B}/${P.amoxiclav}*`, async (route) => {
      if (route.request().headers()["rsc"] === "1" && !route.request().headers()["next-router-prefetch"]) await gate;
      await route.continue();
    });
    await lp.locator('[data-fk="list"]').focus();
    await lp.keyboard.press("End");
    await expect(lp.locator(".decision-promise")).toContainText(`Loading batch ${B}.`, { timeout: 10_000 });
    // §5.12: a transition longer than 300 ms is announced through the desk's one polite region.
    await expect(lp.locator('[data-desk="live"]')).toHaveText(`Loading batch ${B}`, { timeout: 5_000 });
    // The one polite region of the desk (§10.2); Next's own route announcer is injected by the framework after a client navigation.
    expect(await lp.locator('[aria-live]:not(#__next-route-announcer__), [role="status"]').count()).toBe(1);
    await axe(lp, "loading");
    releaseNav();
    await expect(lp).toHaveURL(new RegExp(`/review/${B}/${P.amoxiclav}$`));

    // no-auth: the action's forbidden outcome
    await openRecord(lp, B, P.warfarin);
    await replaceNextActionResult(lp, B, { ok: false, code: "forbidden" });
    await lp.keyboard.press("a");
    await expect(lp.locator("#decision-bar")).toContainText("Your account can't review this batch.", { timeout: 25_000 });
    await axe(lp, "no-auth");
    await lp.close();

    // bot hold
    const bp = await ctx.newPage();
    await installTurnstileFake(bp, "error");
    await openRecord(bp, B, P.napa);
    await bp.keyboard.press("a");
    await expect(shown(bp, "We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeVisible({ timeout: 20_000 });
    await axe(bp, "bot hold");
    await bp.close();

    // no-JavaScript confirm page (the islands are blocked)
    const np = await ctx.newPage();
    await blockIslands(np);
    await np.goto(`/review/${B}/${P.domperidone}`);
    await expect(np.locator('form.decision-main input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await np.locator("form.decision-main").getByRole("button", { name: "Looks correct" }).click();
    await expect(shown(np, /^Confirm your decision on /)).toBeVisible();
    await axe(np, "no-JavaScript confirm");
    await np.close();

    // shortcuts Off
    const offCtx = await contextFor(browser, look, "pharmacist", { "intellidrugs-keys": "off" });
    const op = await offCtx.newPage();
    await openRecord(op, B, P.clarith);
    await expect(op.locator(".decision-keys")).toHaveCount(0);
    await axe(op, "shortcuts off");
    await offCtx.close();

    // signed out during the window
    const outCtx = await contextFor(browser, look, "pharmacist");
    const sp = await outCtx.newPage();
    await openRecord(sp, B, P.clarith);
    await sp.keyboard.press("a");
    await outCtx.clearCookies();
    await expect(sp.getByRole("link", { name: "Sign in again" })).toBeVisible({ timeout: 25_000 });
    await axe(sp, "signed out");
    await outCtx.close();

    // complete
    approveAllExcept(B, P.amoxiclav);
    const cp = await ctx.newPage();
    await openRecord(cp, B, P.amoxiclav);
    await cp.keyboard.press("a");
    await expect(shown(cp, `Batch ${B} approved. 10 records are now public.`)).toBeVisible({ timeout: 25_000 });
    await axe(cp, "complete");

    // the batch list and the flags page
    for (const path of ["/review", "/review/flags"]) {
      await cp.goto(path);
      await axe(cp, path);
    }
    await ctx.close();

    const reader = await contextFor(browser, look, "user");
    const rp = await reader.newPage();
    await rp.goto("/review/0001-pilot");
    await axe(rp, "not authorised");
    await reader.close();
  });
}

test("reflow at 320 CSS px: no horizontal scroll in the list or the record (§10.4)", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await page.setViewportSize({ width: 320, height: 640 });
  for (const q of ["?pane=list", ""]) {
    await page.goto(`/review/0001-pilot/${PILOT_IDS.amoxiclav}${q}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test("1280×800 at 400% zoom (320×200 CSS px): tabbing through the desk, nothing covers the focused element (§10.4, WCAG 2.4.11)", async ({ context, page }) => {
  test.setTimeout(120_000);
  await signInAs(context, "pharmacist");
  await page.setViewportSize({ width: 320, height: 200 });
  await openRecord(page, "0001-pilot", PILOT_IDS.napa);
  let tabbed = 0;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    // The end of the tab order: focus leaves the page (to the browser's own controls) and the next Tab wraps to the start.
    if (await page.evaluate(() => document.activeElement === document.body)) break;
    tabbed++;
    const covered = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "no focused element";
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;   // e.g. the visually hidden live region is never focusable
      const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
      const cover = document.elementFromPoint(x, y)?.closest(".decision-bar, .chrome-toolbar");
      return cover && !cover.contains(el) ? `${el.tagName} ${el.getAttribute("data-fk") ?? el.textContent?.trim().slice(0, 40)} under ${cover.className}` : null;
    });
    expect(covered, `Tab ${i + 1}`).toBeNull();
  }
  expect(tabbed).toBeGreaterThan(10);   // the walk covered the toolbar, the list, the record and the bar
});
