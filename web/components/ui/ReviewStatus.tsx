import { APPROVED, BACK_IN_REVIEW, ENGINEER_CHECKED, ISSUE_REPORTED, NOT_REVIEWED } from "@/lib/copy";

export type ReviewDisplayStatus = "pending" | "approved" | "engineer_checked" | "issue" | "back_in_review";
/** The only statuses a public view may render (§3.4). */
export type PublicReviewStatus = "pending" | "approved";

const FULL: Record<ReviewDisplayStatus, string> = { pending: NOT_REVIEWED, approved: APPROVED,
  engineer_checked: ENGINEER_CHECKED, issue: ISSUE_REPORTED, back_in_review: BACK_IN_REVIEW };
const CLASS: Record<ReviewDisplayStatus, string> = { pending: "rv--pending", approved: "rv--approved",
  engineer_checked: "rv--engineer", issue: "rv--issue", back_in_review: "rv--back" };

const BY = " by a pharmacist";
/** Split a full sentence into the visible short form and the sr-only rest (§3.4 compact pills). */
const split = (full: string): [string, string] => [full.slice(0, full.length - BY.length), BY];
const COMPACT: Partial<Record<ReviewDisplayStatus, [string, string]>> = {
  pending: split(NOT_REVIEWED),
  approved: split(APPROVED),
  engineer_checked: [ENGINEER_CHECKED, `. ${NOT_REVIEWED}`],
};

/** §3.4 ReviewStatus pills. `compact` is allowed only in the reviewer record list. */
export default function ReviewStatus({ status, compact = false }: { status: ReviewDisplayStatus; compact?: boolean }) {
  const short = compact ? COMPACT[status] : undefined;
  return (
    <span className={`rv ${CLASS[status]}${compact ? " rv--compact" : ""}`}>
      {short ? <>{short[0]}<span className="sr-only">{short[1]}</span></> : FULL[status]}
    </span>
  );
}
