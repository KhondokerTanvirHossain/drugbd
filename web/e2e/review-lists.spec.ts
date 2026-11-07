import { expect, test } from "@playwright/test";
import { flagStatus, insertFlag, sql } from "./db";
import { latestBatch } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";
import { signInAs } from "./session";

test("/review lists every batch, the pilot batch first among those in review (§5.16)", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await page.goto("/review");
  await expect(page.getByRole("heading", { level: 1, name: "Batches" })).toBeVisible();
  await expect(page.locator("main ul a").first()).toHaveAttribute("href", "/review/0001-pilot");
  await expect(page.getByRole("link", { name: "Reported issues" })).toBeVisible();
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

/*
 * §5.16 (D76): an issue a reviewer reports in the desk is listed on /review/flags, by role and note and never by email, and
 * links to the record in the desk's "Issue reported" filter. Clarith's row is restored afterwards.
 */
test("/review/flags lists a reviewer's issue with its note, linking to the desk; no reviewer email", async ({ context, page }) => {
  const reviewer = "issue.list@e2e.test";
  const b = latestBatch(P.clarith);
  const where = `batch_id = '${b}' AND concept_id = '${P.clarith}'`;
  const before = sql(`SELECT review FROM ops.batch_item WHERE ${where}`);
  sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
       VALUES ('${b}', '${P.clarith}', 'issue', 'E2E issue list: strength reads 50 mg', '${reviewer}', 'pharmacist');
       UPDATE ops.batch_item SET review = 'issue' WHERE ${where};`);
  try {
    await signInAs(context, "engineer");
    await page.goto("/review/flags");
    await expect(page.getByRole("heading", { level: 1, name: "Reported issues" })).toBeVisible();
    const section = page.getByRole("region", { name: /^Issues reported by reviewers \(\d+\)$/ });
    const row = section.locator("li").filter({ hasText: "E2E issue list: strength reads 50 mg" });
    await expect(row).toContainText("Issue reported by a pharmacist. Note:");
    await expect(row).toContainText(`Batch ${b}`);
    expect(await page.content()).not.toContain(reviewer);
    await row.getByRole("link", { name: "Clarith" }).click();
    await expect(page).toHaveURL(new RegExp(`/review/${b}/${P.clarith}\\?show=issue$`));
  } finally {
    sql(`UPDATE ops.batch_item SET review = '${before || "pending"}' WHERE ${where};
         DELETE FROM ops.review_decision WHERE reviewer_email = '${reviewer}';`);
  }
});
