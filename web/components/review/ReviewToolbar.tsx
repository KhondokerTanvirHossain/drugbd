import type { ReactNode } from "react";
import Wordmark from "@/components/ui/Wordmark";
import type { KeysSetting } from "@/lib/desk-settings";
import { QA_COPY } from "@/lib/copy";
import { ROLE_LABEL_DESK } from "@/lib/review-copy";
import { ROLE_LABEL, canUseQa, isReviewer } from "@/lib/reviewers";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import ReviewAccount from "./ReviewAccount";
import styles from "@/app/review/review.module.css";

/**
 * The reviewer toolbar (§5.1) for /review, /review/flags, the senior pages, /review/qa and the not-authorised and QA account
 * views: no batch centre section (§5.16). QA portal: a plain "QA tools" link before the role badge for qa, engineer and
 * senior (current on /review/qa), and the badge "QA" for a qa account.
 */
export default function ReviewToolbar({ session, theme, batchId, keys = "on", center, current }:
    { session: Session; theme: Theme; batchId: string | null; keys?: KeysSetting; center?: ReactNode; current?: "qa" }) {
  const reviewer = isReviewer(session);
  return (
    <header className={`chrome-toolbar material ${styles.toolbar}`}>
      <a href="/review" className={styles.wordmark}><Wordmark size={17} sub="Review" /></a>
      {center}
      <div className={styles.toolbarRight}>
        {canUseQa(session.role) && (
          <a className={styles.toolbarLink} href="/review/qa" aria-current={current === "qa" ? "page" : undefined}>{QA_COPY.role.qaTools}</a>
        )}
        {reviewer && <span className="role-badge">{ROLE_LABEL_DESK[session.role]}</span>}
        {session.role === "qa" && <span className="role-badge">{ROLE_LABEL.qa}</span>}
        <ReviewAccount session={session} theme={theme} batchId={batchId} keys={keys} shortcutsItem={false} />
      </div>
    </header>
  );
}
