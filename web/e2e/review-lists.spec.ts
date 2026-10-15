import { expect, test } from "@playwright/test";
import { flagStatus, insertFlag } from "./db";
import { signInAs } from "./session";

test("/review lists every batch, the pilot batch first among those in review (§5.16)", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await page.goto("/review");
  await expect(page.getByRole("heading", { level: 1, name: "Batches" })).toBeVisible();
  await expect(page.locator("main ul a").first()).toHaveAttribute("href", "/review/0001-pilot");
  await expect(page.getByRole("link", { name: "Problem reports and partner requests" })).toBeVisible();
});

test("/review/flags: a report and a partner request, each resolved with the named outcome", async ({ context, page }) => {
  const report = insertFlag("product", "186-0030-006--napa", "E2E report: strength looks wrong");
  const partner = insertFlag("other", "partner-access", "E2E partner: clinic wants access");
  await signInAs(context, "engineer");
  await page.goto("/review/flags");
  await expect(page.getByText("E2E report: strength looks wrong")).toBeVisible();
  // §2.2/§5.6.5: stored emails are never rendered. The reporter's exact address (not a blanket "@e2e.test": the signed-in
  // reviewer's own email may sit in the account menu), in the whole document including the flight data.
  const html = await page.content();
  expect(html).toContain("eng@e2e.test");        // control: the document does carry the signed-in reviewer's own address (account menu)
  expect(html).not.toContain("reader@e2e.test");
  await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
  await page.locator(`button[name="flagId"][value="${report}"]`).click();
  await expect(page.getByRole("status").filter({ hasText: "Report resolved." })).toBeVisible();
  expect(flagStatus(report)).toBe("resolved");
  await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
  await page.locator(`button[name="flagId"][value="${partner}"]`).click();
  await expect(page.getByRole("status").filter({ hasText: "Request resolved." })).toBeVisible();
  expect(flagStatus(partner)).toBe("resolved");
});
