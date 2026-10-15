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
import { pairsHref, parsePairQuery } from "@/lib/senior-params";
import type { PairShow } from "@/lib/senior-types";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const r = P1C_COPY.review;
const EMPTY: Record<PairShow, string> = { todo: r.emptyTodo, changed: r.emptyChanged, issue: r.emptyIssue, reviewed: r.emptyReviewed, all: r.emptyAll };

/** §5.17.1: every DDInter pair between substances we hold, from all batches, Major first. Seniors only. */
export default async function PairQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered these
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value), keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  if (session.role !== "senior")
    return <SeniorShell session={session} theme={theme} keys={keys} current="queue" toReview={null}><NotSenior heading={P1C_COPY.senior.pairQueue} /></SeniorShell>;
  const q = parsePairQuery(await searchParams);
  const data = await getPairQueue(q, session.email);
  return (
    <SeniorShell session={session} theme={theme} keys={keys} current="queue" toReview={data.counts.todo}>
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
