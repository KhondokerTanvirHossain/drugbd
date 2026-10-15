import AccountMenu from "@/components/AccountMenu";
import ThemeSwitch from "@/components/ThemeSwitch";
import { buttonClass } from "@/components/ui/Button";
import Wordmark from "@/components/ui/Wordmark";
import { DESK_NEW, P1C_COPY } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { ROLE_LABEL, isReviewer } from "@/lib/reviewers";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import styles from "./Header.module.css";

/** Two initials from the display name, else from the email's parts. */
const initials = (s: Session) => ((s.name ?? "").trim() || s.email)
  .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/**
 * Site header. The owner's own name and email appear only inside their account menu (§2.2); nobody else's email
 * is ever rendered. Reviewers reach the review surface from the account menu (§6.2); P2 replaces the navigation (§6.1).
 */
export default function Header({ session, theme, batchId = null }: { session: Session | null; theme: Theme; batchId?: string | null }) {
  const reviewer = isReviewer(session);
  const displayName = session ? (session.name ?? "").trim() || session.email : "";
  return (
    <header className={styles.bar}>
      <a className={styles.home} href="/"><Wordmark size={20} /></a>
      <nav className={styles.nav} aria-label="Main">
        <a href="/check">Interaction checker</a>
        <a href="/learn">Learn</a>
      </nav>
      <div className={styles.end}>
        {session ? (
          <AccountMenu>
            <summary className={styles.avatar}>
              <span aria-hidden="true">{initials(session)}</span><span className="sr-only">{`Account menu for ${displayName}`}</span>
            </summary>
            <div className={styles.panel}>
              <p className={styles.who}><b>{displayName}</b><span>{session.email}</span></p>
              {reviewer && (
                <p><span className="role-badge">{ROLE_LABEL[session.role]}</span>
                  {batchId && <> {DESK.batchPrefix} <span className="mono">{batchId}</span></>}</p>
              )}
              {reviewer && <a href="/review">{DESK.reviewDesk}</a>}
              {reviewer && <a href="/review/flags">{DESK_NEW.reviewLists.flagsLink}</a>}
              {reviewer && session.role === "senior" && <a href="/review/pairs">{P1C_COPY.senior.seniorReview}</a>}
              <ThemeSwitch value={theme} />
              <form method="post" action="/signout"><button type="submit" className={buttonClass("plain", "sm")}>Sign out</button></form>
            </div>
          </AccountMenu>
        ) : (
          <a className={buttonClass("tonal", "sm")} href="/signin">Sign in</a>
        )}
      </div>
    </header>
  );
}
