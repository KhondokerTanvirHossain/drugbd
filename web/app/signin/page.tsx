import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { SIGN_IN, SIGN_IN_STATES } from "@/lib/copy";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { safeReturnTo } from "@/lib/return-to";
import { ROLE_LABEL } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import SignInButton, { type FirebaseWebConfig } from "./SignInButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · IntelliDrugs" };

/**
 * P1A ships the sign-in function (§12.2): the bot check, the return path and the error states. P2 adds the Board P
 * card and the ?welcome=1 states.
 */
export default async function SignInPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string | string[] }> }) {
  const session = await getSession();
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
    <section className={styles.page}>
      <h1 className="t-title1">{SIGN_IN.heading}</h1>
      {session ? (
        <>
          <p>{`Signed in as ${ROLE_LABEL[session.role]}.`}</p>
          <form method="post" action="/signout"><Button variant="plain" type="submit">Sign out</Button></form>
        </>
      ) : configured && siteKey ? (
        <>
          <p className={styles.sub}>{SIGN_IN.sub}</p>
          <SignInButton config={config} siteKey={siteKey} returnTo={returnTo} siteOrigin={origin} nonce={await cspNonce()} />
          <noscript><p>{SIGN_IN_STATES.noScript}</p></noscript>
        </>
      ) : (
        <Banner tone="info" role="note" title={SIGN_IN_STATES.notConfiguredTitle} body={SIGN_IN_STATES.notConfiguredBody} />
      )}
    </section>
  );
}
