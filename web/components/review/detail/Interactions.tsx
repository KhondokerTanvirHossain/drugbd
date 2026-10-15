import type { ReactNode } from "react";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import PairCard from "@/components/ui/PairCard";
import Severity from "@/components/ui/Severity";
import { DESK_NEW, NO_DATA_SENTENCE, NOT_RUN, fill } from "@/lib/copy";
import { strengthText } from "@/lib/relations";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import type { BatchPair, IngredientSummary, NotCheckedPair, ReviewItem } from "@/lib/review-types";
import { SEVERITIES, severityOf } from "@/lib/severity";
import s from "./detail.module.css";

const mono = (t: ReactNode) => <span className="mono">{t}</span>;
const ra = DESK_NEW.routeAware;

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
    body = <NoDataBlock title={g.name} extra={<>
      <p className="nodata-text">{DESK.noDataLine}</p>
      <div className="nodata-pairs"><span>{fill(DESK.notCheckedWithBatch, { k: nc.length })}</span>
        {nc.map((n) => <NoDataChip key={n.partnerSubstance} label={`${n.substance} + ${n.partnerSubstance}`} />)}</div>
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
    const ids = mono(g.ddinter.chosen.map((c) => `${c.ddinterId} (${c.routeScope})`).join(", "));
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

const recordsOf = (p: { partners: { tradeName: string; index: number }[] }) =>
  p.partners.map((x) => fill(DESK.record, { name: x.tradeName, k: x.index })).join(", ");

function Card({ p }: { p: BatchPair }) {
  const management = p.management !== null;
  const kind = management ? "management" : "interaction";
  const suffix = management ? "" : DESK.noManagementForPair;
  return (
    <PairCard id={`pair-${p.ddinterA}-${p.ddinterB}`} severity={p.severity} names={`${p.substance} + ${p.partnerSubstance}`} heading="h4"
      meta={<>{fill(DESK.pairWith, { partners: recordsOf(p) })}{p.actions.length > 0 && fill(DESK.actionIn, { actions: p.actions.join(", ") })}
        {mono(`${p.ddinterA}/${p.ddinterB}`)}</>}
      text={{ kind, body: (p.management ?? p.interaction)! }}
      source={`${management ? DESK.managementTruncated : DESK.interactionTruncated}${suffix}`}
      sourceOpen={`${management ? DESK.managementFull : DESK.interactionFull}${suffix}`} surface="reviewer" />
  );
}

function NoText({ pairs }: { pairs: BatchPair[] }) {
  const groups = SEVERITIES.map((sev) => [sev, pairs.filter((p) => severityOf(p.severity) === sev)] as const).filter(([, g]) => g.length > 0);
  const actions = [...new Set(pairs.flatMap((p) => p.actions))];
  const n = pairs.length;
  return (
    <div className={s.ntx}>
      <p className={s.subH}>{fill(DESK.noTextHeading, { k: n, pairs: plural(n, "pair", "pairs") })}</p>
      {groups.map(([sev, g]) => (
        <div className={s.ntxG} key={sev}>
          <Severity level={sev} count={g.length} />
          <ul className={s.ntxList}>{g.map((p) => (
            <li key={`${p.ddinterA}/${p.ddinterB}`}><b>{p.substance} + {p.partnerSubstance}</b>{" "}
              <span className={s.ntxWith}>{fill(DESK.noTextWith, { records: recordsOf(p) })}</span> {mono(`${p.ddinterA}/${p.ddinterB}`)}</li>
          ))}</ul>
        </div>
      ))}
      <p className={s.ingQ}>{fill(DESK.noTextClosing, { actions: actions.length ? fill(DESK.actionIn, { actions: actions.join(", ") }) : "",
        this: n === 1 ? "this pair" : "these pairs" })}{groups.some(([sev]) => sev === "unknown") && DESK.noTextUnknown}</p>
    </div>
  );
}

function otherLines(n: NotCheckedPair, brand: string): string[] {
  const brands = n.side === "this" ? [brand] : n.partners.map((p) => p.tradeName);
  const substance = n.side === "this" ? n.substance : n.partnerSubstance;
  return brands.map((b) => n.reason === "no_route"
    ? (n.route === null ? fill(ra.notCheckedNoRouteNoRoute, { brand: b, substance }) : fill(ra.notCheckedNoRoute, { brand: b, route: n.route, substance }))
    : n.reason === "unmapped" ? fill(ra.notCheckedUnmapped, { ingredient: substance, brand: b })
    : fill(DESK_NEW.notRun.notCheckedNotRun, { substance, brand: b }));
}

function BatchBlock({ item, brand }: { item: ReviewItem; brand: string }) {
  const { pairs, notChecked, totalBatchPairs } = item.batchPairs;
  const nc = notChecked.filter((n) => n.reason !== "same_product");
  const counts = { major: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const p of pairs) counts[severityOf(p.severity)]++;
  const withText = pairs.filter((p) => p.management !== null || p.interaction !== null);
  const noText = pairs.filter((p) => p.management === null && p.interaction === null);
  const noData = nc.filter((n) => n.reason === "no_data");
  const noDataNames = [...new Set(noData.map((n) => (n.side === "this" ? n.substance : n.partnerSubstance)))];
  const others = [...new Set(nc.filter((n) => n.reason !== "no_data").flatMap((n) => otherLines(n, brand)))];
  const same = notChecked.filter((n) => n.reason === "same_product");
  return (
    <div className={s.sec}>
      <p className={s.subH}>{DESK.batchTitle}</p>
      <p className={s.ingQ}>{fill(DESK.batchFound, { p: pairs.length, pairs: plural(pairs.length, "pair", "pairs") })}
        {nc.length > 0 && fill(DESK.batchNotChecked, { nc: nc.length, pairs: plural(nc.length, "pair", "pairs") })}</p>
      {chips(counts, DESK.batchChips)}
      {item.ingredients.filter((g) => g.ddinter.chosen.length > 0 && !pairs.some((p) => p.substance === g.name)).map((g) => (
        <p className={s.ingQ} key={g.name}>{fill(DESK.noneInvolve, { n: totalBatchPairs, name: g.name })}</p>
      ))}
      {withText.length > 0 && <div className={s.pairs}>{withText.map((p) => <Card key={`${p.ddinterA}/${p.ddinterB}`} p={p} />)}</div>}
      {noText.length > 0 && <NoText pairs={noText} />}
      {noData.length > 0 && (
        <div className={s.nc}>
          <p><b>{DESK.notCheckedLead}</b> {noDataNames.join(", ")}: {NO_DATA_SENTENCE}</p>
          <div className={s.chipRow}>{noData.map((n) => <NoDataChip key={`${n.substance}+${n.partnerSubstance}`} label={`${n.substance} + ${n.partnerSubstance}`} />)}</div>
        </div>
      )}
      {others.map((line) => <p className={s.ingQ} key={line}>{line}</p>)}
      {same.map((n) => <p className={s.ingQ} key={`${n.substance}+${n.partnerSubstance}`}>{fill(ra.notCheckedSameProduct, { a: n.substance, b: n.partnerSubstance })}</p>)}
    </div>
  );
}

/** §5.6 "Interactions": the chosen-entry statement, one block per ingredient, then the batch block (route-aware, D14). */
export default function Interactions({ item }: { item: ReviewItem }) {
  const route = item.clinicalDrug?.route ?? null;
  const brand = item.brand?.tradeName ?? item.conceptId;
  const hasData = item.ingredients.some((g) => g.ddinter.chosen.length > 0) && !item.ingredients.some((g) => g.coverage.coverage === "none");
  return (
    <section className={s.sec} aria-labelledby="sec-ix">
      <div className={s.secT}><h2 id="sec-ix">{DESK.interactionsTitle}</h2><span>{DESK.interactionsSub}</span></div>
      <Statements item={item} route={route} />
      {item.ingredients.map((g, i) => <Ingredient key={i} g={g} item={item} route={route} brand={brand} />)}
      {hasData && <BatchBlock item={item} brand={brand} />}
    </section>
  );
}
