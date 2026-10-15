import { expect, test } from "@playwright/test";
import { auditCount, decisions, lastDecision } from "./db";
import { PILOT_IDS, STALE, openRecord, shown } from "./review-helpers";
import { signInAs } from "./session";

const B = "e2e-desk";
const live = '[data-desk="live"]';

test.describe.configure({ timeout: 180_000 });

test.describe("the decision flow (§5.7–§5.10, §5.14)", () => {
  test("pharmacist: A, U undoes; A again publishes after 8 s with the saved announcement, the advance and the 1 s guard", async ({ context, page }) => {
    await signInAs(context, "pharmacist", "Farhana Islam");
    await openRecord(page, B, PILOT_IDS.napa);
    await page.keyboard.press("a");
    await expect(page.locator(".toast")).toContainText("Publishes in 8 seconds.");
    await expect(page.locator(live)).toHaveText("Napa marked correct. Publishes in 8 seconds. Press U to undo.");
    await page.keyboard.press("u");
    await expect(page.locator(live)).toHaveText("Undone. Napa was not saved.");
    await page.waitForTimeout(9_000);
    expect(decisions(B, PILOT_IDS.napa)).toBe(0);

    await page.keyboard.press("a");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.clarith}$`), { timeout: 25_000 });
    await expect(page.locator(live)).toHaveText("Saved. Napa is approved by a pharmacist and published. Opened Clarith, record 9 of 10.");
    await page.keyboard.press("a");   // within 1000 ms of arriving: the guard, not a window
    await expect(page.locator(".decision-hint")).toHaveText("Record changed to Clarith. Press A again to approve it.");
    await expect(page.locator(".toast.is-running")).toHaveCount(0);
    expect(decisions(B, PILOT_IDS.napa)).toBe(1);
    expect(lastDecision(B, PILOT_IDS.napa)).toBe("ok|pharmacist|");
    await openRecord(page, B, PILOT_IDS.napa);
    await expect(page.locator(".decision-promise")).toContainText("Approved by a pharmacist.");
    expect(auditCount("review_open", `${B}/${PILOT_IDS.napa}`)).toBe(1);   // at most once per 10 minutes
  });

  test("Enter never approves; J and K move between records", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.locator('[data-fk="approve"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".decision-hint")).toHaveText("Enter does not approve. Press A, or Space on this button.");
    await expect(page.locator(".toast.is-running")).toHaveCount(0);
    await page.locator("#desk").focus();
    await page.keyboard.press("j");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.simvastatin}`));
    await page.keyboard.press("k");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.aspirin}`));
  });

  test("filters and search live in the URL; an empty view offers Show all, which clears both and focuses the list (§5.3)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.aspirin);
    await page.locator('.chrome-sidebar [data-fk="f-nodata"]').click();
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.domperidone}\\?show=nodata$`));   // the open record left the view
    await page.locator('[data-desk="search"]').fill("zzz-no-such-record");
    await expect(page).toHaveURL(/q=zzz-no-such-record/);
    await expect(shown(page, "No records match “zzz-no-such-record”.")).toBeVisible();
    await page.getByRole("link", { name: "Show all 10 records" }).click();
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.domperidone}$`));
    await expect(page.getByRole("listbox", { name: `Records in ${B}` })).toBeFocused();
    await page.locator('[data-desk="search"]').fill("warfarin");
    await expect(page).toHaveURL(new RegExp(`/review/${B}/${PILOT_IDS.warfarin}\\?q=warfarin$`));
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  });

  test("report: a 4-character note shows the error; a Bengali note is counted in characters, saved as typed, and never goes stale", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.simvastatin);
    await page.keyboard.press("r");
    await expect(page.locator("#note")).toBeFocused();
    await page.locator("#note").fill("abcd");
    await page.getByRole("button", { name: /^Send report/ }).click();
    await expect(shown(page, "Add at least 5 characters so the engineer knows what to fix.")).toBeVisible();
    await expect(page.locator("#note")).toHaveAttribute("aria-invalid", "true");
    expect(decisions(B, PILOT_IDS.simvastatin)).toBe(0);
    await page.locator("#note").fill("শক্তি ভুল");
    await expect(shown(page, "9 / 1000")).toBeVisible();
    await page.getByRole("button", { name: /^Send report/ }).click();
    await expect.poll(() => decisions(B, PILOT_IDS.simvastatin), { timeout: 15_000 }).toBe(1);
    expect(lastDecision(B, PILOT_IDS.simvastatin)).toBe("issue|pharmacist|শক্তি ভুল");
    await expect(page.locator(live)).toHaveText(/^Issue reported for .+\. An engineer will see your note\.$/);
    await page.waitForTimeout(25_000);   // at least one poll after the reviewer's own save, in the same page (D45)
    await expect(shown(page, STALE)).toHaveCount(0);
  });

  test("engineer: the promise, the toast, the recorded check, and the second A's hint", async ({ context, page }) => {
    await signInAs(context, "engineer", "Rafiq Ahmed");
    await openRecord(page, B, PILOT_IDS.metformin);
    await expect(page.locator(".decision-promise")).toContainText("You're reviewing as an engineer.");
    await page.getByRole("button", { name: /^Looks correct/ }).click();
    await expect(page.locator(".toast")).toContainText("Your check saves in 8 seconds. It does not publish.");
    await expect.poll(() => decisions(B, PILOT_IDS.metformin), { timeout: 20_000 }).toBe(1);
    expect(lastDecision(B, PILOT_IDS.metformin)).toBe("ok|engineer|");
    await openRecord(page, B, PILOT_IDS.metformin);
    await expect(page.locator(".decision-promise")).toHaveText("Your check is recorded. A pharmacist still needs to approve.");
    await page.keyboard.press("a");
    await expect(page.locator(".decision-hint")).toHaveText("Your check is already recorded for this record.");
    expect(decisions(B, PILOT_IDS.metformin)).toBe(1);
  });

  test("evidence: E moves focus to Close, A and R only say to close it, Esc returns focus; audited once", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.clarith);
    await page.keyboard.press("e");
    await expect(page.locator("#drawer")).toBeVisible();
    await expect(page.locator('[data-fk="drawer-close"]')).toBeFocused();
    await page.keyboard.press("a");
    await expect(page.locator(".decision-hint")).toHaveText("Close the evidence first (Esc).");
    await expect(page.locator(".toast")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#drawer")).toBeHidden();
    await expect(page.locator('[data-fk="ev"]')).toBeFocused();
    await expect.poll(() => auditCount("evidence_open", `${B}/${PILOT_IDS.clarith}`)).toBe(1);
    expect(decisions(B, PILOT_IDS.clarith)).toBe(0);
  });

  test("the ? sheet traps Tab and returns focus on Esc (§5.14)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.amlodipine);
    await page.keyboard.press("?");
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet.getByRole("button", { name: /^Close/ })).toBeFocused();
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Tab");
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("#desk")).toBeFocused();
  });

  test("settings in the sheet: shortcuts Off leave the buttons working; a 60-second window sends nothing before 60 s", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.domperidone);
    await page.keyboard.press("?");
    await page.getByRole("dialog").getByRole("button", { name: "Off", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("a");
    await page.waitForTimeout(1_000);
    await expect(page.locator(".toast.is-running")).toHaveCount(0);
    await expect(page.locator(".decision-keys")).toHaveCount(0);
    await page.getByRole("button", { name: "Looks correct" }).click();   // no Kbd label while Off
    await expect(page.locator(".toast.is-running")).toBeVisible();
    await page.locator('[data-fk="undo"]').click();
    await expect(page.locator(live)).toHaveText(/^Undone\. .+ was not saved\.$/);

    // Off hides "?", so the sheet opens from the account menu item (§5.14)
    await page.locator(".chrome-toolbar details > summary").click();
    await page.locator('[data-desk-open="sheet"]').click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "On", exact: true }).click();
    await sheet.getByRole("button", { name: "60 seconds", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.locator("#desk").focus();
    await page.keyboard.press("a");
    await expect(page.locator(".toast")).toContainText("Publishes in 60 seconds.");
    await page.waitForTimeout(55_000);
    expect(decisions(B, PILOT_IDS.domperidone)).toBe(0);
    await page.keyboard.press("u");
    await expect(page.locator(live)).toHaveText(/^Undone\. .+ was not saved\.$/);
    expect(decisions(B, PILOT_IDS.domperidone)).toBe(0);
  });

  test("sign-out removes every note draft from sessionStorage (§5.10)", async ({ context, page }) => {
    await signInAs(context, "pharmacist");
    await openRecord(page, B, PILOT_IDS.warfarin);
    await page.keyboard.press("r");
    await page.locator("#note").fill("Draft that must not outlive the session");
    await page.keyboard.press("Escape");   // closes the panel and keeps the draft
    const drafts = () => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("intellidrugs-draft:")));
    expect(await drafts()).toHaveLength(1);
    await page.locator(".chrome-toolbar details > summary").click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).not.toHaveURL(/\/review\//);
    expect(await drafts()).toEqual([]);
  });
});
