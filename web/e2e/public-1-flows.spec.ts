import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { partnerRequests, publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";
import { E2E_EMAILS, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

/*
 * Public flows (§11.4 "Public", "Public scope for reviewers") on the production build and the pilot seed. Serial: later
 * tests build on the products earlier ones publish. resetPublic() restores the seed. The §11.4 "Sign-in return path"
 * case stays in foundation.spec.ts (P1A), which Task 33 leaves passing: the island's props are unchanged.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.afterAll(() => resetPublic());

test("landing: one h1, the four bands, and the lookup card shows only the brand and the pill while Napa is unapproved (§6.1, D26)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Bangladesh's medicines, traced from brand to substance and checked by a pharmacist.");
  for (const h of ["One record, three kinds of work", "How a record becomes trustworthy", "Three promises", "For partners: the same records, by API"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  const card = page.getByRole("group", { name: "Lookup for Napa" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Not yet reviewed by a pharmacist");
  await expect(card).toContainText("Its clinical drug, codes and interactions appear here after a pharmacist approves it.");
  await expect(card).not.toContainText("Paracetamol");
  await expect(card).not.toContainText("BDS-");
});

test("search: 'warfarin' finds the G Warfarin stub with no data from the record (§6.3, D16)", async ({ page }) => {
  await page.goto("/search?q=warfarin");
  await expect(page.locator("h1")).toHaveText('Results for "warfarin"');
  await expect(page.getByText("A pharmacist hasn't approved this record yet, so its substance, codes and interactions are hidden.")).toBeVisible();
  await expect(page.locator(`a[href="/products/${P.warfarin}"]`).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("BDS-000003");
});

test("the stub page: the trade name, the pill and the batch, and nothing of the record (§6.4)", async ({ page }) => {
  await page.goto(`/products/${P.warfarin}`);
  await expect(page.locator("h1")).toHaveText("G Warfarin");
  await expect(page.getByText("Not yet reviewed by a pharmacist").first()).toBeVisible();
  await expect(page.getByText(/This is not the same as "not found" or "no data"\. The record exists and is in review in batch /)).toBeVisible();
  for (const hidden of ["Warfarin Sodium", "DDInter1951", "BDS-000003", "What's in it"])
    await expect(page.locator("main")).not.toContainText(hidden);
});

test("an unknown product id is a 404 with the not-found sentence (§6.4)", async ({ page }) => {
  const res = await page.goto("/products/no-such-product");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("No medicine with the id no-such-product.");
});

test("approved: 'paracetamol' finds Napa through the DGDA name, and the product page shows the record (§6.3, §6.5)", async ({ page }) => {
  publish(P.napa, P.aspirin, P.warfarin);
  await page.goto("/search?q=paracetamol");
  await expect(page.locator("h1")).toHaveText('Results for "paracetamol"');
  await page.locator(`a[href="/products/${P.napa}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/products/${P.napa}$`));
  await expect(page.locator("h1")).toHaveText("Napa");
  await expect(page.getByText("Approved by a pharmacist").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What's in it" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "With other approved medicines" })).toBeVisible();
  await expect(page.getByText("From DDInter 2.0").first()).toBeVisible();
  // a pair card says "Pair not yet reviewed…"; the unclassified panel's bracket says "(pair not yet reviewed…)"
  await expect(page.getByText(/pair not yet reviewed by a senior pharmacist/i).first()).toBeVisible();
});

test("'warfrin' suggests Warfarin once G Warfarin is public (§6.3, §7.4 P4)", async ({ page }) => {
  await page.goto("/search?q=warfrin");
  await expect(page.locator("h1")).toHaveText('No medicines match "warfrin"');
  const link = page.getByRole("link", { name: "Search for Warfarin" });
  await expect(link).toHaveAttribute("href", "/search?q=Warfarin");
  await link.click();
  await expect(page.locator("h1")).toHaveText('Results for "Warfarin"');
});

test("the substance page from the product page: entries, products and source links (§6.6)", async ({ page }) => {
  await page.goto(`/products/${P.napa}`);
  await page.locator('a[href^="/substances/BDS-000001"]').first().click();
  await expect(page.locator("h1")).toContainText("Acetaminophen");
  await expect(page.getByRole("heading", { name: "DDInter entries" })).toBeVisible();
  await expect(page.locator(`a[href="/products/${P.napa}"]`).first()).toBeVisible();
});

test("public scope for reviewers: a pharmacist sees the stub on /products and 'not yet reviewed' on /check (§2.2, §11.4)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await signInAs(ctx, "pharmacist");
  const page = await ctx.newPage();
  await page.goto(`/products/${P.domperidone}`);
  await expect(page.locator("h1")).toHaveText("Domperidone");
  await expect(page.getByRole("heading", { name: "What's in it" })).toHaveCount(0);
  await page.goto(`/check?ids=${P.napa}&ids=${P.domperidone}`);
  await expect(page.getByText(/Not yet reviewed by a pharmacist, 1 product/)).toBeVisible();
  await ctx.close();
});

test("welcome states: a reader sees their own email once; a pharmacist sees the batch and the desk button (§6.2)", async ({ browser }) => {
  const reader = await browser.newContext();
  await signInAs(reader, "user", "E2E Reader");
  const r = await reader.newPage();
  await r.goto("/signin?welcome=1");
  await expect(r.getByRole("heading", { name: "You're signed in as a reader" })).toBeVisible();
  await expect(r.locator("main").getByText(E2E_EMAILS.user)).toHaveCount(1);
  await expect(r.getByRole("link", { name: "Search medicines" })).toHaveAttribute("href", "/search");
  await reader.close();

  const pharm = await browser.newContext();
  await signInAs(pharm, "pharmacist");
  const p = await pharm.newPage();
  await p.goto("/signin?welcome=1");
  await expect(p.getByRole("heading", { name: /^You're a pharmacist reviewer for batch / })).toBeVisible();
  await expect(p.getByText("Your approval publishes the record.", { exact: false })).toBeVisible();
  await expect(p.getByRole("link", { name: "Open the review desk" })).toHaveAttribute("href", "/review");
  await expect(p.locator("main")).not.toContainText(E2E_EMAILS.pharmacist);
  await pharm.close();
});

/*
 * The two public write forms post natively and the server answers 303 to the page with the outcome and its #anchor, so
 * with JavaScript too the browser keeps the fragment and lands on the outcome line (a server action's soft navigation
 * dropped it and unmounted the focused submit button, leaving a screen-reader user nowhere: Task 37 fix round 1).
 */
test("report a problem: a signed-in reader's report lands on the outcome at #flag (§6.5)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await signInAs(ctx, "user", "E2E Reader");
  const p = await ctx.newPage();
  await installTurnstileFake(p, "pass");
  try {
    await p.goto(`/products/${P.napa}`);
    await p.getByText("Report a problem with this record").click();
    await p.getByLabel("What's wrong? The IntelliDrugs team reads this.").fill("E2E: the pack size looks wrong.");
    await expect(p.locator('#flag form input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await p.getByRole("button", { name: "Send report" }).click();
    await expect(p).toHaveURL(new RegExp(`/products/${P.napa}\\?flag=sent#flag$`));
    const line = p.locator("#flag > p").filter({ hasText: "Thank you." });
    await expect(line).toHaveText("Thank you. Your flag was sent to the reviewers.");
    await expect(line).toBeInViewport();
    expect(sql(`SELECT count(*) FROM ops.flag WHERE target_type = 'product' AND target_id = '${P.napa}' AND reporter_email = '${E2E_EMAILS.user}'`)).toBe("1");
  } finally {
    sql(`DELETE FROM ops.flag WHERE target_type = 'product' AND reporter_email = '${E2E_EMAILS.user}'`);
    await ctx.close();
  }
});

test("partner access: signed out sees the sign-in line; signed in sends a request stored as a flag (§6.9)", async ({ browser, page }) => {
  await page.goto("/partners");
  await expect(page.getByText("Sign in first. Access is granted by the IntelliDrugs team.")).toBeVisible();
  await expect(page.locator("form textarea")).toHaveCount(0);

  const ctx = await browser.newContext();
  await signInAs(ctx, "user", "E2E Reader");
  const p = await ctx.newPage();
  await installTurnstileFake(p, "pass");
  await p.goto("/partners");
  await p.getByLabel("Organisation").fill("E2E Clinic");
  await p.getByLabel("Kind of system").selectOption("EMR");
  await p.getByLabel("What you will build").fill("Check a patient's medicines at the prescribing step.");
  await p.getByLabel("Expected checks per day").selectOption("Under 1,000");
  await expect(p.locator('#request form input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
  await p.getByRole("button", { name: "Request partner access" }).click();
  await expect(p).toHaveURL(/\/partners\?partner=sent#request$/);
  // The outcome is a plain paragraph with no role (Task 34 Ruling: §10.2 allows one polite live region per page).
  const line = p.locator("#request p").filter({ hasText: "Request sent." });
  await expect(line).toHaveText(`Request sent. The IntelliDrugs team replies to ${E2E_EMAILS.user}.`);
  await expect(line).toBeInViewport();
  expect(partnerRequests(E2E_EMAILS.user)[0]).toBe("Organisation: E2E Clinic");
  await ctx.close();
});

/*
 * Final review finding 1 (G3): Domperidone (coverage none) approved while Napa, Aspirin and G Warfarin are public. Its
 * pairs with them were never checked, so the page must say so; the §6.5 empty sentence ("No other approved medicine has
 * an interaction … yet") would read as safety.
 */
test("an approved no-data product lists each approved partner as not checked, never the empty line (§6.5, G3)", async ({ page }) => {
  publish(P.domperidone);
  await page.goto(`/products/${P.domperidone}`);
  await expect(page.locator("h1")).toHaveText("Domperidone");
  const other = page.locator("div:has(> #with-other)");
  await expect(other.getByRole("heading", { name: "With other approved medicines" })).toBeVisible();
  await expect(other).not.toContainText("No other approved medicine has an interaction");
  const block = other.locator(".nodata-block.hatch");
  await expect(block).toHaveCount(1);
  await expect(block.locator(".nodata-title")).toContainText("Domperidone");
  await expect(block).toContainText("Not checked: Domperidone + Acetaminophen, in 1 approved brand");
  expect(await block.locator(".nodata-pairs").filter({ hasText: /^Not checked: Domperidone \+ / }).count()).toBeGreaterThanOrEqual(3);
});
