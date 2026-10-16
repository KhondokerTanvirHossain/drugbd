import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { noHorizontalScroll, publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(300);   // entrance transitions finish before axe reads colours
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations
    .map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}

/** Napa, Aspirin, G Warfarin, Domperidone and the eye drop are public; G-Metformin stays a stub. */
const ANONYMOUS = [
  "/", "/search?q=paracetamol", "/search?q=warfarin", "/search?q=zzzzzz", `/products/${P.napa}`, `/products/${P.metformin}`,
  "/products/no-such-product", "/substances/BDS-000001", "/check",
  `/check?ids=${P.warfarin}&ids=${P.aspirin}&ids=${P.domperidone}&ids=${P.metformin}`,
  `/check?ids=${P.chloramphenicol}&ids=${P.warfarin}`, "/signin", "/partners", "/privacy",
];
const READER = ["/signin?welcome=1", "/partners", `/products/${P.napa}`];

type Look = { name: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [
  { name: "light", theme: "light", forced: false },
  { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true },
];

async function contextFor(browser: Browser, look: Look): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
  await ctx.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
  return ctx;
}

test.describe.configure({ mode: "serial", timeout: 300_000 });
test.beforeAll(() => publish(P.napa, P.aspirin, P.warfarin, P.domperidone, P.chloramphenicol));
test.afterAll(() => resetPublic());

for (const look of LOOKS) {
  test(`axe (${look.name}): every public page, the open combobox, and the signed-in states (§10, §11.4)`, async ({ browser }) => {
    const anon = await contextFor(browser, look);
    const page = await anon.newPage();
    await installTurnstileFake(page, "pass");
    for (const path of ANONYMOUS) {
      await page.goto(path);
      await axe(page, `${look.name} ${path}`);
    }
    await page.goto("/check");
    await page.getByRole("combobox", { name: "Add a medicine" }).fill("na");
    await expect(page.getByRole("listbox")).toBeVisible();
    await axe(page, `${look.name} /check, list open`);
    await anon.close();

    const reader = await contextFor(browser, look);
    await signInAs(reader, "user", "E2E Reader");
    const r = await reader.newPage();
    await installTurnstileFake(r, "pass");
    for (const path of READER) {
      await r.goto(path);
      await axe(r, `${look.name} reader ${path}`);
    }
    await r.goto(`/products/${P.napa}`);
    await r.getByText("Report a problem").first().click();
    await axe(r, `${look.name} reader report form open`);
    await reader.close();

    const pharm = await contextFor(browser, look);
    await signInAs(pharm, "pharmacist");
    const p = await pharm.newPage();
    await p.goto("/signin?welcome=1");
    await axe(p, `${look.name} pharmacist welcome`);
    await pharm.close();
  });
}

test("reflow at 320 CSS px: no horizontal page scroll on any public page (§10.4)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ANONYMOUS) {
    await page.goto(path);
    expect(await noHorizontalScroll(page), path).toBeLessThanOrEqual(320);
  }
});

test("1280×800 at 400% zoom (320×200 CSS px): tabbing through the product page, the public bar never covers the focused element (§10.4, WCAG 2.4.11)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 200 });
  await page.goto(`/products/${P.napa}`);
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
      const cover = document.elementFromPoint(x, y)?.closest("header");
      return cover && !cover.contains(el) ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)} under ${cover.tagName}` : null;
    });
    expect(covered, `Tab ${i + 1}`).toBeNull();
  }
  expect(tabbed).toBeGreaterThan(15);   // skip link, the bar, the search field, the record's links and source links, the footer
});
