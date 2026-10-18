import { cookies } from "next/headers";
import TurnstileField from "@/components/TurnstileField";
import FlagSection, { flagsHref, type FlagPaging } from "@/components/review/FlagSection";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import { newestInReview } from "@/components/review/ReviewAccount";
import Announce from "@/components/review/desk/Announce";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { getPairQueue, listFlagPage, listReviewBatches } from "@/lib/api";
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { resolveFlagAction } from "@/lib/review-actions";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";
import styles from "../review.module.css";
import { qaAccountView } from "@/components/review/QaAccount";

export const dynamic = "force-dynamic";

/** Fixed messages for the resolve outcome codes (the existing map; `resolved` names the kind, §5.16). Anything else shows nothing. */
const RESOLVE_OUTCOME: Record<string, string> = {
  forbidden: "Only pharmacists and engineers can resolve flags.",
  captcha: "The verification check failed. Please try again.",
  invalid: "That flag is no longer open.",
  failed: "The flag could not be resolved. Please try again.",
};

const pageNo = (v: string) => (/^\d{1,5}$/.test(v) && Number(v) <= 10000 ? Number(v) : 0);

/** §5.16: problem reports and partner access requests, 50 per section, Resolve through one form and one bot check. */
export default async function FlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  // §5.12 (QA portal, D66): app/review/layout.tsx admits qa and cannot see the path, so each review page answers qa itself.
  if (session?.role === "qa") return qaAccountView(session);
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered the rest
  const sp = await searchParams;
  const paging: FlagPaging = { rp: pageNo(firstParam(sp.rp)), pp: pageNo(firstParam(sp.pp)) };
  const t = DESK_NEW.reviewLists;
  const code = firstParam(sp.resolve);
  const outcome = code === "resolved" ? (firstParam(sp.kind) === "partner" ? t.requestResolved : t.reportResolved) : RESOLVE_OUTCOME[code];
  const [reports, partner, batches, pairIssues] = await Promise.all([
    listFlagPage("reports", paging.rp).catch(() => null), listFlagPage("partner", paging.pp).catch(() => null),
    listReviewBatches().catch(() => []),
    // §5.16 (P1C): seniors see how many pair issues are open; engineers have no list of them (§5.17).
    session.role === "senior"
      ? getPairQueue({ show: "issue", pairs: "all", severity: null, page: 0 }, session.email, 1).then((p) => p.counts.issue).catch(() => 0)
      : Promise.resolve(0),
  ]);
  const store = await cookies();
  const siteKey = turnstileSiteKey();
  const any = (reports?.items.length ?? 0) + (partner?.items.length ?? 0) > 0;
  const failed = reports === null || partner === null;
  return (
    <div className={styles.shell}>
      <ReviewToolbar session={session} theme={parseTheme(store.get(THEME_COOKIE)?.value)} batchId={newestInReview(batches)}
        keys={parseKeys(store.get(KEYS_COOKIE)?.value)} />
      <main id="content" className={styles.page}>
        <h1>{t.flagsLink}</h1>
        {pairIssues > 0 && <p><a href="/review/pairs?show=issue">{fill(P1C_COPY.review.flagsLine, { k: pairIssues })}</a></p>}
        {failed ? (
          <>
            {/* §10.2: one polite region per page, no assertive one. On a failed load the page's one Announce carries the
                banner title (sr-only: the banner shows it); a resolve outcome stays visible as plain text, not a second region. */}
            {outcome && <p className="outcome">{outcome}</p>}
            <Announce text={t.loadErrorTitle} className="sr-only" />
            <Banner tone="crit" title={t.loadErrorTitle} body={t.loadErrorBody}
              action={<a className={buttonClass("tonal", "sm")} href={flagsHref(paging)}>{t.tryAgain}</a>} />
          </>
        ) : (
          <>
            {outcome && <Announce text={outcome} className="outcome" />}
            <FlagSection kind="reports" page={reports} paging={paging} />
            <FlagSection kind="partner" page={partner} paging={paging} />
            {any && (
              <form id="resolve-form" action={resolveFlagAction}>
                <input type="hidden" name="kind" id="resolve-kind" value="reports" />
                {siteKey && <TurnstileField siteKey={siteKey} action="resolve" nonce={await cspNonce()} />}
                <noscript><p>{t.noScriptResolve}</p></noscript>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
