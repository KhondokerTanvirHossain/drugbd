import { expect, type Locator, type Page } from "@playwright/test";
import { sql } from "./db";

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
export const PUBLIC_REVIEWER = "public.pharmacist@e2e.test";

/** The batch whose item the §7.4 visibility rule reads: ReviewSql.statusOf's order (newest stamp, then batch id). */
export const latestBatch = (conceptId: string): string =>
  sql(`SELECT batch_id FROM ops.batch_item WHERE concept_id = ${lit(conceptId)}
       ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1`);

/** A pharmacist approves each product's latest item, as the desk would (one ok decision, review = 'ok'). */
export function publish(...conceptIds: string[]): void {
  for (const id of conceptIds) {
    const b = latestBatch(id);
    sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
         VALUES (${lit(b)}, ${lit(id)}, 'ok', '', ${lit(PUBLIC_REVIEWER)}, 'pharmacist');
         UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = ${lit(b)} AND concept_id = ${lit(id)};`);
  }
}

/** publish() for the products whose latest item is not approved yet, so a test can run alone or after one that published them. */
export function ensurePublished(...conceptIds: string[]): void {
  publish(...conceptIds.filter((id) => sql(`SELECT review FROM ops.batch_item WHERE batch_id = ${lit(latestBatch(id))}
    AND concept_id = ${lit(id)}`) !== "ok"));
}

/** Undoes every publish() and the e2e partner requests, so the review specs start from the untouched seed. */
export function resetPublic(): void {
  sql(`UPDATE ops.batch_item bi SET review = 'pending' FROM ops.review_decision d
       WHERE d.reviewer_email = ${lit(PUBLIC_REVIEWER)} AND d.batch_id = bi.batch_id AND d.concept_id = bi.concept_id;
       DELETE FROM ops.review_decision WHERE reviewer_email = ${lit(PUBLIC_REVIEWER)};
       DELETE FROM ops.flag WHERE target_type = 'other' AND target_id = 'partner-access' AND reporter_email LIKE '%@e2e.test';`);
}

export const partnerRequests = (email: string): string[] =>
  sql(`SELECT message FROM ops.flag WHERE target_type = 'other' AND target_id = 'partner-access'
       AND reporter_email = ${lit(email)} ORDER BY id`).split("\n").filter(Boolean);

export const noHorizontalScroll = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);

/** D75 §6.11.1: the top bar's search field once the HeaderSearch island runs (before that it is a plain searchbox). */
export const headerSearch = (page: Page): Locator => page.getByRole("combobox", { name: "Search medicines" });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The header list's option whose trade name is exactly `brand` (its first line), never a longer name that starts with it. */
export const headerOption = (page: Page, brand: string): Locator =>
  page.locator("#hs-list > li").filter({ has: page.locator(":scope > span:first-child", { hasText: new RegExp(`^${escapeRe(brand)}$`) }) });

/** Types into the header search and waits for the open list to offer `brand`; no option is active yet (§6.11.1). */
export async function typeInHeader(page: Page, text: string, brand: string): Promise<Locator> {
  const box = headerSearch(page);
  // Cleared first: React fires no change for a value the field already holds (after a search or a client navigation).
  await box.fill("");
  await box.fill(text);
  await expect(headerOption(page, brand)).toBeVisible();
  await expect(box).toHaveAttribute("aria-expanded", "true");
  await expect(box).not.toHaveAttribute("aria-activedescendant", /.+/);
  return box;
}

/** Presses ArrowDown until the header option for `brand` is the active one (at most 11 options: 10 medicines, All results). */
export async function arrowToHeaderOption(page: Page, brand: string): Promise<void> {
  const option = headerOption(page, brand);
  for (let i = 0; i < 11 && (await option.getAttribute("aria-selected")) !== "true"; i++) await headerSearch(page).press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
}
