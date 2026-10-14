import ReviewStatus from "@/components/ui/ReviewStatus";
import { DESK_NEW, NOT_REVIEWED, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { DiffRow, ReviewItem } from "@/lib/review-types";
import DiffTable from "../desk/DiffTable";
import s from "./detail.module.css";

/** §5.11 "Back in review" card: why the record left public view, and the diff when there is one. */
export default function BackInReviewCard({ item, diff }: { item: ReviewItem; diff: DiffRow[] | null }) {
  const text = item.reopen?.reason === "shared_change" ? DESK_NEW.history.backSharedChange : fill(DESK.backRerun, { notReviewed: NOT_REVIEWED });
  return (
    <div className={s.noteCard}>
      <div><ReviewStatus status="back_in_review" /></div>
      <p>{text}</p>
      {diff && diff.length > 0 && <DiffTable rows={diff} />}
    </div>
  );
}
