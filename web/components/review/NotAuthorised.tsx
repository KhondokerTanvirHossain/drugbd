import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import ReviewToolbar from "./ReviewToolbar";
import styles from "@/app/review/review.module.css";

/**
 * §5.12 "Not authorised": a signed-in account that is not on REVIEWERS. No batch data. The only email shown is the
 * owner's own (§2.2). "Use another Google account" signs out, then opens sign-in with returnTo=/review.
 */
export default function NotAuthorised({ session, theme }: { session: Session; theme: Theme }) {
  return (
    <div className={styles.shell}>
      <ReviewToolbar session={session} theme={theme} batchId={null} />
      <main id="content" className={styles.page}>
        <Banner tone="info" title={DESK.noAuthTitle} body={DESK.noAuthPageBody} />
        <Banner tone="warn" title={DESK.notAuthWarnTitle} body={fill(DESK.notAuthWarnBody, { email: session.email })} />
        <div className={styles.actions}>
          <form action="/signout" method="post">
            <input type="hidden" name="returnTo" value="/review" />
            <button type="submit" className={buttonClass("tonal")}>{DESK.useAnother}</button>
          </form>
          <a className={buttonClass("plain")} href="/search">{DESK.searchMedicines}</a>
        </div>
      </main>
    </div>
  );
}
