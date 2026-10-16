import type { Page } from "@playwright/test";
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
