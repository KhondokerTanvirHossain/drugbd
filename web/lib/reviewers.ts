import "server-only";
import { P1C_COPY, QA_COPY } from "./copy";
import { actsAsPharmacist, type ReviewerRole } from "./review-types";

export type { ReviewerRole };
/** §5.13: the one test for pharmacist powers. Defined client-safe in review-types (the desk island needs it). */
export { actsAsPharmacist };
/**
 * `qa` (QA portal, D66) is a role on REVIEWERS but not a reviewer role: it reads data through QA tools only and can never
 * decide, so ReviewerRole (and every decision type) stays without it.
 */
export type ListedRole = ReviewerRole | "qa";
export type Role = ListedRole | "user";
/**
 * lib/session.ts rejects a role outside this list: without `senior` a senior session, and without `qa` a qa session, would
 * decode to null (§5.13).
 */
export const ROLES: readonly Role[] = ["pharmacist", "engineer", "senior", "qa", "user"];
const REVIEWER_ROLES: readonly string[] = ["pharmacist", "engineer", "senior"];
const LISTED_ROLES: readonly string[] = [...REVIEWER_ROLES, "qa"];
/** §7.10.1: the roles that may use QA tools, create QA keys and own a working DB key. Pharmacists and readers may not. */
const QA_ROLES: readonly string[] = ["qa", "engineer", "senior"];

/** Public label for a role. Pages show this, never the email (Global Constraints). */
export const ROLE_LABEL: Record<Role, string> = {
  pharmacist: "Pharmacist", engineer: "Engineer", senior: P1C_COPY.senior.badge, qa: QA_COPY.role.badge, user: "User",
};

const EMAIL = /^[^\s@:,]+@[^\s@:,]+$/;

/**
 * Parses `REVIEWERS` (`email:role,email:role`). Emails are lower-cased; roles are pharmacist, engineer, senior (P1C) or qa
 * (QA portal). Malformed entries are skipped; when an email is listed twice the first entry wins.
 * The list holds personal data, so nothing here is ever logged.
 */
export function parseReviewers(raw: string | undefined): Map<string, ListedRole> {
  const reviewers = new Map<string, ListedRole>();
  for (const entry of (raw ?? "").split(",")) {
    const parts = entry.split(":");
    if (parts.length !== 2) continue;
    const email = parts[0].trim().toLowerCase();
    const role = parts[1].trim().toLowerCase();
    if (!EMAIL.test(email) || !LISTED_ROLES.includes(role)) continue;
    if (!reviewers.has(email)) reviewers.set(email, role as ListedRole);
  }
  return reviewers;
}

/** The role for a verified email: its `REVIEWERS` entry, case-insensitive, else `user`. */
export function roleFor(email: string, raw: string | undefined = process.env.REVIEWERS): Role {
  return parseReviewers(raw).get(email.trim().toLowerCase()) ?? "user";
}

/** True for a pharmacist, engineer or senior session; every other session (`qa` and `user` included, and none) is not a reviewer. */
export function isReviewer<S extends { role: string }>(session: S | null | undefined): session is S & { role: ReviewerRole } {
  return session !== null && session !== undefined && REVIEWER_ROLES.includes(session.role);
}

/** §7.10.1 (D66): the one test for QA tools (the QA page, QA keys, a DB key's owner): true for qa, engineer and senior only. */
export function canUseQa(role: string | null | undefined): boolean {
  return typeof role === "string" && QA_ROLES.includes(role);
}
