import "server-only";

export type ReviewerRole = "pharmacist" | "engineer";
export type Role = ReviewerRole | "user";
export const ROLES: readonly Role[] = ["pharmacist", "engineer", "user"];

/** Public label for a role. Pages show this, never the email (Global Constraints). */
export const ROLE_LABEL: Record<Role, string> = { pharmacist: "Pharmacist", engineer: "Engineer", user: "User" };

const EMAIL = /^[^\s@:,]+@[^\s@:,]+$/;

/**
 * Parses `REVIEWERS` (`email:role,email:role`). Emails are lower-cased; roles are pharmacist or engineer.
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
    if (!EMAIL.test(email) || (role !== "pharmacist" && role !== "engineer")) continue;
    if (!reviewers.has(email)) reviewers.set(email, role);
  }
  return reviewers;
}

/** The role for a verified email: its `REVIEWERS` entry, case-insensitive, else `user`. */
export function roleFor(email: string, raw: string | undefined = process.env.REVIEWERS): Role {
  return parseReviewers(raw).get(email.trim().toLowerCase()) ?? "user";
}

/** True for a pharmacist or engineer session; every other session (and none) sees public data only. */
export function isReviewer<S extends { role: string }>(session: S | null | undefined): session is S & { role: ReviewerRole } {
  return session?.role === "pharmacist" || session?.role === "engineer";
}
