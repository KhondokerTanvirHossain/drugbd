import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";

/*
 * PAIR_REVIEWED and PAIR_NOT_REVIEWED on the public checker (§6.7.3, §3.4, G3). Runs after every spec that reads pair
 * reviews, because ops.pair_review is append-only and this row cannot be removed.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const A = "DDInter1951", B = "DDInter20";   // Warfarin + Acetylsalicylic acid: Major in the pilot seed (stored a < b)
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const PAIR = `ddinter_a = ${lit(A)} AND ddinter_b = ${lit(B)}`;
const MARK = "E2E-UPDATED ";
const textId = () => sql(`SELECT interaction_id FROM curated.ddinter_pair WHERE ${PAIR}`);

/** DdinterText.clean: placeholders and blanks are no text; the rest is stripped. */
const PLACEHOLDERS = new Set(["none", "null", "n/a", "na", "-", "--", ""]);
const clean = (v: string | null): string | null => (v === null || PLACEHOLDERS.has(v.trim().toLowerCase()) ? null : v.trim());

/** §7.7 PairContent: SHA-256 hex of the compact UTF-8 JSON [a, b, severity, sorted(actions), interaction|null, management|null]. */
function current(): { content: { severity: string; actions: string[]; interaction: string | null; management: string | null }; hash: string } {
  const row = JSON.parse(sql(`SELECT json_build_object('severity', p.severity, 'actions', p.actions,
      'interaction', t.interaction, 'management', t.management)::text
    FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
    WHERE p.ddinter_a = ${lit(A)} AND p.ddinter_b = ${lit(B)}`));
  const content = { severity: row.severity as string, actions: [...((row.actions as string[] | null) ?? [])].sort(),
    interaction: clean(row.interaction), management: clean(row.management) };
  const canonical = JSON.stringify([A, B, content.severity, content.actions, content.interaction, content.management]);
  return { content, hash: createHash("sha256").update(canonical, "utf8").digest("hex") };
}

test.beforeAll(() => publish(P.warfarin, P.aspirin));
test.afterAll(() => {
  sql(`UPDATE curated.ddinter_interaction_text SET management = substr(management, ${MARK.length + 1})
       WHERE interaction_id = ${lit(textId())} AND management LIKE ${lit(MARK + "%")}`);
  resetPublic();
});

test("a current senior review reads PAIR_REVIEWED as plain text; once DDInter changes the text it reads PAIR_NOT_REVIEWED and the alert stays (§6.7.3, G3)", async ({ page }) => {
  const { content, hash } = current();
  sql(`INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
       VALUES (${lit(A)}, ${lit(B)}, 'reviewed', '', ${lit(hash)}, ${lit(JSON.stringify(content))}::jsonb, 'senior@e2e.test', 'senior')`);
  const date = sql(`SELECT to_char(max(decided_at) AT TIME ZONE 'Asia/Dhaka', 'DD/MM/YYYY') FROM ops.pair_review WHERE ${PAIR}`);
  const shown = (content.management ?? content.interaction ?? "").slice(0, 40);
  expect(shown).not.toBe("");

  await page.goto(`/check?ids=${P.warfarin}&ids=${P.aspirin}`);
  await expect(page.getByRole("heading", { name: /^Major, 1 pair$/ })).toBeVisible();
  const reviewed = page.getByText(`Pair reviewed by a senior pharmacist on ${date}`);
  await expect(reviewed).toBeVisible();
  // plain text: never green and never a review-status pill (§3.4 mark exclusivity)
  await expect(reviewed.locator("xpath=ancestor-or-self::*[contains(@class, 'rv--')]")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Pair not yet reviewed by a senior pharmacist");

  // DDInter changes the management text: the hash moves, so the review no longer counts in public; the pair stays (G3)
  sql(`UPDATE curated.ddinter_interaction_text SET management = ${lit(MARK)} || management WHERE interaction_id = ${lit(textId())}`);
  await page.goto(`/check?ids=${P.warfarin}&ids=${P.aspirin}`);
  await expect(page.getByRole("heading", { name: /^Major, 1 pair$/ })).toBeVisible();
  await expect(page.locator("main")).toContainText(MARK.trim());
  await expect(page.getByText("Pair not yet reviewed by a senior pharmacist").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(`Pair reviewed by a senior pharmacist on ${date}`);
});
