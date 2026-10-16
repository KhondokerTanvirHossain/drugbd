import AccountMenu from "@/components/AccountMenu";
import ThemeSwitch from "@/components/ThemeSwitch";
import { buttonClass } from "@/components/ui/Button";
import { initials, newestInReview } from "@/lib/account";
import { DESK_NEW, P1C_COPY } from "@/lib/copy";
import type { KeysSetting } from "@/lib/desk-settings";
import { DESK, ROLE_LABEL_DESK } from "@/lib/review-copy";
import { isReviewer } from "@/lib/reviewers";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import KeysSwitch from "./desk/KeysSwitch";
import styles from "@/app/review/review.module.css";

export { initials, newestInReview };

/**
 * The account menu on /review/* (§6.2): own name and email, role badge and batch, Review desk, Problem reports and
 * partner requests, the theme, "Keyboard shortcuts and settings" (desk only; shown once the desk is running) and the
 * single-key shortcuts control, then Sign out. Links are plain <a>: leaving /review is a document navigation.
 */
export default function ReviewAccount({ session, theme, batchId, keys, shortcutsItem }:
    { session: Session; theme: Theme; batchId: string | null; keys: KeysSetting; shortcutsItem: boolean }) {
  const reviewer = isReviewer(session);
  const name = (session.name ?? "").trim() || session.email;
  return (
    <AccountMenu>
      <summary className={styles.avatar}>
        <span aria-hidden="true">{initials(session)}</span><span className="sr-only">{`Account menu for ${name}`}</span>
      </summary>
      <div className={styles.panel}>
        <p className={styles.who}><b>{name}</b><span>{session.email}</span></p>
        {reviewer && <p><span className="role-badge">{ROLE_LABEL_DESK[session.role]}</span>
          {batchId && <> {DESK.batchPrefix} <span className="mono">{batchId}</span></>}</p>}
        {reviewer && <a className={styles.menuLink} href="/review">{DESK.reviewDesk}</a>}
        {reviewer && <a className={styles.menuLink} href="/review/flags">{DESK_NEW.reviewLists.flagsLink}</a>}
        {reviewer && session.role === "senior" && <a className={styles.menuLink} href="/review/pairs">{P1C_COPY.senior.seniorReview}</a>}
        {reviewer && shortcutsItem && (
          <button type="button" className={buttonClass("plain", "sm")} data-desk-open="sheet" hidden>{DESK_NEW.shortcutsMenuItem.item}</button>
        )}
        <ThemeSwitch value={theme} />
        {reviewer && <><span className={styles.label}>{DESK_NEW.deskSettings.keysLabel}</span><KeysSwitch value={keys} /></>}
        <form method="post" action="/signout"><button type="submit" className={buttonClass("plain", "sm")}>Sign out</button></form>
      </div>
    </AccountMenu>
  );
}
