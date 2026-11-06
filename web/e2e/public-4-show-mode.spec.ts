import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "./db";
import { latestBatch } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";
import { signInAs } from "./session";

/*
 * Show mode on the public site (spec §6.10, §7.4.1, §11.4 D74 "Public, show mode"). The CI stack runs the api with the
 * production compose default, PUBLIC_SHOWS_UNREVIEWED=true, and the pilot seed has nothing approved. On the test DB:
 * Clarith gets an open reviewer issue, Simvastatin a failed check, and Amlodipine-5 is removed from its batch file; every
 * row changed here is restored in afterAll. The spec relies on the order files run in (§11.4): it runs on the seed, before
 * the review specs approve pilot records in the e2e batches.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const NOT_REVIEWED = "Not yet reviewed by a pharmacist";
const APPROVED = "Approved by a pharmacist";
const PROBLEM = "A problem has been reported with this record; it may be wrong.";
const CAUTION = "Some of this information has not yet been reviewed by a pharmacist. Check it before relying on it.";
const PAIR_UNREVIEWED = "This pair involves a medicine not yet reviewed by a pharmacist.";
const PAIR_PROBLEM = "This pair involves a medicine with a reported problem; it may be wrong.";
const CLAIM = /Nothing is public until|goes public only after|Public only after|pharmacist-approved (records|data) only|leaves public view|[Hh]idden from (the )?public|stays hidden|Approved records only|before they go public|[Aa]pproved only(?! when)/;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SHOW_REVIEWER = "show.mode@e2e.test";
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

const saved: { clarith?: string; simva?: string; amlo?: string; stage?: string } = {};
const item = (id: string) => `batch_id = ${lit(latestBatch(id))} AND concept_id = ${lit(id)}`;

test.beforeAll(() => {
  saved.clarith = sql(`SELECT review FROM ops.batch_item WHERE ${item(P.clarith)}`);
  sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
       VALUES (${lit(latestBatch(P.clarith))}, ${lit(P.clarith)}, 'issue', 'E2E show mode: strength looks wrong', ${lit(SHOW_REVIEWER)}, 'pharmacist');
       UPDATE ops.batch_item SET review = 'issue' WHERE ${item(P.clarith)};`);
  saved.stage = sql(`SELECT status FROM ops.stage_result WHERE ${item(P.simvastatin)} AND stage = 'clinical'`);
  sql(`UPDATE ops.stage_result SET status = 'fail' WHERE ${item(P.simvastatin)} AND stage = 'clinical'`);
  sql(`UPDATE ops.batch_item SET note = 'removed from batch file' WHERE ${item(P.amlodipine)}`);
});

test.afterAll(() => {
  sql(`UPDATE ops.batch_item SET review = ${lit(saved.clarith ?? "pending")} WHERE ${item(P.clarith)};
       DELETE FROM ops.review_decision WHERE reviewer_email = ${lit(SHOW_REVIEWER)};
       UPDATE ops.stage_result SET status = ${lit(saved.stage ?? "warn")} WHERE ${item(P.simvastatin)} AND stage = 'clinical';
       UPDATE ops.batch_item SET note = NULL WHERE note = 'removed from batch file' AND concept_id = ${lit(P.amlodipine)};`);
});

const main = (page: Page) => page.locator("main");
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(300);
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}
/** The caution is the first element of <main> (§3.4 UnreviewedCaution). */
async function opensWithCaution(page: Page): Promise<void> {
  const first = main(page).locator(":scope > *").first();
  await expect(first).toHaveAttribute("role", "note");
  await expect(first).toHaveText(CAUTION);
  await expect(main(page).getByText(CAUTION)).toHaveCount(1);
}

test("landing: the live hero card with the not-reviewed pill, the show-mode lede and the caution (§6.1)", async ({ page }) => {
  await page.goto("/");
  await opensWithCaution(page);
  await expect(page.locator("h1")).toHaveText("Bangladesh's medicines, traced from brand to substance, each marked with whether a pharmacist has approved it.");
  await expect(main(page)).toContainText('Records a pharmacist has not approved yet are shown, marked "Not yet reviewed by a pharmacist".');
  const card = page.getByRole("group", { name: /^Lookup for Napa/ });
  await expect(card).toContainText("Acetaminophen 500 mg tablet");
  await expect(card).toContainText(NOT_REVIEWED);
  expect(CLAIM.exec(await main(page).innerText())).toBeNull();
  await axe(page, "landing");
});

test("S11: landing, search, Napa's page, Check Napa with other medicines, add G Warfarin: labelled and cautioned all the way (§1.4)", async ({ page }) => {
  await page.goto("/");
  await opensWithCaution(page);
  await main(page).getByRole("link", { name: "Search medicines" }).first().click();
  await expect(page).toHaveURL(/\/search$/);
  const box = page.getByRole("searchbox", { name: "Search medicines" }).first();
  await box.fill("napa");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=napa/);
  await opensWithCaution(page);
  await main(page).locator(`a[href="/products/${P.napa}"]`).first().click();
  await expect(page.locator("h1")).toHaveText("Napa");
  await opensWithCaution(page);
  await expect(main(page)).toContainText(NOT_REVIEWED);
  await page.getByRole("link", { name: "Check Napa with other medicines" }).click();
  await expect(page).toHaveURL(new RegExp(`/check\\?ids=${P.napa}`));
  await opensWithCaution(page);
  const input = page.getByRole("combobox", { name: "Add a medicine" });
  await input.fill("warf");
  const option = page.getByRole("option", { name: /^G Warfarin/ });
  await expect(option).toContainText(NOT_REVIEWED);
  await option.click();
  await expect(page.locator('ul[aria-labelledby="sel-h"] > li')).toHaveCount(2);
  await opensWithCaution(page);
  await expect(main(page).locator("article.pair").first()).toContainText(PAIR_UNREVIEWED);
  expect(CLAIM.exec(await main(page).innerText())).toBeNull();
});

test("search 'paracetamol': Napa is a full hit with the pill, and the page opens with the caution (§6.3)", async ({ page }) => {
  await page.goto("/search?q=paracetamol");
  await opensWithCaution(page);
  const hit = main(page).locator("article", { has: page.locator(`a[href="/products/${P.napa}"]`) });
  await expect(hit).toContainText("Filed as Paracetamol 500 mg");
  await expect(hit).toContainText(NOT_REVIEWED);
  await expect(main(page)).not.toContainText(APPROVED);
  await axe(page, "search");
});

test("Napa's page: full layout, the pill and no verification date, source links, With other medicines with pills and pair lines (§6.5)", async ({ page }) => {
  await page.goto(`/products/${P.napa}`);
  await opensWithCaution(page);
  await expect(page.locator("h1")).toHaveText("Napa");
  await expect(page.getByRole("heading", { name: "What's in it" })).toBeVisible();
  await expect(main(page)).not.toContainText(APPROVED);
  await expect(main(page)).not.toContainText("A pharmacist compared this record with the DGDA register on");
  await expect(main(page)).toContainText("A pharmacist has not yet compared this record with the DGDA register.");
  await expect(main(page).locator("a.src-link").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "With other medicines" })).toBeVisible();
  await expect(main(page).getByText(PAIR_UNREVIEWED).first()).toBeVisible();
  expect(CLAIM.exec(await main(page).innerText())).toBeNull();
  await axe(page, "product");
});

test("the issue record and the failed-check record carry the problem line on search, product page and checker (§6.10)", async ({ page }) => {
  for (const [id, q] of [[P.clarith, "clarith"], [P.simvastatin, "simvastatin"]] as const) {
    await page.goto(`/search?q=${q}`);
    await expect(main(page).locator("article", { has: page.locator(`a[href="/products/${id}"]`) })).toContainText(PROBLEM);
    await page.goto(`/products/${id}`);
    await expect(main(page).getByText(PROBLEM).first()).toBeVisible();
    await expect(main(page)).not.toContainText("E2E show mode: strength looks wrong");   // never a note
    // §7.4.1 Privacy: a problem record's check results are withheld whole, so nothing says which check failed
    await expect(main(page)).toContainText("Not shown while a problem is reported with this record.");
    await expect(main(page).locator(".stage")).toHaveCount(0);
    await expect(main(page)).not.toContainText("Failed");
  }
  await page.goto(`/check?ids=${P.clarith}&ids=${P.simvastatin}`);
  await opensWithCaution(page);
  await expect(main(page).getByText(PROBLEM).first()).toBeVisible();
  await expect(main(page).getByText(PAIR_PROBLEM).first()).toBeVisible();
  await axe(page, "checker problem");
});

for (const scheme of ["light", "dark"] as const) {
  test(`combobox (${scheme}): a problem option, active, keeps its problem line and pill readable on the accent (WCAG 1.4.3)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/check");
    const input = page.getByRole("combobox", { name: "Add a medicine" });
    await input.fill("clarith");
    const option = page.getByRole("option", { name: /^Clarith/ }).first();
    await expect(option).toContainText(PROBLEM);
    // The first suggestion is active once they load; arrow down to Clarith if another option leads the list
    for (let i = 0; i < 10 && (await option.getAttribute("aria-selected")) !== "true"; i++) await input.press("ArrowDown");
    await expect(option).toHaveAttribute("aria-selected", "true");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await axe(page, `combobox ${scheme}, problem option active`);
  });
}

test("checker: Napa and G Warfarin through the combobox (options show the pill); the alert card says a side is not reviewed (§6.7)", async ({ page }) => {
  await page.goto("/check");
  const input = page.getByRole("combobox", { name: "Add a medicine" });
  for (const [typed, name] of [["napa", /^Napa/], ["warf", /^G Warfarin/]] as const) {
    await input.fill(typed);
    const option = page.getByRole("option", { name });
    await expect(option).toBeVisible();
    await expect(option).toContainText(NOT_REVIEWED);
    await option.click();
    await expect(page).toHaveURL(/ids=/);
  }
  await expect(page.locator('ul[aria-labelledby="sel-h"] > li')).toHaveCount(2);
  await opensWithCaution(page);
  await expect(page.getByRole("heading", { level: 2, name: /^2 medicines · .* · 2 medicines not yet reviewed by a pharmacist$/ })).toBeVisible();
  await expect(main(page).locator("article.pair").first()).toContainText(PAIR_UNREVIEWED);
  await axe(page, "checker");
});

test("a record removed from its batch file stays the removed stub and is withdrawn in the checker (§6.4, §6.7)", async ({ page }) => {
  await page.goto(`/products/${P.amlodipine}`);
  await expect(page.locator("h1")).toHaveText("Amlodipine-5");
  await expect(main(page)).toContainText("Removed from the DGDA batch file.");
  await expect(page.getByRole("heading", { name: "What's in it" })).toHaveCount(0);
  await page.goto(`/check?ids=${P.napa}&ids=${P.amlodipine}`);
  await expect(page.getByRole("heading", { name: "Withdrawn from public view, 1 product" })).toBeVisible();
  await expect(main(page)).toContainText("These products were not checked. They are withdrawn from public view.");
});

test("'warfrin' suggests Warfarin: the spelling index follows the visible set (§7.4.1)", async ({ page }) => {
  await page.goto("/search?q=warfrin");
  await expect(page.getByRole("link", { name: "Search for Warfarin" })).toBeVisible();
});

test("public scope for reviewers, show mode: a pharmacist sees the same labelled page a reader does, and /check checks it (§2.2)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await signInAs(ctx, "pharmacist");
  const page = await ctx.newPage();
  await page.goto(`/products/${P.domperidone}`);
  await expect(page.locator("h1")).toHaveText("Domperidone");
  await expect(page.getByRole("heading", { name: "What's in it" })).toBeVisible();
  await expect(main(page)).toContainText(NOT_REVIEWED);
  await expect(main(page)).not.toContainText("@e2e.test");
  await page.goto(`/check?ids=${P.napa}&ids=${P.domperidone}`);
  await expect(main(page)).not.toContainText("Withdrawn from public view");
  await expect(main(page).locator(".nodata-block.hatch").first()).toBeVisible();
  await ctx.close();
});

test("Learn start, process, why and faq: no approved-only sentence, no Napa question, and axe is clean (§6.8)", async ({ page }) => {
  for (const slug of ["start", "process", "why", "faq"]) {
    await page.goto(`/learn/${slug}`);
    // innerText leaves out an SVG's <title> and <desc>, and the "On this page" rail is outside <main>: read them too
    const text = [await page.locator("main").innerText(), ...await page.locator("main svg title, main svg desc").allTextContents(),
      await page.locator("[data-learn-rail]").innerText()].join("\n");
    expect(CLAIM.exec(text)?.[0] ?? null, slug).toBeNull();
    expect(text).not.toContain("Why can't I see Napa on the public site?");
    for (const old of ["read only what a pharmacist has approved", "Anyone can read approved records", "listed under not reviewed"]) expect(text, slug).not.toContain(old);
    await axe(page, `learn ${slug}`);
  }
  await page.goto("/learn/start");
  await expect(page.locator("main")).toContainText("Marked until a pharmacist approves");
});
