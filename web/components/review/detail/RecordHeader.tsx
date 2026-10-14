import type { ReactNode } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { DESK_NEW } from "@/lib/copy";
import { DESK, fillNodes } from "@/lib/review-copy";
import type { ReviewItem } from "@/lib/review-types";
import s from "./detail.module.css";

/** §5.5.1 header and the §5.2 chips: the status pill, plus "Not yet reviewed by a pharmacist" for the in-between states. */
export default function RecordHeader({ item, tools, backHref }: { item: ReviewItem; tools: ReactNode; backHref: string }) {
  const b = item.brand;
  const extraPending = item.displayStatus === "engineer_checked" || item.displayStatus === "issue" || item.displayStatus === "back_in_review";
  return (
    <div className={s.hd}>
      <div className={s.hdMain}>
        <a className={s.backToList} href={backHref}>{DESK_NEW.deskMisc.backToList}</a>
        <p className={s.crumb}>{fillNodes(DESK.crumb, { id: <span className="mono">{item.batchId}</span>, k: item.index, n: item.total })}</p>
        <h1 className={s.title}>{b?.tradeName ?? item.conceptId}</h1>
        {b && <p className={s.meta}>{b.company}, <span className={`mono ${s.nowrap}`}>DAR {b.darNumber}</span>, {b.dosageForm}</p>}
        <div className={s.chips}>
          <ReviewStatus status={item.displayStatus} />
          {extraPending && <ReviewStatus status="pending" />}
          <span className={s.vis}>{item.displayStatus === "approved" ? DESK.visApproved : DESK.visHidden}</span>
        </div>
      </div>
      {tools}
    </div>
  );
}
