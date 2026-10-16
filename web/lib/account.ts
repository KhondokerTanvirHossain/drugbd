import type { ReviewBatchSummary } from "./review-types";
import type { Session } from "./session";

// Plain helpers with no stylesheet beside them: the root layout, /signin and the welcome import them from here, so
// review.module.css (and the merged review, desk and Learn CSS chunk it lands in) never loads on a public page (§10.6).

/** Two initials from the display name, else from the email's parts (the account menu and the reader welcome, §6.2). */
export const initials = (s: Session) => ((s.name ?? "").trim() || s.email)
  .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** The newest in_review batch: the one the copy "Batch {id}" names (§5.13). */
export function newestInReview(batches: ReviewBatchSummary[]): string | null {
  return [...batches].filter((b) => b.status === "in_review").sort((a, b) => b.runAt.localeCompare(a.runAt))[0]?.batchId ?? null;
}
