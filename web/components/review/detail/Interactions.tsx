import { Fragment, type ReactNode } from "react";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import PairCard, { type PairHeading } from "@/components/ui/PairCard";
import PairReviewState from "@/components/ui/PairReviewState";
import Severity from "@/components/ui/Severity";
import { SourceOf } from "@/components/ui/SourceLink";
import { DESK_NEW, FROM_DDINTER, NO_DATA_SENTENCE, NOT_RUN, P1C_COPY, fill } from "@/lib/copy";
import { strengthText } from "@/lib/relations";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import type {
  BatchPair, IngredientSummary, NotCheckedPair, OtherNotChecked, OtherPair, OtherPartner, ReviewItem, ReviewerRole,
} from "@/lib/review-types";
import { SEVERITIES, severityOf } from "@/lib/severity";
import { recordHref } from "../desk/hrefs";
import s from "./detail.module.css";

const mono = (t: ReactNode) => <span className="mono">{t}</span>;
const ra = DESK_NEW.routeAware;
const o = P1C_COPY.other;
const pairWord = (n: number) => plural(n, "pair", "pairs");
type AnyPair = BatchPair | OtherPair;

/** "Chloramphenicol (ophthalmic)" names the route already; the statement adds it once (§5.6.4). */
const baseName = (name: string | null, id: string, route: string) =>
  (name ?? id).replace(new RegExp(` \\(${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), "");

function Statements({ item, route }: { item: ReviewItem; route: string | null }) {
  const lines: ReactNode[] = [];
  for (const g of item.ingredients)
    for (const c of g.ddinter.chosen) {
      if (c.routeAssumed) {
        lines.push(route === null
          ? fillNodes(DESK_NEW.routeAssumed.noRouteStatement, { id: mono(c.ddinterId) })
          : fillNodes(ra.assumedStatement, { route, substance: g.name, id: mono(c.ddinterId) }));
      } else if (route !== "systemic") {
        lines.push(fillNodes(ra.checkedAgainst, { substance: g.name, id: mono(c.ddinterId),
          ddinterName: baseName(c.name, c.ddinterId, c.routeScope), route: c.routeScope }));
      }
    }
  return <>{lines.map((l, i) => <p className={s.ingP} key={i}>{l}</p>)}</>;
}

function chips(counts: Record<"major" | "moderate" | "minor" | "unknown", number>, label: string) {
  return (
    <div className={s.chipRow} role="group" aria-label={label}>
      {SEVERITIES.map((sev) => <Severity key={sev} level={sev} count={counts[sev]} />)}
    </div>
  );
}

function Ingredient({ g, item, route, brand }: { g: IngredientSummary; item: ReviewItem; route: string | null; brand: string }) {
  const head = <div className={s.ingH}><h3>{g.name}</h3>{g.bdsId && <span className="mono">{g.bdsId}</span>}<span>{strengthText(g)}</span></div>;
  let body: ReactNode;
  if (g.bdsId === null) {
    body = <p className={s.ingP}>{fill(ra.notCheckedUnmapped, { ingredient: g.name, brand })}</p>;
  } else if (g.coverage.coverage === "none") {
    const nc = item.batchPairs.notChecked.filter((n) => n.reason === "no_data" && n.side === "this" && n.substance === g.name);
    // §5.6.1 (P1C): the pairs with other batches follow on their own line; a pair split by partner status is listed once.
    const other = [...new Set(item.otherPairs.notChecked
      .filter((n) => n.reason === "no_data" && n.side === "this" && n.substance === g.name).map((n) => n.partnerSubstance))];
    body = <NoDataBlock title={g.name} extra={<>
      <p className="nodata-text">{DESK.noDataLine}</p>
      <div className="nodata-pairs"><span>{fill(DESK.notCheckedWithBatch, { k: nc.length })}</span>
        {nc.map((n) => <NoDataChip key={n.partnerSubstance} label={`${n.substance} + ${n.partnerSubstance}`} />)}</div>
      {other.length > 0 && (
        <div className="nodata-pairs"><span>{fill(o.noDataOther, { j: other.length, pairs: pairWord(other.length) })}</span>
          {other.map((p) => <NoDataChip key={p} label={`${g.name} + ${p}`} />)}</div>
      )}
    </>} />;
  } else if (g.coverage.coverage === "not_run") {
    body = <p className={s.ingP}>{NOT_RUN}</p>;
  } else if (g.ddinter.chosen.length === 0) {
    body = <p className={s.ingP}>{route === null ? ra.noRouteEntryNoRoute : fill(ra.noRouteEntry, { route })}</p>;
  } else {
    const chosen = g.ddinter.entries.filter((e) => g.ddinter.chosen.some((c) => c.ddinterId === e.ddinterId));
    const sum = (f: (e: (typeof chosen)[number]) => number) => chosen.reduce((t, e) => t + f(e), 0);
    const counts = { major: sum((e) => e.counts.major), moderate: sum((e) => e.counts.moderate), minor: sum((e) => e.counts.minor),
      unknown: sum((e) => e.counts.unknown) };
    const d = sum((e) => e.diseaseCount), f = sum((e) => e.foodCount);
    const assumed = g.ddinter.chosen.some((c) => c.routeAssumed);
    // §5.6.6: each chosen entry id carries its DDInter link.
    const linkOf = (id: string) => g.ddinter.entries.find((e) => e.ddinterId === id)?.source ?? null;
    const ids = g.ddinter.chosen.map((c, i) => (
      <Fragment key={c.ddinterId}>{i > 0 && ", "}{mono(`${c.ddinterId} (${c.routeScope})`)}{linkOf(c.ddinterId) && <> <SourceOf source={linkOf(c.ddinterId)} /></>}</Fragment>
    ));
    body = <>
      <p className={s.ingP}>{route === null ? fillNodes(ra.dataFoundNoRoute, { ids })
        : <>{fillNodes(ra.dataFound, { route, ids })}{assumed && ra.routeAssumedSuffix}</>}</p>
      {chips(counts, DESK.severityGroup)}
      <p className={s.ingQ}>{fill(DESK.totals, { total: sum((e) => e.counts.total), d, dWord: plural(d, "interaction", "interactions"),
        f, fWord: plural(f, "interaction", "interactions") })}</p>
      {g.ddinter.entries.length > g.ddinter.chosen.length && (
        <p className={s.ingQ}>{fillNodes(ra.allEntries, { name: g.name,
          ids: g.ddinter.entries.map((e, i) => <span key={e.ddinterId}>{i > 0 && ", "}{mono(e.ddinterId)} ({e.routeScope})</span>),
          total: g.ddinter.entries.reduce((t, e) => t + e.counts.total, 0) })}</p>
      )}
    </>;
  }
  return <div className={s.ing}>{head}{body}</div>;
}

// ---- partners: "{name} (record {k})" in this batch; "{name} (batch b)", three then "and {k} more", in other batches

const recordsOf = (p: { partners: { tradeName: string; index: number }[] }): ReactNode =>
  p.partners.map((x) => fill(DESK.record, { name: x.tradeName, k: x.index })).join(", ");
const ref = (x: OtherPartner) => fillNodes(o.partnerRef, { name: x.tradeName, batchId: mono(x.batchId) });
const refText = (x: OtherPartner) => fill(o.partnerRef, { name: x.tradeName, batchId: x.batchId });

function inlinePartners(partners: OtherPartner[], count: number): ReactNode {
  const shown = partners.slice(0, 3);
  return (
    <>
      {shown.map((x, i) => <Fragment key={`${x.batchId}/${x.conceptId}`}>{i > 0 && ", "}{ref(x)}</Fragment>)}
      {count > shown.length && <> {fill(o.andMoreInline, { k: count - shown.length })}</>}
    </>
  );
}

/** §5.6.2: the partners the API returned (at most 5), with "and {k} more." and, for a senior, the substance page. */
function PartnerList({ partners, count, substance, bdsId, senior }:
    { partners: OtherPartner[]; count: number; substance: string; bdsId: string | null; senior: boolean }) {
  return (
    <details className={s.partners}>
      <summary>{count <= 5 ? fill(o.detailsAll, { n: count }) : fill(o.detailsSome, { s: partners.length, n: count })}</summary>
      <ul>
        {partners.map((x) => <li key={`${x.batchId}/${x.conceptId}`}><a href={recordHref(x.batchId, x.conceptId)}>{ref(x)}</a></li>)}
        {count > partners.length && (
          <li>{fill(o.andMoreList, { k: count - partners.length })}
            {senior && bdsId && <> <a href={`/review/substances/${encodeURIComponent(bdsId)}`}>{fill(o.seeEveryBrand, { substance })}</a></>}</li>
        )}
      </ul>
    </details>
  );
}

// ---- the parts every group shares

function Card({ p, id, heading, partners, details }: { p: AnyPair; id: string; heading: PairHeading; partners: ReactNode; details?: ReactNode }) {
  const management = p.management !== null;
  const kind = management ? "management" : "interaction";
  const suffix = management ? "" : DESK.noManagementForPair;
  return (
    <PairCard id={id} severity={p.severity} names={`${p.substance} + ${p.partnerSubstance}`} heading={heading}
      meta={<>{FROM_DDINTER}. {fillNodes(DESK.pairWith, { partners })}{p.actions.length > 0 && fill(DESK.actionIn, { actions: p.actions.join(", ") })}
        {mono(`${p.ddinterA}/${p.ddinterB}`)}</>}
      details={details}
      text={{ kind, body: (p.management ?? p.interaction)! }}
      source={`${management ? DESK.managementTruncated : DESK.interactionTruncated}${suffix}`}
      sourceOpen={`${management ? DESK.managementFull : DESK.interactionFull}${suffix}`}
      link={p.source ? <SourceOf source={p.source} /> : undefined}
      review={p.pairReview ? <PairReviewState {...p.pairReview} surface="reviewer" /> : undefined} surface="reviewer" />
  );
}

function NoText<P extends AnyPair>({ pairs, withOf, detailsOf }: { pairs: P[]; withOf: (p: P) => ReactNode; detailsOf?: (p: P) => ReactNode }) {
  const groups = SEVERITIES.map((sev) => [sev, pairs.filter((p) => severityOf(p.severity) === sev)] as const).filter(([, g]) => g.length > 0);
  const actions = [...new Set(pairs.flatMap((p) => p.actions))];
  const n = pairs.length;
  return (
    <div className={s.ntx}>
      <p className={s.subH}>{fill(DESK.noTextHeading, { k: n, pairs: pairWord(n) })}</p>
      {groups.map(([sev, g]) => (
        <div className={s.ntxG} key={sev}>
          <Severity level={sev} count={g.length} />
          <ul className={s.ntxList}>{g.map((p) => (
            <li key={`${p.ddinterA}/${p.ddinterB}`}><b>{p.substance} + {p.partnerSubstance}</b>{" "}
              <span className={s.ntxWith}>{fillNodes(DESK.noTextWith, { records: withOf(p) })}</span> {mono(`${p.ddinterA}/${p.ddinterB}`)}
              {p.source && <> <SourceOf source={p.source} /></>}
              {detailsOf?.(p)}
              {p.pairReview && <PairReviewState {...p.pairReview} surface="reviewer" />}</li>
          ))}</ul>
        </div>
      ))}
      <p className={s.ingQ}>{fill(DESK.noTextClosing, { actions: actions.length ? fill(DESK.actionIn, { actions: actions.join(", ") }) : "",
        this: n === 1 ? "this pair" : "these pairs" })}{groups.some(([sev]) => sev === "unknown") && DESK.noTextUnknown}</p>
    </div>
  );
}

type Line = { substance: string; partnerSubstance: string; reason: string; side: "this" | "partner"; route: string | null };
function reasonLine(n: Line, brand: string, substance: string): string {
  return n.reason === "no_route"
    ? (n.route === null ? fill(ra.notCheckedNoRouteNoRoute, { brand, substance }) : fill(ra.notCheckedNoRoute, { brand, route: n.route, substance }))
    : n.reason === "unmapped" ? fill(ra.notCheckedUnmapped, { ingredient: substance, brand })
    : fill(DESK_NEW.notRun.notCheckedNotRun, { substance, brand });
}
function otherLines(n: NotCheckedPair, brand: string): string[] {
  const brands = n.side === "this" ? [brand] : n.partners.map((p) => p.tradeName);
  return brands.map((b) => reasonLine(n, b, n.side === "this" ? n.substance : n.partnerSubstance));
}
function crossLines(n: OtherNotChecked, brand: string): string[] {
  if (n.side === "this") return [reasonLine(n, brand, n.substance)];
  const lines = n.partners.map((x) => reasonLine(n, refText(x), n.partnerSubstance));
  return n.partnerCount > n.partners.length ? [...lines, fill(o.andMoreList, { k: n.partnerCount - n.partners.length })] : lines;
}

function NoDataLines({ list }: { list: Line[] }) {
  const names = [...new Set(list.map((n) => (n.side === "this" ? n.substance : n.partnerSubstance)))];
  const labels = [...new Set(list.map((n) => `${n.substance} + ${n.partnerSubstance}`))];
  return (
    <div className={s.nc}>
      <p><b>{DESK.notCheckedLead}</b> {names.join(", ")}: {NO_DATA_SENTENCE}</p>
      <div className={s.chipRow}>{labels.map((l) => <NoDataChip key={l} label={l} />)}</div>
    </div>
  );
}

const severityCounts = (pairs: AnyPair[]) => {
  const counts = { major: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const p of pairs) counts[severityOf(p.severity)]++;
  return counts;
};
const hasText = (p: AnyPair) => p.management !== null || p.interaction !== null;

// ---- "In batch {batchId}" (§5.6.2, as before P1C)

function BatchBlock({ item, brand }: { item: ReviewItem; brand: string }) {
  const { pairs, notChecked, totalBatchPairs } = item.batchPairs;
  const nc = notChecked.filter((n) => n.reason !== "same_product");
  const noData = nc.filter((n) => n.reason === "no_data");
  const others = [...new Set(nc.filter((n) => n.reason !== "no_data").flatMap((n) => otherLines(n, brand)))];
  const same = notChecked.filter((n) => n.reason === "same_product");
  return (
    <div className={s.sec}>
      <h4 className={s.subH}>{fill(o.inBatch, { batchId: item.batchId })}</h4>
      <p className={s.ingQ}>{fill(DESK.batchFound, { p: pairs.length, pairs: pairWord(pairs.length) })}
        {nc.length > 0 && fill(DESK.batchNotChecked, { nc: nc.length, pairs: pairWord(nc.length) })}</p>
      {chips(severityCounts(pairs), DESK.batchChips)}
      {item.ingredients.filter((g) => g.ddinter.chosen.length > 0 && !pairs.some((p) => p.substance === g.name)).map((g) => (
        <p className={s.ingQ} key={g.name}>{fill(DESK.noneInvolve, { n: totalBatchPairs, name: g.name })}</p>
      ))}
      {pairs.some(hasText) && <div className={s.pairs}>{pairs.filter(hasText).map((p) => (
        <Card key={`${p.ddinterA}/${p.ddinterB}`} p={p} id={`pair-${p.ddinterA}-${p.ddinterB}`} heading="h5" partners={recordsOf(p)} />
      ))}</div>}
      {pairs.some((p) => !hasText(p)) && <NoText pairs={pairs.filter((p) => !hasText(p))} withOf={recordsOf} />}
      {noData.length > 0 && <NoDataLines list={noData} />}
      {others.map((line) => <p className={s.ingQ} key={line}>{line}</p>)}
      {same.map((n) => <p className={s.ingQ} key={`${n.substance}+${n.partnerSubstance}`}>{fill(ra.notCheckedSameProduct, { a: n.substance, b: n.partnerSubstance })}</p>)}
    </div>
  );
}

// ---- "In other batches" (§5.6.2 P1C): the latest current item of every product held in another batch

function OtherGroup({ item, brand, approved, senior }: { item: ReviewItem; brand: string; approved: boolean; senior: boolean }) {
  // computeFor groups every entry by partner status, so its partners share one status (§7.3).
  const of = (x: { partners: OtherPartner[] }) => (x.partners[0]?.approved ?? false) === approved;
  const pairs = item.otherPairs.pairs.filter(of);
  const nc = item.otherPairs.notChecked.filter(of);
  if (pairs.length === 0 && nc.length === 0) return null;
  const tag = approved ? "a" : "n";
  const details = (p: OtherPair) => <PartnerList partners={p.partners} count={p.partnerCount} substance={p.partnerSubstance}
    bdsId={p.partnerBdsId} senior={senior} />;
  const noData = nc.filter((n) => n.reason === "no_data");
  const others = [...new Set(nc.filter((n) => n.reason !== "no_data").flatMap((n) => crossLines(n, brand)))];
  return (
    <div className={s.sec}>
      <h5 className={s.subH}>{approved ? o.withApproved : o.withNotApproved}</h5>
      <p className={s.ingQ}>{fill(DESK.batchFound, { p: pairs.length, pairs: pairWord(pairs.length) })}
        {nc.length > 0 && fill(DESK.batchNotChecked, { nc: nc.length, pairs: pairWord(nc.length) })}</p>
      {chips(severityCounts(pairs), o.chips)}
      {pairs.some(hasText) && <div className={s.pairs}>{pairs.filter(hasText).map((p) => (
        <Card key={`${p.ddinterA}/${p.ddinterB}`} p={p} id={`other-${tag}-${p.ddinterA}-${p.ddinterB}`} heading="h6"
          partners={inlinePartners(p.partners, p.partnerCount)} details={details(p)} />
      ))}</div>}
      {pairs.some((p) => !hasText(p)) && (
        <NoText pairs={pairs.filter((p) => !hasText(p))} withOf={(p) => inlinePartners(p.partners, p.partnerCount)} detailsOf={details} />
      )}
      {noData.length > 0 && <NoDataLines list={noData} />}
      {others.map((line) => <p className={s.ingQ} key={line}>{line}</p>)}
    </div>
  );
}

function OtherBlock({ item, brand, senior }: { item: ReviewItem; brand: string; senior: boolean }) {
  const op = item.otherPairs;
  const none = op.pairs.length === 0 && op.notChecked.length === 0;
  return (
    <div className={s.sec}>
      <h4 className={s.subH}>{o.inOther}</h4>
      {/* otherBatches counts only batches that hold a partner (Review Focus 2): 0 never claims "no interaction". */}
      {op.otherBatches === 0 ? <p className={s.ingQ}>{o.noOtherBatches}</p>
        : none ? <p className={s.ingQ}>{fill(o.noneOther, { name: brand })}</p>
        : <>
            <OtherGroup item={item} brand={brand} approved senior={senior} />
            <OtherGroup item={item} brand={brand} approved={false} senior={senior} />
          </>}
    </div>
  );
}

/**
 * §5.6 "Interactions": the chosen-entry statement, one block per ingredient, then "With other medicines" (route-aware,
 * D14). *(P1C)* The section shows when at least one ingredient has a chosen entry: a combination product with one no-data
 * ingredient keeps its other ingredient's pairs (§5.6.2, the Interactions.tsx fix).
 */
export default function Interactions({ item, role }: { item: ReviewItem; role?: ReviewerRole }) {
  const route = item.clinicalDrug?.route ?? null;
  const brand = item.brand?.tradeName ?? item.conceptId;
  const hasData = item.ingredients.some((g) => g.ddinter.chosen.length > 0);
  return (
    <section className={s.sec} aria-labelledby="sec-ix">
      <div className={s.secT}><h2 id="sec-ix">{DESK.interactionsTitle}</h2><span>{DESK.interactionsSub}</span></div>
      <Statements item={item} route={route} />
      {item.ingredients.map((g, i) => <Ingredient key={i} g={g} item={item} route={route} brand={brand} />)}
      {hasData && (
        <div className={s.sec}>
          <h3 className={s.withH}>{o.title}</h3>
          <BatchBlock item={item} brand={brand} />
          <OtherBlock item={item} brand={brand} senior={role === "senior"} />
        </div>
      )}
    </section>
  );
}
