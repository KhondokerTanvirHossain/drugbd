import { cookies } from "next/headers";
import type { ReactElement } from "react";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { QA_COPY } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import { THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme";
import ReviewToolbar from "./ReviewToolbar";
import styles from "@/app/review/review.module.css";

/**
 * §5.12 "QA account on a review page" (QA portal, D66): a qa session on any /review/* page except /review (which redirects
 * to /review/qa) and /review/qa itself. Status 200, no review data and no review API call: the reviewer toolbar, an info
 * banner, then "Open QA tools" and "Search medicines". No warn banner: the account is on REVIEWERS, so "isn't on the
 * reviewer list" would be false. The banner title is the page's one h1 (§10.5).
 */
export default function QaAccount({ session, theme }: { session: Session; theme: Theme }) {
  const c = QA_COPY.account;
  return (
    <div className={styles.shell}>
      <ReviewToolbar session={session} theme={theme} batchId={null} />
      <main id="content" className={styles.page}>
        <Banner tone="info" titleAs="h1" title={c.title} body={c.body} />
        <div className={styles.actions}>
          <a className={buttonClass("tonal")} href="/review/qa">{c.openQaTools}</a>
          <a className={buttonClass("plain")} href="/search">{DESK.searchMedicines}</a>
        </div>
      </main>
    </div>
  );
}

/** The view for a review page or layout, with the viewer's theme; the only thing a qa session gets there. */
export async function qaAccountView(session: Session): Promise<ReactElement> {
  return <QaAccount session={session} theme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />;
}
