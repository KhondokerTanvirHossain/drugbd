import { cookies } from "next/headers";
import { ScopeAndSeverity, ShowLinks } from "@/components/review/senior/PairFilters";
import PairList from "@/components/review/senior/PairList";
import SeniorShell, { NotSenior } from "@/components/review/senior/SeniorShell";
import s from "@/components/review/senior/pages.module.css";
import { getPairQueue } from "@/lib/api";
import { P1C_COPY } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { isReviewer } from "@/lib/reviewers";
import { DEFAULT_PAIR_QUERY, pairsHref, parsePairQuery } from "@/lib/senior-params";
import type { PairShow } from "@/lib/senior-types";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";
import { qaAccountView } from "@/components/review/QaAccount";

export const dynamic = "force-dynamic";

const r = P1C_COPY.review;
const EMPTY: Record<PairShow, string> = { todo: r.emptyTodo, changed: r.emptyChanged, issue: r.emptyIssue, reviewed: r.emptyReviewed, all: r.emptyAll };

/** §5.17.1: every DDInter pair between substances we hold, from all batches, Major first. Seniors only. */
export default async function PairQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  // §5.12 (QA portal, D66): app/review/layout.tsx admits qa and cannot see the path, so each review page answers qa itself.
  if (session?.role === "qa") return qaAccountView(session);
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered the rest
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value), keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  if (session.role !== "senior")
    return <SeniorShell session={session} theme={theme} keys={keys} current="queue" toReview={null}><NotSenior heading={P1C_COPY.senior.pairQueue} /></SeniorShell>;
  const q = parsePairQuery(await searchParams);
  // The toolbar counts the default queue. The counts follow only the scope, so over all pairs this page's own are the same.
  const [data, defaultTodo] = await Promise.all([getPairQueue(q, session.email),
    q.pairs === DEFAULT_PAIR_QUERY.pairs ? null : getPairQueue(DEFAULT_PAIR_QUERY, session.email, 1).then((d) => d.counts.todo)]);
  return (
    <SeniorShell session={session} theme={theme} keys={keys} current="queue" toReview={defaultTodo ?? data.counts.todo}>
      <h1>{P1C_COPY.senior.pairQueue}</h1>
      <p className={s.sub}>{r.queueSub}</p>
      <ShowLinks show={q.show} counts={data.counts} href={(show) => pairsHref({ ...q, show, page: 0 })} />
      <ScopeAndSeverity pairs={q.pairs} severity={q.severity} scopeHref={(pairs) => pairsHref({ ...q, pairs, page: 0 })}
        severityHref={(severity) => pairsHref({ ...q, severity, page: 0 })} />
      <PairList items={data.items} total={data.total} page={q.page} heading="h2" emptyText={EMPTY[q.show]}
        emptyLink={pairsHref({ show: "all" })} pageHref={(page) => pairsHref({ ...q, page })}
        desk={{ kind: "queue", target: { type: "pair_queue", id: q.show }, singleKeys: keys === "on", siteKey: turnstileSiteKey(),
          nonce: await cspNonce() }} />
    </SeniorShell>
  );
}
