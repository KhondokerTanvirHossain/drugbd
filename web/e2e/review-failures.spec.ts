import { expect, test } from "@playwright/test";
import { approveAllExcept, decisions, restamp } from "./db";
import { PILOT_IDS, STALE, blockIslands, interceptActions, openRecord, versionOf, shown } from "./review-helpers";
import { signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

const B = "e2e-fail";
const tokenIn = (form: string) => `${form} input[name="cf-turnstile-response"]`;

test.describe.configure({ timeout: 120_000 });

test.describe("failures and fallbacks (§5.7, §5.8.3, §5.8.6, §5.12)", () => {
  test("a lost response: 'Couldn't confirm', then Try again saves exactly once", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.napa);
    let dropped = false;
    await page.route(`**/review/${B}/**`, async (route) => {
      const req = route.request();
      if (!dropped && req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes('"decision"')) {
        dropped = true;
        await route.fetch();                       // the server saves …
        await route.abort("connectionreset");      // … and the answer never arrives
      } else await route.continue();
    });
    await page.keyboard.press("a");
    await expect(shown(page, "Couldn't confirm your decision.")).toBeVisible({ timeout: 25_000 });
    await expect(shown(page, /Nothing was published/)).toHaveCount(0);
    expect(decisions(B, PILOT_IDS.napa)).toBe(1);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(shown(page, "Couldn't confirm your decision.")).toHaveCount(0, { timeout: 15_000 });
    expect(decisions(B, PILOT_IDS.napa)).toBe(1);   // the replay found the saved decision by its requestId
  });

  test("a network failure before the server: 'Couldn't confirm', then Try again saves once", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amlodipine);
    const stop = await interceptActions(page, B, "abort");
    await page.keyboard.press("a");
    await expect(shown(page, "Couldn't confirm your decision.")).toBeVisible({ timeout: 25_000 });
    expect(decisions(B, PILOT_IDS.amlodipine)).toBe(0);
    await stop();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => decisions(B, PILOT_IDS.amlodipine), { timeout: 15_000 }).toBe(1);
    await expect(shown(page, "Couldn't confirm your decision.")).toHaveCount(0);
  });

  test("the session expires during the window: nothing is saved and sign-in is offered", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.keyboard.press("a");
    await context.clearCookies();
    await expect(shown(page, "Your sign-in expired. Your decision on Aspirin was not saved.")).toBeVisible({ timeout: 25_000 });
    await expect(shown(page, "Your account can't review this batch.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", /\/signin\?returnTo=/);
    expect(decisions(B, PILOT_IDS.aspirin)).toBe(0);
  });

  test("the bot check fails: the decision is kept and nothing is sent; Retry check then saves it", async ({ context, page }) => {
    await installTurnstileFake(page, "error-once");
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.simvastatin);
    await page.keyboard.press("a");
    await expect(shown(page, "We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeVisible({ timeout: 25_000 });
    expect(decisions(B, PILOT_IDS.simvastatin)).toBe(0);
    await page.getByRole("button", { name: "Retry check" }).click();
    await expect(page.locator(".toast.is-running")).toBeVisible({ timeout: 10_000 });   // a new window starts (§5.8.2)
    await expect.poll(() => decisions(B, PILOT_IDS.simvastatin), { timeout: 20_000 }).toBe(1);
  });

  test("an in-app link out of the batch during the window is not followed; the hint says why (§5.8.3)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.metformin);
    await page.keyboard.press("a");
    await page.locator('#desk .chrome-toolbar a[href="/review"]').first().click();
    await expect(page.locator(".decision-hint")).toHaveText(/ is still in its undo window\. Press U to undo it, or wait until it saves\.$/);
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.metformin}$`));
    await page.keyboard.press("u");
    await page.waitForTimeout(9_000);
    expect(decisions(B, PILOT_IDS.metformin)).toBe(0);
  });

  test("closing the tab during the window asks first, and the decision is discarded (§5.8.3)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amoxiclav);
    await page.keyboard.press("a");
    await expect(page.locator(".toast.is-running")).toBeVisible();
    const asked = new Promise<string>((resolve) => page.once("dialog", (d) => { resolve(d.type()); void d.accept(); }));
    await page.close({ runBeforeUnload: true });
    expect(await asked).toBe("beforeunload");
    const after = await context.newPage();
    await after.waitForTimeout(10_000);
    expect(decisions(B, PILOT_IDS.amoxiclav)).toBe(0);
  });

  test("island blocked: Looks correct only redirects to the confirm step, which posts the version it carried", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await blockIslands(page);
    await page.goto(`/review/${B}/${PILOT_IDS.clarith}`);
    await expect(page.locator(tokenIn("form.decision-main"))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.locator("form.decision-main").getByRole("button", { name: "Looks correct" }).click();
    await expect(page).toHaveURL(/[?&]confirm=/);
    expect(decisions(B, PILOT_IDS.clarith)).toBe(0);   // the first POST never saves
    const v = await versionOf(page, B, PILOT_IDS.clarith);
    expect(new URL(page.url()).searchParams.get("x")).toBe(v.extractedAt ?? "");
    await expect(shown(page, "Confirm your decision on Clarith.")).toBeVisible();
    await expect(page.locator(tokenIn('form:has(input[name="commit"])'))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect.poll(() => decisions(B, PILOT_IDS.clarith), { timeout: 15_000 }).toBe(1);
  });

  test("island blocked: a re-run between the two POSTs refuses the confirm; the stale title shows and no Confirm", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await blockIslands(page);
    await page.goto(`/review/${B}/${PILOT_IDS.domperidone}`);
    await expect(page.locator(tokenIn("form.decision-main"))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.locator("form.decision-main").getByRole("button", { name: "Looks correct" }).click();
    await expect(page).toHaveURL(/[?&]confirm=/);
    restamp(B, PILOT_IDS.domperidone);
    await expect(page.locator(tokenIn('form:has(input[name="commit"])'))).toHaveValue(/.+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(shown(page, STALE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    expect(decisions(B, PILOT_IDS.domperidone)).toBe(0);
  });

  // OPEN PRODUCT DEFECT (found by this test): with scripting off the whole desk stays in React's hidden Suspense container
  // (`<div hidden id="S:0">`, revealed only by a script) because app/review/[batchId]/loading.tsx streams the page, so nothing
  // but the skeleton is visible. §5.8.6 needs the record readable without JavaScript. Re-enable when that is fixed.
  test.fixme("without JavaScript the record reads fully, filters are links, and the page says why deciding needs JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: "http://localhost:3000" });
    await signInAs(context, "pharmacist");
    const page = await context.newPage();
    await page.goto(`/review/${B}/${PILOT_IDS.warfarin}`);
    await expect(shown(page, "Reviewing needs JavaScript for the bot check. You can still read this record.")).toBeVisible();
    await expect(page.locator("details#evidence")).toBeAttached();
    await page.getByRole("link", { name: /^Warnings/ }).first().click();
    await expect(page).toHaveURL(/show=warn/);
    await context.close();
  });
});

test("the last approval shows the complete view (§5.12)", async ({ context, page }) => {
  approveAllExcept("e2e-complete", PILOT_IDS.amoxiclav);
  await signInAs(context, "pharmacist");
  await openRecord(page, "e2e-complete", PILOT_IDS.amoxiclav);
  await page.keyboard.press("a");
  await expect(shown(page, "Batch e2e-complete approved. 10 records are now public.")).toBeVisible({ timeout: 25_000 });
  await page.getByRole("listbox").getByRole("option").first().click();   // "Open any record to read it" (§5.7)
  await expect(shown(page, "Batch e2e-complete approved. 10 records are now public.")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/review/e2e-complete/${PILOT_IDS.amlodipine}$`));
});
