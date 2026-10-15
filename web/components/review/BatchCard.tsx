import ProgressMeter from "@/components/ui/ProgressMeter";
import { fill } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { DESK } from "@/lib/review-copy";
import type { ReviewBatchSummary } from "@/lib/review-types";
import s from "./sidebar.module.css";

/** §5.1 batch card at the bottom of the sidebar. */
export default function BatchCard({ batch }: { batch: ReviewBatchSummary }) {
  const c = batch.counts, n = batch.itemCount;
  return (
    <div className={s.card}>
      <p className={s.cardT}><b>{fill(DESK.approvedOf, { a: c.approved, n }).replace(" approved", "")}</b> {DESK.cardTitleRest}</p>
      <ProgressMeter approved={c.approved} issue={c.issue} total={n} wide
        label={fill(DESK.cardMeter, { a: c.approved, i: c.issue, needs: c.needsReview })} />
      <dl className={s.dl}>
        <dt>{DESK.cardApproved}</dt><dd>{c.approved}</dd>
        <dt>{DESK.cardIssue}</dt><dd>{c.issue}</dd>
        <dt>{DESK.cardNeeds}</dt><dd>{c.needsReview}</dd>
      </dl>
      <p>{DESK.cardStatus} <b>{batch.status === "approved" ? DESK.approvedStatus : DESK.inReview}</b></p>
      <p>{fill(DESK.approvedWhen, { n })}</p>
      <p>{fill(DESK.run, { date: fmtUtc(batch.runAt) })}</p>
    </div>
  );
}
