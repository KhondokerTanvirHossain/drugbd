import { cookies } from "next/headers";
import Welcome from "@/components/public/Welcome";
import { newestInReview } from "@/components/review/ReviewAccount";
import Banner from "@/components/ui/Banner";
import BrandIcon from "@/components/ui/BrandIcon";
import Wordmark from "@/components/ui/Wordmark";
import { listReviewBatches } from "@/lib/api";
import { SIGN_IN, SIGN_IN_STATES } from "@/lib/copy";
import { parseUndo, UNDO_COOKIE } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { SIGNIN_CARD } from "@/lib/public-copy";
import { safeReturnTo } from "@/lib/return-to";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import SignInButton, { type FirebaseWebConfig } from "./SignInButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · IntelliDrugs" };

/** §6.2: Board P's sign-in card (P1A's function inside it) and, once signed in, the welcome state (?welcome=1). */
export default async function SignInPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string | string[] }> }) {
  const session = await getSession();
  const brand = <div className={styles.brand}><BrandIcon size={32} /><Wordmark size={19} /></div>;

  if (session) {
    const batches = session.role === "user" ? [] : await listReviewBatches().catch(() => []);
    const id = newestInReview(batches);
    const b = batches.find((x) => x.batchId === id);
    const undo = parseUndo((await cookies()).get(UNDO_COOKIE)?.value);
    return (
      <section className={styles.stage}>
        <div className={styles.card}>
          {brand}
          <h1 className={styles.h1}>{SIGN_IN.heading}</h1>
          <Welcome session={session} batch={b ? { id: b.batchId, waiting: b.counts.needsReview } : null} undo={undo} />
        </div>
      </section>
    );
  }

  const origin = siteOrigin();
  const returnTo = safeReturnTo(firstParam((await searchParams)?.returnTo), origin);
  const config: FirebaseWebConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const siteKey = turnstileSiteKey();
  const configured = Object.values(config).every((v) => v.length > 0);
  return (
    <section className={styles.stage}>
      <div className={styles.card}>
        {brand}
        <div><h1 className={styles.h1}>{SIGN_IN.heading}</h1><p className={styles.sub}>{SIGN_IN.sub}</p></div>
        {configured && siteKey ? (
          <>
            <SignInButton config={config} siteKey={siteKey} returnTo={returnTo} siteOrigin={origin} nonce={await cspNonce()} />
            <noscript><p>{SIGN_IN_STATES.noScript}</p></noscript>
          </>
        ) : (
          <Banner tone="info" role="note" title={SIGN_IN_STATES.notConfiguredTitle} body={SIGN_IN_STATES.notConfiguredBody} />
        )}
        <div className={styles.invite}><span className="ico" aria-hidden="true" /><p><b>{SIGNIN_CARD.inviteLead}</b> {SIGNIN_CARD.inviteBody}</p></div>
        <p className={styles.privacy}>{SIGNIN_CARD.privacy} <a href="/privacy">{SIGNIN_CARD.privacyLink}</a></p>
      </div>
    </section>
  );
}
