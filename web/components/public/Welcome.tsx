import { initials } from "@/components/review/ReviewAccount";
import { buttonClass } from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import { SIGNIN_CARD } from "@/lib/public-copy";
import { DESK, fillNodes } from "@/lib/review-copy";
import { ROLE_LABEL } from "@/lib/reviewers";
import type { Session } from "@/lib/session";
import styles from "@/app/signin/page.module.css";

function SignOut() {
  return <form method="post" action="/signout"><button type="submit" className={buttonClass("plain", "sm")}>{SIGNIN_CARD.signOut}</button></form>;
}

/** §6.2 welcome states. Own name and email only to their owner, in the reader's account row (§9.7). */
export default function Welcome({ session, batch, undo }: { session: Session; batch: { id: string; waiting: number } | null; undo: number }) {
  const name = (session.name ?? "").trim() || session.email;
  if (session.role === "user") {
    return (
      <div className={styles.state}>
        <div className={styles.acct}>
          <span aria-hidden="true" className="avatar">{initials(session)}</span>
          <span className={styles.acctTxt}><b>{name}</b>{session.email !== name && session.email}</span>
        </div>
        <h2 className={styles.h2}>{SIGNIN_CARD.readerHeading}</h2>
        <p>{SIGNIN_CARD.readerBody}</p>
        <div className={styles.row}><a className={buttonClass("primary", "sm")} href="/search">{DESK.searchMedicines}</a><SignOut /></div>
      </div>
    );
  }
  const senior = session.role === "senior";
  const id = batch?.id ?? "";
  return (
    <div className={styles.state}>
      <p className={styles.row}><span className="role-badge"><span className={`ico ${styles.shield}`} aria-hidden="true" />{ROLE_LABEL[session.role]}</span><span className={styles.who}>{fill(SIGNIN_CARD.signedInAs, { name })}</span></p>
      {batch && <h2 className={styles.h2}>{senior ? fill(PUBLIC_NEW.welcome.welcomeSeniorHeading, { id }) : fill(SIGNIN_CARD.reviewerHeading, { role: session.role, id })}</h2>}
      <ol className={styles.next}>
        {batch && <li><span>{fillNodes(SIGNIN_CARD.stepWaiting, { n: batch.waiting, pill: <ReviewStatus status="pending" /> })}</span></li>}
        <li><span>{fillNodes(SIGNIN_CARD.stepCompare, { a: <Kbd keys="A" />, undo, u: <Kbd keys="U" /> })}</span></li>
        <li><span>{session.role === "engineer" ? PUBLIC_NEW.welcome.welcomeEngineerStep
          : fillNodes(SIGNIN_CARD.stepPharmacist, { pill: <ReviewStatus status="back_in_review" /> })}</span></li>
        {senior && <li><span>{PUBLIC_NEW.welcome.welcomeSeniorStep} <a href="/review/pairs">{PUBLIC_NEW.welcome.openPairQueue}</a></span></li>}
      </ol>
      <div className={styles.row}><a className={buttonClass("primary")} href="/review">{DESK.openDesk}</a><span className={styles.who}>{SIGNIN_CARD.shortcutsNote}</span></div>
    </div>
  );
}
