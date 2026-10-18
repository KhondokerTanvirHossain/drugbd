import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ScopeAndSeverity } from "@/components/review/senior/PairFilters";
import PairList from "@/components/review/senior/PairList";
import SeniorDesk from "@/components/review/senior/SeniorDesk";
import SeniorShell, { NotSenior } from "@/components/review/senior/SeniorShell";
import s from "@/components/review/senior/pages.module.css";
import { recordHref } from "@/components/review/desk/hrefs";
import CodeChip from "@/components/ui/CodeChip";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { SourceOf } from "@/components/ui/SourceLink";
import { getPairQueue, getSeniorSubstance } from "@/lib/api";
import { DESK_NEW, NOT_RUN, P1C_COPY, fill } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { NAME_TYPE_LABEL } from "@/lib/relations";
import { DESK, SHARED_WORDS, plural } from "@/lib/review-copy";
import { isReviewer } from "@/lib/reviewers";
import { DEFAULT_PAIR_QUERY, parseSubstanceQuery, substanceHref } from "@/lib/senior-params";
import type { SubstanceBrand } from "@/lib/senior-types";
import { getSession } from "@/lib/session";
import { SEVERITIES } from "@/lib/severity";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";
import { qaAccountView } from "@/components/review/QaAccount";

export const dynamic = "force-dynamic";

const ra = DESK_NEW.routeAware;

/** §5.17.4 "Checked against": the chosen entries, or why there is none (never the hatch except for coverage none). */
function checked(b: SubstanceBrand) {
  if (b.chosen.length > 0)
    return b.chosen.map((c, i) => (
      <Fragment key={c.ddinterId}>{i > 0 && ", "}<span className="mono">{c.ddinterId}</span> ({c.routeScope}){c.routeAssumed && ra.routeAssumedSuffix}</Fragment>
    ));
  if (b.reason === "no_data") return <NoDataChip label="No data" />;
  if (b.reason === "not_run") return NOT_RUN;
  const route = b.clinicalDrug?.route ?? null;
  return route === null ? ra.noRouteEntryNoRoute : fill(ra.noRouteEntry, { route });
}

/** §5.17.4: one substance from every batch: brands, names, codes with sources, DDInter entries and its pairs. Seniors only. */
export default async function SubstancePage({ params, searchParams }: {
  params: Promise<{ bdsId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  // §5.12 (QA portal, D66): app/review/layout.tsx admits qa and cannot see the path, so each review page answers qa itself.
  if (session?.role === "qa") return qaAccountView(session);
  if (!session || !isReviewer(session)) return null;
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value), keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  if (session.role !== "senior")
    return <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={null}><NotSenior heading={SHARED_WORDS.substances} /></SeniorShell>;
  const { bdsId } = await params;
  if (bdsId.length > 64) notFound();
  const q = parseSubstanceQuery(await searchParams);
  const [d, toReview] = await Promise.all([getSeniorSubstance(bdsId, q, session.email),
    getPairQueue(DEFAULT_PAIR_QUERY, session.email, 1).then((p) => p.counts.todo)]);   // the toolbar's count (§5.17)
  if (!d) notFound();
  const r = P1C_COPY.review;
  const batches = new Set(d.brands.map((b) => b.batchId)).size;
  const desk = { kind: "substance" as const, target: { type: "substance" as const, id: d.bdsId }, singleKeys: keys === "on",
    siteKey: turnstileSiteKey(), nonce: await cspNonce() };
  return (
    <SeniorShell session={session} theme={theme} keys={keys} current="substances" toReview={toReview}>
      <h1>{d.name} <span className="mono">{d.bdsId}</span></h1>
      <p className={s.sub}>{fill(r.substanceMeta, { k: d.brands.length, brands: plural(d.brands.length, "brand", "brands"), b: batches,
        batches: plural(batches, "batch", "batches") })}</p>

      <section className={s.section} aria-labelledby="sub-brands">
        <h2 id="sub-brands">{r.brands}</h2>
        <div className="cmp-wrap" tabIndex={0} role="region" aria-labelledby="sub-brands">
          <table className="cmp">
            <caption className="sr-only">{fill(r.brandsCaption, { name: d.name })}</caption>
            <thead><tr>
              <th scope="col">{r.colBrand}</th><th scope="col">{DESK.batchPrefix}</th><th scope="col">{SHARED_WORDS.status}</th>
              <th scope="col">{SHARED_WORDS.clinicalDrug}</th><th scope="col">{SHARED_WORDS.strength}</th><th scope="col">{SHARED_WORDS.route}</th>
              <th scope="col">{r.colChecked}</th>
            </tr></thead>
            <tbody>{d.brands.map((b) => (
              <tr key={`${b.batchId}/${b.conceptId}`}>
                <th scope="row"><a href={recordHref(b.batchId, b.conceptId)}>{b.tradeName}</a></th>
                <td className="mono">{b.batchId}</td>
                <td><ReviewStatus status={b.displayStatus} /></td>
                <td>{b.clinicalDrug && <>{b.clinicalDrug.displayName} <span className="mono">{b.clinicalDrug.bdcId}</span></>}</td>
                <td>{b.strengthText}</td>
                <td>{b.clinicalDrug?.route ?? ""}</td>
                <td>{checked(b)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className={s.section} aria-labelledby="sub-names">
        <h2 id="sub-names">{SHARED_WORDS.names}</h2>
        <ul>{d.names.map((n, i) => <li key={i}>{n.name} ({NAME_TYPE_LABEL[n.type] ?? n.type}), {n.source}</li>)}</ul>
      </section>

      <section className={s.section} aria-labelledby="sub-codes">
        <h2 id="sub-codes">{SHARED_WORDS.codes}</h2>
        <div className="codes">{d.codes.map((c) => (
          <CodeChip key={`${c.system}${c.code}`} system={c.system} code={c.code} source={c.source}
            meta={{ method: c.method, confidence: c.confidence, route: c.system === "DDINTER" ? c.routeScope : undefined }} />
        ))}</div>
      </section>

      <section className={s.section} aria-labelledby="sub-entries">
        <h2 id="sub-entries">{SHARED_WORDS.ddinterEntries}</h2>
        {d.coverage === "none" ? <NoDataBlock title={d.name} bdsId={d.bdsId} />
          : d.coverage === "not_run" ? <p>{NOT_RUN}</p>
          : (
            <ul className={s.entries}>{d.entries.map((e) => (
              <li key={e.ddinterId}>
                <p><span className="mono">{e.ddinterId}</span> {e.name} ({e.routeScope}){e.source && <> <SourceOf source={e.source} /></>}</p>
                <div className={s.chips} role="group" aria-label={DESK.severityGroup}>
                  {SEVERITIES.map((sev) => <Severity key={sev} level={sev} count={e.counts[sev]} />)}
                </div>
                <p>{fill(DESK.totals, { total: e.counts.total, d: e.diseaseCount, dWord: plural(e.diseaseCount, "interaction", "interactions"),
                  f: e.foodCount, fWord: plural(e.foodCount, "interaction", "interactions") })}</p>
              </li>
            ))}</ul>
          )}
      </section>

      <section className={s.section} aria-labelledby="sub-pairs">
        <h2 id="sub-pairs">{r.pairsHeading}</h2>
        {d.coverage === "none" ? (
          // No pair list, but the page is shown: SeniorDesk with no pair logs senior_open (§5.15).
          <SeniorDesk role="senior" {...desk} pairs={[]}><p>{fill(r.notChecked, { name: d.name })}</p></SeniorDesk>
        ) : d.coverage === "not_run" && d.pairs.total === 0 ? (
          // DDInter was never fetched for it: NOT_RUN, never the no-pair sentence (absence of data is never shown as
          // safety, G3). A stored pair is still listed below if one exists. SeniorDesk logs senior_open (§5.15).
          <SeniorDesk role="senior" {...desk} pairs={[]}><p>{NOT_RUN}</p></SeniorDesk>
        ) : (
          <>
            {d.coverage === "not_run" && <p>{NOT_RUN}</p>}
            <ScopeAndSeverity pairs={q.pairs} severity={q.severity} scopeHref={(pairs) => substanceHref(d.bdsId, { ...q, pairs, page: 0 })}
              severityHref={(severity) => substanceHref(d.bdsId, { ...q, severity, page: 0 })} />
            <PairList items={d.pairs.items} total={d.pairs.total} page={q.page} heading="h3" emptyText={fill(r.pairsEmpty, { name: d.name })}
              emptyLink={null} pageHref={(page) => substanceHref(d.bdsId, { ...q, page })} desk={desk} />
          </>
        )}
      </section>
    </SeniorShell>
  );
}
