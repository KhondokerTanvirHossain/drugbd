import Banner from "@/components/ui/Banner";
import ProgressMeter from "@/components/ui/ProgressMeter";
import { DESK_NEW, fill } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { DESK, REVIEW_LISTS, fillNodes } from "@/lib/review-copy";
import type { ReviewBatchSummary } from "@/lib/review-types";
import { batchHref } from "./desk/hrefs";
import styles from "@/app/review/review.module.css";

/** In review first, then by run time, newest first (§5.16). */
export function orderBatches(batches: ReviewBatchSummary[]): ReviewBatchSummary[] {
  const rank = (b: ReviewBatchSummary) => (b.status === "in_review" ? 0 : 1);
  return [...batches].sort((a, b) => rank(a) - rank(b) || b.runAt.localeCompare(a.runAt));
}

/** §5.16 body of /review: one info banner per batch in review (w = records not yet approved), then every batch. */
export default function BatchList({ batches }: { batches: ReviewBatchSummary[] }) {
  const t = DESK_NEW.reviewLists;
  const ordered = orderBatches(batches);
  const inReview = ordered.filter((b) => b.status === "in_review");
  return (
    <>
      {inReview.length === 0 ? <p>{t.noBatches}</p> : inReview.map((b) => {
        const w = b.itemCount - b.counts.approved;
        return (
          <Banner key={b.batchId} tone="info" body={REVIEW_LISTS.batchBannerBody}
            title={fillNodes(w === 1 ? t.waitingOne : t.waitingMany, { id: <span className="mono">{b.batchId}</span>, w })} />
        );
      })}
      <ul className={styles.list}>
        {ordered.map((b) => (
          <li key={b.batchId}>
            <a className={styles.row} href={batchHref(b.batchId)}>
              <span className="mono">{b.batchId}</span>
              <ProgressMeter approved={b.counts.approved} issue={b.counts.issue} total={b.itemCount} />
              <span className={styles.rowMeta}>
                <span className="num">{fill(DESK.approvedOf, { a: b.counts.approved, n: b.itemCount })}</span>
                <span>{DESK.cardStatus} <b>{b.status === "approved" ? DESK.approvedStatus : DESK.inReview}</b></span>
                <span>{fill(DESK.run, { date: fmtUtc(b.runAt) })}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
