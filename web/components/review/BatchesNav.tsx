import { DESK } from "@/lib/review-copy";
import type { ReviewBatchSummary } from "@/lib/review-types";
import { batchHref } from "./desk/hrefs";
import s from "./sidebar.module.css";

/** §5.1 sidebar "Batches": stack icon, mono id, item count; the current batch has aria-current; a click clears filter and search. */
export default function BatchesNav({ batches, current }: { batches: ReviewBatchSummary[]; current: string }) {
  return (
    <div>
      <p className="chrome-heading">{DESK.batchesHeading}</p>
      <div className="filters" role="group" aria-label={DESK.batchesHeading}>
        {batches.map((b) => (
          <a key={b.batchId} className="filter" href={batchHref(b.batchId)} aria-current={b.batchId === current ? "true" : undefined}>
            <span className={`ico ${s.icoStack}`} aria-hidden="true" /><span className="mono">{b.batchId}</span>
            <span className="filter-n">{b.itemCount}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
