import type { ReactNode } from "react";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { P1C_COPY, fill } from "@/lib/copy";
import type { KeysSetting } from "@/lib/desk-settings";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import shell from "@/app/review/review.module.css";
import s from "./pages.module.css";

/**
 * §5.17: the reviewer toolbar with "Senior review" and "{t} pair[s] to review" in place of the batch centre, the nav row,
 * and one column of at most 960 px. `toReview` is null when the page has no count to show (and for non-seniors).
 */
export default function SeniorShell({ session, theme, keys, current, toReview, children }: {
  session: Session; theme: Theme; keys: KeysSetting; current: "queue" | "substances" | null; toReview: number | null; children: ReactNode;
}) {
  const r = P1C_COPY.review, sr = P1C_COPY.senior;
  const center = (
    <div className={s.center}>
      <span>{sr.seniorReview}</span>
      {toReview !== null && <span className="num">{fill(toReview === 1 ? r.pairsToReviewOne : r.pairsToReviewMany, { t: toReview })}</span>}
    </div>
  );
  return (
    <div className={`${shell.shell} ${s.senior}`}>
      <ReviewToolbar session={session} theme={theme} batchId={null} keys={keys} center={center} />
      <nav className={s.nav} aria-label={sr.seniorReview}>
        <a href="/review/pairs" aria-current={current === "queue" ? "page" : undefined}>{sr.pairQueue}</a>
        <a href="/review/substances" aria-current={current === "substances" ? "page" : undefined}>{SHARED_WORDS.substances}</a>
      </nav>
      <main id="content" className={s.page}>{children}</main>
    </div>
  );
}

/** §5.17 "Access": pharmacists and engineers get this banner, with status 200 and no data (§13.1 Q8). */
export function NotSenior() {
  const r = P1C_COPY.review;
  return <Banner tone="info" title={r.notAuthTitle} body={r.notAuthBody}
    action={<a className={buttonClass("tonal", "sm")} href="/review">{DESK.openDesk}</a>} />;
}
