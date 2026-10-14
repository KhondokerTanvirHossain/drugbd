import Turnstile from "@/components/Turnstile";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW, STALE_TITLE, fill } from "@/lib/copy";
import { decideFormAction } from "@/lib/desk-actions";
import { DESK } from "@/lib/review-copy";
import type { ReviewItem, ReviewerRole } from "@/lib/review-types";
import { recordHref } from "../desk/hrefs";
import s from "./detail.module.css";

const REFUSED: Record<string, string> = {
  issue_open: DESK.issueOpen, already_approved: DESK.alreadyApproved, already_checked: DESK.alreadyChecked,
  removed: DESK_NEW.approvalRefused.removedHint, stage_failed: DESK_NEW.approvalRefused.commitHint,
};

/**
 * §5.8.6 confirm step. Confirm posts commit=confirmed with the x, d and r values from the URL, never the current ones,
 * and a token from its own implicit widget. A version that no longer matches shows the stale banner and no Confirm.
 */
export default function ConfirmPanel({ item, role, x, d, r, error, nonce }:
    { item: ReviewItem; role: ReviewerRole; x: string; d: string; r: string; error: string | null; nonce?: string }) {
  const name = item.brand?.tradeName ?? item.conceptId;
  const cur = item.version;
  const rerun = (x || null) !== cur.extractedAt;
  const other = !rerun && (d ? Number(d) : null) !== cur.lastDecisionId;
  if (rerun || other)
    return <Banner tone="warn" title={STALE_TITLE} body={fill(rerun ? DESK.staleBodyRerun : DESK_NEW.deskMisc.staleOtherReviewer, { name })} />;
  const m = DESK_NEW.deskMisc;
  return (
    <div className={s.sec}>
      {error === "captcha" && <Banner tone="crit" title={DESK.botError} />}
      {(error === "rate_limited" || error === "failed" || error === "invalid") &&
        <Banner tone="crit" title={DESK.netTitle} body={fill(DESK.netBody, { name })} />}
      {error && REFUSED[error] && <Banner tone="info" title={REFUSED[error]} />}
      <Banner tone="info" title={fill(m.confirmTitle, { name })}
        body={`${m.confirmBody} ${role === "pharmacist" ? m.confirmPharmacist : m.confirmEngineer}`} />
      <form action={decideFormAction} className={s.chipRow}>
        <input type="hidden" name="batchId" value={item.batchId} />
        <input type="hidden" name="conceptId" value={item.conceptId} />
        <input type="hidden" name="decision" value="ok" />
        <input type="hidden" name="extractedAt" value={x} />
        <input type="hidden" name="expectedLastDecisionId" value={d} />
        <input type="hidden" name="requestId" value={r} />
        <input type="hidden" name="commit" value="confirmed" />
        <Turnstile action="decision" nonce={nonce} />
        <button type="submit" className="btn btn--primary">{m.confirm}</button>
        <a className={buttonClass("plain")} href={recordHref(item.batchId, item.conceptId)}>{m.cancel}</a>
      </form>
    </div>
  );
}
