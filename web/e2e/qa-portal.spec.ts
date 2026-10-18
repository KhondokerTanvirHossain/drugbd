import AxeBuilder from "@axe-core/playwright";
import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { insertQaKey, revokeQaKeysOf } from "./db";
import { PILOT_IDS } from "./review-helpers";
import { BASE_URL, E2E_EMAILS, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

/*
 * §11.4 QA flow (QA portal, D66, D67): the qa role sees only the QA section; an engineer creates a key on /review/qa, sees it
 * once, uses it against the QA API, revokes it, and it stops working; the 5-active cap; a pharmacist's page and DB key. The
 * hosted MCP steps belong to the hosted MCP task.
 */

const KEY = /^idqa_[A-Za-z0-9_-]{43}$/;
const NAPA = `/review/0001-pilot/${PILOT_IDS.napa}`;
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const newKey = () => `idqa_${randomBytes(32).toString("base64url")}`;
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const live = (page: Page) => page.locator("#qa-live");
/** The newest row with this name (local reruns may leave older ones). */
const keyRow = (page: Page, name: string) => page.getByRole("region", { name: "Your QA keys" }).getByRole("row").filter({ hasText: name }).first();
const cell = (page: Page, name: string, i: number) => keyRow(page, name).getByRole("cell").nth(i);

/** Creates a key on the open /review/qa page through the form and the (fake) bot check; returns the key the panel shows. */
async function createKey(page: Page, name: string): Promise<string> {
  await page.getByLabel("Key name").fill(name);
  await expect(page.getByText("Bot check passed")).toBeVisible();
  await page.getByRole("button", { name: "Create key" }).click();
  const heading = page.getByRole("heading", { level: 3, name: "Copy your new key now" });
  await expect(heading).toBeFocused();
  const key = (await page.locator("#qa-new-key").textContent()) ?? "";
  expect(key).toMatch(KEY);
  await expect(live(page)).toHaveText(`Key ${name} created. Copy it now; it is shown only once.`);
  return key;
}

async function revokeKey(page: Page, name: string): Promise<void> {
  await keyRow(page, name).getByRole("button", { name: `Revoke key ${name}` }).click();
  const confirm = page.getByRole("button", { name: "Revoke key", exact: true });
  await expect(confirm).toBeFocused();
  await confirm.click();
  await expect(cell(page, name, 4)).toHaveText("Revoked");
  await expect(live(page)).toHaveText(`Key ${name} revoked.`);
  await expect(page.locator("#keys")).toBeFocused();
}

test.afterAll(() => {
  for (const owner of [E2E_EMAILS.engineer, E2E_EMAILS.senior, E2E_EMAILS.pharmacist, E2E_EMAILS.qa]) revokeQaKeysOf(owner);
});

test("a qa account: /review lands on /review/qa; every other review page is the QA account view; versions is 403 (§2.1, §5.12)", async ({ context, page }) => {
  await signInAs(context, "qa", "Quinn QA");
  await page.goto("/review");
  await expect(page).toHaveURL(/\/review\/qa$/);
  await expect(page.getByRole("heading", { level: 1, name: "QA tools" })).toBeVisible();
  for (const path of [NAPA, "/review/0001-pilot", "/review/flags", "/review/pairs", "/review/substances"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Your account has QA access, not reviewer access." })).toBeVisible();
    // No record data in the HTML (the trade name, the DGDA source); the ids appear only as the URL's own route params.
    const html = await page.content();
    expect(html, path).not.toContain("Napa");
    expect(html, path).not.toContain("Paracetamol");
    const main = (await page.locator("main").textContent()) ?? "";
    expect(main, path).not.toContain(PILOT_IDS.napa);
    expect(main, path).not.toContain("0001-pilot");
    await expect(page.locator("header")).not.toContainText("0001-pilot");
  }
  expect((await page.request.get("/review/0001-pilot/versions")).status()).toBe(403);
  // "QA tools" in the account menu opens the page.
  await page.locator("header details summary").click();
  await page.locator("details").getByRole("link", { name: "QA tools" }).click();
  await expect(page).toHaveURL(/\/review\/qa$/);
  await expect(page.locator("header .role-badge").first()).toHaveText("QA");
});

test("an engineer creates a key, sees it once, uses it, revokes it, and it stops working (§5.18, §7.10)", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE_URL });
  await installTurnstileFake(page, "pass");
  await signInAs(context, "engineer", "Eng Ineer");
  await page.goto("/review/flags");
  await page.getByRole("link", { name: "QA tools" }).first().click();   // the toolbar link
  await expect(page).toHaveURL(/\/review\/qa$/);
  await expect(page.getByRole("link", { name: "QA tools" }).first()).toHaveAttribute("aria-current", "page");

  const key = await createKey(page, "CI laptop");
  await page.getByRole("button", { name: "Copy key" }).click();
  await expect(live(page)).toHaveText(/^(Copied\.|Couldn't copy\. The text is selected; press Ctrl C \(Cmd C on Mac\) to copy it\.)$/);
  await page.getByRole("button", { name: "I've saved it" }).click();
  await expect(page.locator("#keys")).toBeFocused();
  await expect(page.locator("#qa-new-key")).toHaveCount(0);
  expect(await page.content()).not.toContain(key);
  await expect(cell(page, "CI laptop", 4)).toHaveText("Active");
  await expect(cell(page, "CI laptop", 3)).toHaveText("Never");

  // The key reads the QA API like an env key; its use shows as "Last used" (at most once a minute, not awaited).
  const ok = await page.request.get("/api/qa/v1/batches", { headers: bearer(key) });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.success).toBe(true);
  expect(JSON.stringify(body)).not.toContain(E2E_EMAILS.engineer);
  await expect(async () => {
    await page.reload();
    await expect(cell(page, "CI laptop", 3)).not.toHaveText("Never", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(cell(page, "CI laptop", 3)).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} Dhaka$/);
  expect(await page.content()).not.toContain(key);

  // Revoke: the next request with it is 401.
  await expect(page.getByText("Bot check passed")).toBeVisible();
  await revokeKey(page, "CI laptop");
  expect((await page.request.get("/api/qa/v1/batches", { headers: bearer(key) })).status()).toBe(401);
});

test("the 5-active cap: Create key is aria-disabled and a press sends nothing (§5.18, §7.10.2)", async ({ context, page }) => {
  revokeQaKeysOf(E2E_EMAILS.senior);
  for (let i = 1; i <= 5; i++) insertQaKey(E2E_EMAILS.senior, `Seeded ${i}`, sha256(newKey()));
  await installTurnstileFake(page, "pass");
  await signInAs(context, "senior", "Sabina Rahman");
  await page.goto("/review/qa");
  const create = page.getByRole("button", { name: "Create key" });
  await expect(create).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("You have 5 active keys. Revoke one to create another.")).toBeVisible();
  const actions: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) actions.push(r.url()); });
  await page.getByLabel("Key name").fill("Sixth");
  await create.click({ force: true });   // aria-disabled, not disabled: the press reaches the island, which sends nothing
  await expect(live(page)).toHaveText("You have 5 active keys. Revoke one to create another.");
  expect(actions).toEqual([]);
  revokeQaKeysOf(E2E_EMAILS.senior);
});

test("a pharmacist: the info banner and no key read; a key row owned by a pharmacist is 401 (§5.18, §7.10.4)", async ({ context, page }) => {
  const key = newKey();
  insertQaKey(E2E_EMAILS.pharmacist, "Pharmacist key", sha256(key));
  expect((await page.request.get("/api/qa/v1/batches", { headers: bearer(key) })).status()).toBe(401);
  await signInAs(context, "pharmacist", "Farhana Islam");
  const res = await page.goto("/review/qa");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "QA tools are for QA team members, engineers and senior pharmacists." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the review desk" })).toHaveAttribute("href", "/review");
  await expect(page.getByText("Your keys")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "QA tools" })).toHaveCount(0);
  revokeQaKeysOf(E2E_EMAILS.pharmacist);
});

test("320 px: no horizontal page scroll with the key panel open (§10.4)", async ({ context, page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await installTurnstileFake(page, "pass");
  await signInAs(context, "qa", "Quinn QA");
  await page.goto("/review/qa");
  await createKey(page, "Phone");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "I've saved it" }).click();
  await revokeKey(page, "Phone");
});

// ---- axe (§11.4): the QA page's states and the QA account view, in light, dark and forced colours.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(300);
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}
type Look = { name: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [{ name: "light", theme: "light", forced: false }, { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true }];
async function contextFor(browser: Browser, look: Look, role: "engineer" | "pharmacist" | "qa"): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL, colorScheme: look.theme, forcedColors: look.forced ? "active" : "none" });
  await context.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
  await signInAs(context, role);
  return context;
}

for (const look of LOOKS) {
  test(`axe (${look.name}): /review/qa states, the pharmacist banner and the QA account view`, async ({ browser }) => {
    // A qa account makes the keys here (the engineer's budget of 10 a day is the flow test's).
    const eng = await contextFor(browser, look, "qa");
    const page = await eng.newPage();
    await installTurnstileFake(page, "pass");
    await page.goto("/review/qa");
    await expect(page.getByText("Bot check passed")).toBeVisible();
    await axe(page, "list");
    const name = `Axe ${look.name}`;
    await createKey(page, name);
    await axe(page, "new-key panel");
    await page.getByRole("button", { name: "I've saved it" }).click();
    await keyRow(page, name).getByRole("button", { name: `Revoke key ${name}` }).click();
    await axe(page, "revoke confirmation");
    await page.getByRole("button", { name: "Revoke key", exact: true }).click();
    await expect(cell(page, name, 4)).toHaveText("Revoked");
    await eng.close();

    const failing = await contextFor(browser, look, "engineer");
    const errorPage = await failing.newPage();
    await installTurnstileFake(errorPage, "error");
    await errorPage.goto("/review/qa");
    await errorPage.getByLabel("Key name").fill("Never made");
    await errorPage.getByRole("button", { name: "Create key" }).click();
    await expect(errorPage.getByText("We couldn't confirm you're a person.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await axe(errorPage, "create error banner");
    await failing.close();

    const pharm = await contextFor(browser, look, "pharmacist");
    const p2 = await pharm.newPage();
    await p2.goto("/review/qa");
    await axe(p2, "pharmacist banner");
    await pharm.close();

    const qa = await contextFor(browser, look, "qa");
    const p3 = await qa.newPage();
    await p3.goto("/review/flags");
    await expect(p3.getByRole("heading", { level: 1, name: "Your account has QA access, not reviewer access." })).toBeVisible();
    await axe(p3, "QA account view");
    await qa.close();
  });
}
