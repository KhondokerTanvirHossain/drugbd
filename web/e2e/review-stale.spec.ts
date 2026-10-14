import { expect, test } from "@playwright/test";
import { decisions, otherReviewerApproves, restamp } from "./db";
import { PILOT_IDS, STALE, openRecord, shown } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";

const B = "e2e-stale";

test.describe.configure({ timeout: 120_000 });

test.describe("stale detection (§5.11)", () => {
  test("a re-run while the record is open pauses decisions; Reload record shows the new data and stays reloaded", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.warfarin);
    await expect(page.locator("#record")).not.toContainText("Pipeline re-ran this record");
    restamp(B, PILOT_IDS.warfarin);
    await expect(shown(page, STALE)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-fk="approve"]')).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Reload record" }).click();
    await expect(page.locator('[data-desk="live"]')).toHaveText("Record reloaded. Decisions are available again.", { timeout: 15_000 });
    await expect(shown(page, STALE)).toHaveCount(0);
    await expect(page.locator("#record")).toContainText("Pipeline re-ran this record");
    await page.waitForTimeout(22_000);   // the next poll agrees with what is shown
    await expect(shown(page, STALE)).toHaveCount(0);
  });

  test("a re-run during the undo window: nothing is sent", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await context.addCookies([{ name: "intellidrugs-undo", value: "60", url: BASE_URL }]);
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.keyboard.press("a");
    restamp(B, PILOT_IDS.aspirin);
    await expect(shown(page, STALE)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".toast")).toHaveCount(0);
    await page.waitForTimeout(2_000);
    expect(decisions(B, PILOT_IDS.aspirin)).toBe(0);
  });

  test("another reviewer decides first: the other-reviewer banner", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.napa);
    otherReviewerApproves(B, PILOT_IDS.napa);
    await expect(shown(page, "Another reviewer decided on Napa after you opened it.", { exact: false })).toBeVisible({ timeout: 30_000 });
  });

  test("the reviewer's own A never makes the record stale, in the same page (D45)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.clarith);
    await page.keyboard.press("a");
    await expect.poll(() => decisions(B, PILOT_IDS.clarith), { timeout: 20_000 }).toBe(1);
    await expect(page).not.toHaveURL(new RegExp(`${PILOT_IDS.clarith}$`), { timeout: 10_000 });   // auto-advanced
    await page.locator("#desk").focus();
    await page.keyboard.press("k");                                                             // back, inside the desk
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.clarith}$`));
    await page.waitForTimeout(25_000);   // at least one poll after the save; no reload in between
    await expect(shown(page, STALE)).toHaveCount(0);
    await expect(page.locator(".decision-promise")).toContainText("Approved by a pharmacist.");
  });

  test("refresh race: the open record re-stamped between the poll and the refresh keeps what the reviewer opened", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amlodipine);
    await expect(page.locator("#record")).not.toContainText("Pipeline re-ran this record");
    let raced = false;
    // The refresh that another row's change triggers is delayed just long enough to re-stamp the open record first.
    await page.route(`**/review/${B}/${PILOT_IDS.amlodipine}*`, async (route) => {
      const h = route.request().headers();
      if (!raced && h["rsc"] === "1" && !h["next-router-prefetch"]) { raced = true; restamp(B, PILOT_IDS.amlodipine); }
      await route.continue();
    });
    otherReviewerApproves(B, PILOT_IDS.simvastatin);   // the next poll sees another row change and calls router.refresh()
    await expect(shown(page, STALE)).toBeVisible({ timeout: 30_000 });
    expect(raced).toBe(true);
    await expect(page.locator("#record")).not.toContainText("Pipeline re-ran this record");   // still the content it opened with
    await expect(page.locator('[data-fk="approve"]')).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Reload record" }).click();
    await expect(page.locator("#record")).toContainText("Pipeline re-ran this record");
    await expect(shown(page, STALE)).toHaveCount(0);
  });
});
