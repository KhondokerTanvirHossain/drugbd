import { cookies } from "next/headers";
import SeniorShell, { NotSenior } from "@/components/review/senior/SeniorShell";
import s from "@/components/review/senior/pages.module.css";
import { getPairQueue, listSeniorSubstances } from "@/lib/api";
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import { isReviewer } from "@/lib/reviewers";
import { DEFAULT_PAIR_QUERY, parseSubstancesQuery, substanceHref, substancesHref } from "@/lib/senior-params";
import { SENIOR_PAGE_SIZE } from "@/lib/senior-types";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { qaAccountView } from "@/components/review/QaAccount";

export const dynamic = "force-dynamic";

/** §5.17.3: every substance carried by a medicine we hold, from all batches, by pairs to review. Seniors only. */
export default async function SubstancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  // §5.12 (QA portal, D66): app/review/layout.tsx admits qa and cannot see the path, so each review page answers qa itself.
  if (session?.role === "qa") return qaAccountView(session);
  if (!session || !isReviewer(session)) return null;
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value), keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  if (session.role !== "senior")
    return <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={null}><NotSenior heading={SHARED_WORDS.substances} /></SeniorShell>;
  const { q, page } = parseSubstancesQuery(await searchParams);
  const [data, toReview] = await Promise.all([listSeniorSubstances(q, page),
    getPairQueue(DEFAULT_PAIR_QUERY, session.email, 1).then((d) => d.counts.todo)]);   // the toolbar's count (§5.17)
  const r = P1C_COPY.review, t = DESK_NEW.reviewLists;
  const next = (page + 1) * SENIOR_PAGE_SIZE < data.total ? page + 1 : null;
  return (
    <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={toReview}>
      <h1>{SHARED_WORDS.substances}</h1>
      <p className={s.sub}>{r.substancesSub}</p>
      <form method="get" action="/review/substances" role="search">
        <label className="sr-only" htmlFor="sub-q">{r.filterLabel}</label>
        <input className="input" id="sub-q" name="q" defaultValue={q} placeholder={r.filterPlaceholder} maxLength={100} />
      </form>
      {data.total === 0 && q ? (
        <div className={s.empty}><p>{fill(r.noMatch, { q })}</p><a href="/review/substances">{r.showAllSubstances}</a></div>
      ) : (
        <div className="cmp-wrap" tabIndex={0} role="region" aria-label={r.substancesCaption}>
          <table className="cmp">
            <caption className="sr-only">{r.substancesCaption}</caption>
            <thead><tr>
              <th scope="col">{SHARED_WORDS.substance}</th><th scope="col">{SHARED_WORDS.bdsId}</th><th scope="col">{r.brands}</th>
              <th scope="col">{DESK.batchesHeading}</th><th scope="col">{r.colPairsToReview}</th><th scope="col">{r.colMajorToReview}</th>
            </tr></thead>
            <tbody>{data.items.map((row) => (
              <tr key={row.bdsId}>
                <th scope="row"><a href={substanceHref(row.bdsId)}>{row.name}</a></th><td className="mono">{row.bdsId}</td>
                <td className="num">{row.brands}</td><td className="num">{row.batches}</td><td className="num">{row.pairsToReview}</td>
                <td className="num">{row.majorPairsToReview}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(page > 0 || next !== null) && (
        <p className={s.paging}>
          {page > 0 && <a href={substancesHref(q, page - 1)}>{t.previousPage}</a>}
          {next !== null && <a href={substancesHref(q, next)}>{t.nextPage}</a>}
        </p>
      )}
    </SeniorShell>
  );
}
