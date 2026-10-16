import TurnstileField from "@/components/TurnstileField";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { FLAG_OUTCOME, TURNSTILE_OFF } from "@/components/public/ReportProblem";
import { ORG_MAX, ORG_MIN, PARTNER_KINDS, PARTNER_VOLUMES, USE_MAX, USE_MIN } from "@/lib/actions-core";
import { NO_PHI_HELP, PUBLIC_NEW, fill } from "@/lib/copy";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { LANDING, NAV, PARTNERS } from "@/lib/public-copy";
import { getSession } from "@/lib/session";
import { turnstileSiteKey } from "@/lib/turnstile";
import styles from "./page.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "For partners · IntelliDrugs" };

const P = PUBLIC_NEW.partner;

/**
 * §6.9: Board P's partner band and Learn chapter 8's "Where the API stands", condensed; the request form for signed-in
 * visitors. The outcome and the disabled-verification notice are plain text with no role, as on the product page: §10.2
 * allows one polite, sr-only live region per page and no assertive ones, and this page has no island to own it. So the
 * form posts natively to /partners/request, whose 303 to ?partner=<code>#request is a full navigation with or without
 * JavaScript: the browser keeps the fragment and lands on the outcome (lib/form-post.ts).
 */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await getSession();
  const outcome = firstParam(sp.partner);
  const siteKey = turnstileSiteKey();
  // Own keys only: an unknown code (or "constructor", "toString") shows nothing, never the code itself.
  const known = Object.hasOwn(FLAG_OUTCOME, outcome) ? FLAG_OUTCOME[outcome] : undefined;
  const message = outcome === "sent" && session ? fill(P.sent, { email: session.email }) : known;
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>{PARTNERS.h1}</h1>
      <section aria-labelledby="partners-band">
        <h2 id="partners-band" className={styles.h2}>{LANDING.partnersHeading}</h2>
        <p className={styles.sub}>{LANDING.partnersSub}</p>
        <ul className={styles.ticks}>
          <li><span>{LANDING.partnerTicks[0]}</span></li>
          <li><span>{LANDING.partnerTicks[1]}<b>{LANDING.partnerTickBold}</b>.</span></li>
          <li><span>{LANDING.partnerTicks[2]}<span className="mono">{LANDING.partnerEnvelope}</span>.</span></li>
        </ul>
      </section>
      <section aria-labelledby="api-stands">
        <h2 id="api-stands" className={styles.h2}>{PARTNERS.apiHeading}</h2>
        <p className={styles.sub}>{PARTNERS.apiNow} <a href="/learn/partners">{PARTNERS.learnMore}</a></p>
      </section>
      <section id="request" aria-labelledby="request-h" className={styles.card}>
        <h2 id="request-h" className={styles.h2}>{PARTNERS.formHeading}</h2>
        {message && <p>{message}</p>}
        {!session ? (
          <p>{LANDING.requestNote} <a href={`/signin?${new URLSearchParams({ returnTo: "/partners" })}`}>{NAV.signIn}</a></p>
        ) : outcome === "sent" ? null : (
          <form method="post" action="/partners/request" className={styles.form}>
            <Field id="p-org" label={P.organisation} control={<input className="input" name="organisation" required minLength={ORG_MIN} maxLength={ORG_MAX} />} />
            <Field id="p-kind" label={P.kind} control={<select className="input" name="kind" required>{PARTNER_KINDS.map((k) => <option key={k}>{k}</option>)}</select>} />
            <Field id="p-use" label={P.use} help={`${P.useHelp} ${NO_PHI_HELP}`}
              control={<textarea className="textarea" name="use" required minLength={USE_MIN} maxLength={USE_MAX} rows={5} />} />
            <Field id="p-volume" label={P.volume} control={<select className="input" name="volume" required>{PARTNER_VOLUMES.map((v) => <option key={v}>{v}</option>)}</select>} />
            {siteKey ? <TurnstileField siteKey={siteKey} action="partner" nonce={await cspNonce()} size="auto" /> : <p>{TURNSTILE_OFF}</p>}
            <Button variant="primary" type="submit">{LANDING.requestAccess}</Button>
          </form>
        )}
      </section>
    </div>
  );
}
