import type { ReactNode } from "react";
import Wordmark from "@/components/ui/Wordmark";
import type { KeysSetting } from "@/lib/desk-settings";
import { ROLE_LABEL_DESK } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import ReviewAccount from "./ReviewAccount";
import styles from "@/app/review/review.module.css";

/** The reviewer toolbar (§5.1) for /review, /review/flags and the not-authorised page: no batch centre section (§5.16). */
export default function ReviewToolbar({ session, theme, batchId, keys = "on", center }:
    { session: Session; theme: Theme; batchId: string | null; keys?: KeysSetting; center?: ReactNode }) {
  const reviewer = session.role === "pharmacist" || session.role === "engineer";
  return (
    <header className={`chrome-toolbar material ${styles.toolbar}`}>
      <a href="/review" className={styles.wordmark}><Wordmark size={17} sub="Review" /></a>
      {center}
      <div className={styles.toolbarRight}>
        {reviewer && <span className="role-badge">{ROLE_LABEL_DESK[session.role as "pharmacist" | "engineer"]}</span>}
        <ReviewAccount session={session} theme={theme} batchId={batchId} keys={keys} shortcutsItem={false} />
      </div>
    </header>
  );
}
