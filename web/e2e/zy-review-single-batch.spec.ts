import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { PILOT_IDS } from "./review-helpers";
import { signInAs } from "./session";

/*
 * §2.1 and §11.4 "open /review → record 1": with exactly one batch in review, /review opens it, and its first record that
 * needs review opens. The seed has eight in-review batches, so this file (named to run last; workers: 1) parks the others
 * for its one test and puts them back.
 */
test("/review with one batch in review opens it at record 1", async ({ context, page }) => {
  const others = sql("SELECT string_agg(batch_id, ',') FROM ops.batch WHERE status = 'in_review' AND batch_id <> '0001-pilot'");
  sql("UPDATE ops.batch SET status = 'approved' WHERE status = 'in_review' AND batch_id <> '0001-pilot'");
  try {
    await signInAs(context, "pharmacist");
    await page.goto("/review");
    await expect(page).toHaveURL(new RegExp(`/review/0001-pilot/${PILOT_IDS.amlodipine}$`));
    await expect(page.locator("#record h1")).toBeVisible();
  } finally {
    if (others) sql(`UPDATE ops.batch SET status = 'in_review' WHERE batch_id = ANY(string_to_array('${others.replace(/'/g, "''")}', ','))`);
  }
});
