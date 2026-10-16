import "server-only";
import { P1C_COPY } from "./copy";
import { actsAsPharmacist, type ReviewerRole } from "./review-types";

export type { ReviewerRole };
/** §5.13: the one test for pharmacist powers. Defined client-safe in review-types (the desk island needs it). */
export { actsAsPharmacist };
export type Role = ReviewerRole | "user";
/** lib/session.ts rejects a role outside this list: without `senior`, a senior session would decode to null (§5.13). */
export const ROLES: readonly Role[] = ["pharmacist", "engineer", "senior", "user"];
const REVIEWER_ROLES: readonly string[] = ["pharmacist", "engineer", "senior"];

/** Public label for a role. Pages show this, never the email (Global Constraints). */
export const ROLE_LABEL: Record<Role, string> = { pharmacist: "Pharmacist", engineer: "Engineer", senior: P1C_COPY.senior.badge, user: "User" };

const EMAIL = /^[^\s@:,]+@[^\s@:,]+$/;

/**
 * Parses `REVIEWERS` (`email:role,email:role`). Emails are lower-cased; roles are pharmacist, engineer or senior (P1C).
 * Malformed entries are skipped; when an email is listed twice the first entry wins.
 * The list holds personal data, so nothing here is ever logged.
 */
export function parseReviewers(raw: string | undefined): Map<string, ReviewerRole> {
  const reviewers = new Map<string, ReviewerRole>();
  for (const entry of (raw ?? "").split(",")) {
    const parts = entry.split(":");
    if (parts.length !== 2) continue;
    const email = parts[0].trim().toLowerCase();
    const role = parts[1].trim().toLowerCase();
    if (!EMAIL.test(email) || !REVIEWER_ROLES.includes(role)) continue;
    if (!reviewers.has(email)) reviewers.set(email, role as ReviewerRole);
  }
  return reviewers;
}

/** The role for a verified email: its `REVIEWERS` entry, case-insensitive, else `user`. */
export function roleFor(email: string, raw: string | undefined = process.env.REVIEWERS): Role {
  return parseReviewers(raw).get(email.trim().toLowerCase()) ?? "user";
}

/** True for a pharmacist, engineer or senior session; every other session (and none) sees public data only. */
export function isReviewer<S extends { role: string }>(session: S | null | undefined): session is S & { role: ReviewerRole } {
  return session !== null && session !== undefined && REVIEWER_ROLES.includes(session.role);
}
