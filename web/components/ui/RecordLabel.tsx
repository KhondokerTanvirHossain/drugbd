import { PROBLEM_REPORTED } from "@/lib/copy";
import type { PublicLabel } from "@/lib/public-mode";
import ProblemLine from "./ProblemLine";
import ReviewStatus from "./ReviewStatus";
import "./ProblemLine.css";

/**
 * A public record's label as §6.10 shows it: the approved pill, or the NOT_REVIEWED pill followed by ProblemLine for a
 * `problem` record. A record with no label (approved-only data) shows the `fallback` pill. `inline` renders the problem
 * line as a span, for phrasing contexts (a button, an option).
 */
export default function RecordLabel({ review, fallback = "approved", inline = false }:
    { review: PublicLabel | null | undefined; fallback?: "approved" | "pending"; inline?: boolean }) {
  const status = review ? (review === "approved" ? "approved" : "pending") : fallback;
  return (
    <>
      <ReviewStatus status={status} />
      {review === "problem" && (inline ? <span className="problem-line">{PROBLEM_REPORTED}</span> : <ProblemLine />)}
    </>
  );
}
