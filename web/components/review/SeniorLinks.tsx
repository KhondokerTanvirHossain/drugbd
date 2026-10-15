import { P1C_COPY } from "@/lib/copy";
import { SHARED_WORDS } from "@/lib/review-copy";

/** §5.1 (P1C, seniors only): the sidebar's "Senior review" block. The count is the pairs to review; absent when unread. */
export default function SeniorLinks({ toReview }: { toReview: number | null }) {
  const sr = P1C_COPY.senior;
  return (
    <div>
      <p className="chrome-heading">{sr.seniorReview}</p>
      <div className="filters" role="group" aria-label={sr.seniorReview}>
        <a className="filter" href="/review/pairs">{sr.pairQueue}{toReview !== null && <span className="filter-n">{toReview}</span>}</a>
        <a className="filter" href="/review/substances">{SHARED_WORDS.substances}</a>
      </div>
    </div>
  );
}
