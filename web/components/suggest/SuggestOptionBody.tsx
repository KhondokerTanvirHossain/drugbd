import ReviewStatus from "@/components/ui/ReviewStatus";
import "@/components/ui/ProblemLine.css";
import { suggestionSub } from "@/lib/check-summary";
import { NOT_REVIEWED, PROBLEM_REPORTED } from "@/lib/copy";
import type { SuggestRow } from "@/lib/public-types";

/** A suggestion as /check/suggest serves it to the islands (§4.3). */
export type SuggestOption = Pick<SuggestRow, "conceptId" | "tradeName" | "status" | "clinicalDisplayName" | "matched" | "review">;

/** A row that carries clinical data: approved, or labelled (show mode serves every visible row in full, §6.10). */
export const hasClinicalData = (r: Pick<SuggestRow, "status" | "review">) => r.status === "approved" || !!r.review;

/**
 * The body of one suggestion option, shared by the checker and the header search (§6.7.1, §6.11.1): the trade name, the
 * `suggestionSub` line (or NOT_REVIEWED for a row without data) and, for a visible row that is not approved, the pill and,
 * for `problem`, the problem line. The classes are the caller's, so each island keeps its own stylesheet.
 */
export default function SuggestOptionBody({ r, nameClass, subClass }: { r: SuggestOption; nameClass: string; subClass: string }) {
  return (
    <>
      <span className={nameClass}>{r.tradeName}</span>
      <span className={subClass}>{hasClinicalData(r) ? suggestionSub(r) : NOT_REVIEWED}</span>
      {/* §6.7 show mode: a visible option that is not approved adds the pill (and the problem line) inside the option,
          so both are part of its accessible name */}
      {r.review && r.review !== "approved" && <span className={subClass}><ReviewStatus status="pending" /></span>}
      {r.review === "problem" && <span className="problem-line">{PROBLEM_REPORTED}</span>}
    </>
  );
}
