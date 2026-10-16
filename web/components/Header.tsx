import AccountMenu from "@/components/AccountMenu";
import ThemeSwitch from "@/components/ThemeSwitch";
import { buttonClass } from "@/components/ui/Button";
import Wordmark from "@/components/ui/Wordmark";
import { DESK_NEW, P1C_COPY } from "@/lib/copy";
import { NAV } from "@/lib/public-copy";
import { DESK } from "@/lib/review-copy";
import { ROLE_LABEL, isReviewer } from "@/lib/reviewers";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import styles from "./Header.module.css";

/** Two initials from the display name, else from the email's parts. */
const initials = (s: Session) => ((s.name ?? "").trim() || s.email)
  .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

type Section = "medicines" | "checker" | "learn" | "partners";
const LINKS: [Section, string, string][] = [
  ["medicines", "/search", NAV.medicines], ["checker", "/check", NAV.checker], ["learn", "/learn", NAV.learn], ["partners", "/partners", NAV.partners],
];
const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/** The section a path belongs to, for aria-current (§6.1). */
export function navCurrent(path: string): Section | null {
  if (under(path, "/search") || under(path, "/products") || under(path, "/substances")) return "medicines";
  if (under(path, "/check")) return "checker";
  if (under(path, "/learn")) return "learn";
  if (under(path, "/partners")) return "partners";
  return null;
}

/** §6.1: "On search, product and checker pages the bar is `.material` and holds the search field." */
export function hasSearchBar(path: string): boolean {
  return navCurrent(path) === "medicines" || navCurrent(path) === "checker";
}

function Links({ current }: { current: Section | null }) {
  return (
    <ul className={styles.links}>
      {LINKS.map(([key, href, label]) => (
        <li key={key}><a href={href} aria-current={current === key ? "page" : undefined}>{label}</a></li>
      ))}
    </ul>
  );
}

/**
 * Site header. The owner's own name and email appear only inside their account menu (§2.2); nobody else's email
 * is ever rendered. Reviewers reach the review surface from the account menu (§6.2). One <nav aria-label="Main">: the
 * wide link row and the narrow "Menu" <details> are both inside it, and CSS shows one of them (display: none removes the
 * other from the accessibility tree).
 */
export default function Header({ session, theme, batchId = null, path = "/", q = "" }:
    { session: Session | null; theme: Theme; batchId?: string | null; path?: string; q?: string }) {
  const reviewer = isReviewer(session);
  const displayName = session ? (session.name ?? "").trim() || session.email : "";
  const current = navCurrent(path);
  const searchBar = hasSearchBar(path);
  return (
    <header className={searchBar ? `bar material ${styles.bar} ${styles.sticky}` : `bar ${styles.bar}`}>
      <a className={styles.home} href="/"><Wordmark size={searchBar ? 19 : 20} /></a>
      {searchBar && (
        <form role="search" method="get" action="/search" className={styles.searchForm}>
          <label className="search">
            <span className="sr-only">{NAV.searchLabel}</span>
            <input type="search" name="q" defaultValue={q} placeholder={NAV.searchPlaceholder} minLength={2} maxLength={100} />
          </label>
        </form>
      )}
      <nav aria-label={NAV.label} className={styles.nav}>
        <div className={styles.wide}><Links current={current} /></div>
        <details className={styles.narrowMenu}>
          <summary className={buttonClass("tonal", "sm") + " btn--icon"}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            </svg>
            <span className="sr-only">{NAV.menu}</span>
          </summary>
          <div className={styles.menuPanel}><Links current={current} /></div>
        </details>
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
          <>
            <a className={`${buttonClass("tonal", "sm")} signInWide`} href="/signin">{NAV.signIn}</a>
            <a className={`${buttonClass("plain", "sm")} signInNarrow`} href="/signin">{NAV.signIn}</a>
          </>
        )}
      </div>
    </header>
  );
}
