import type { ReactNode } from "react";
import PublicPairCard, { pairText } from "@/components/public/PublicPairCard";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { countChips, medicinesOnly, noDataBlocks, summarySentence } from "@/lib/check-summary";
import { DECISION_SUPPORT, DESK_NEW, NOT_REVIEWED, NO_DATA_SENTENCE, PUBLIC_BOARD, PUBLIC_NEW, fill } from "@/lib/copy";
import { entryBaseName } from "@/lib/ddinter-text";
import type { CheckAlert, CheckResult, Side } from "@/lib/public-types";
import { CHECK, PRODUCT, plural } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import { groupBySeverity, severityLabel } from "@/lib/severity";
import styles from "./check.module.css";

const N = PUBLIC_NEW.checker;
const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;
const pairsWord = (k: number) => plural(k, CHECK.pairOne, CHECK.pairMany);

/** The `<h2>` that opens the main column (§6.7), also read by the combobox for its announcements, and the count chips. */
export function CheckSummary({ result, m, failed }: { result: CheckResult | null; m: number; failed: boolean }) {
  const chips = result ? countChips(result) : null;
  return (
    <>
      <h2 className="s-sum" data-check-summary="">{failed && m >= 2 ? medicinesOnly(m) : summarySentence(result, m)}</h2>
      {chips && (chips.severities.length > 0 || chips.noData > 0 || chips.other > 0) && (
        <div className={styles["s-sevrow"]}>
          {chips.severities.map(([k, n]) => <Severity key={k} level={k} count={n} />)}
          {chips.noData > 0 && <NoDataChip label={`${CHECK.notCheckedChip} ${chips.noData}`} />}
          {chips.other > 0 && <span className={styles.other}>{N.otherNotChecked} {chips.other}</span>}
        </div>
      )}
    </>
  );
}

function routeLine(result: CheckResult, side: Side): ReactNode {
  const p = result.products.find((x) => x.conceptId === side.conceptId);
  const c = p?.substances.find((x) => x.bdsId === side.bdsId)?.ddinter[0];
  if (!p || !c || !c.routeAssumed) return null;
  return <p className="pair-source">{p.route
    ? fillNodes(N.routeAssumedPair, { brand: p.tradeName, route: p.route, substance: side.name, id: <Mono id={c.ddinterId} /> })
    : fillNodes(N.routeAssumedPairNoRoute, { brand: p.tradeName, id: <Mono id={c.ddinterId} /> })}</p>;
}

function AlertCard({ a, i, result }: { a: CheckAlert; i: number; result: CheckResult }) {
  const known = a.severity === "major" || a.severity === "moderate" || a.severity === "minor";
  return (
    <PublicPairCard id={`chk-${i}`} severity={a.severity} heading="h4" names={`${a.a.tradeName} + ${a.b.tradeName}`} reviewFirst
      meta={known ? fill(CHECK.metaAction, { a: a.a.name, b: a.b.name, actions: a.actions.join(", ") }) : `${a.a.name} + ${a.b.name}`}
      review={a.pairReview} text={pairText(a)} extra={<>{routeLine(result, a.a)}{routeLine(result, a.b)}</>}
      source={fillNodes(PRODUCT.sourceLine, { a: <Mono id={a.ddinterA} />, b: <Mono id={a.ddinterB} /> })} />
  );
}

/** §6.7.3 item 4: the plain line for a pair not checked for a reason other than no data (no hatch, §3.4). */
function otherLine(result: CheckResult, n: CheckResult["notChecked"][number]): string {
  if (n.reason === "same_product") return fill(N.sameProduct, { a: n.a.name, b: n.b.name, brand: n.a.tradeName });
  const s = n.side === "a" ? n.a : n.b;
  if (n.reason === "no_route") {
    const route = result.products.find((p) => p.conceptId === s.conceptId)?.route ?? null;
    return route ? fill(DESK_NEW.routeAware.notCheckedNoRoute, { brand: s.tradeName, route, substance: s.name })
      : fill(DESK_NEW.routeAware.notCheckedNoRouteNoRoute, { brand: s.tradeName, substance: s.name });
  }
  if (n.reason === "not_run") return fill(DESK_NEW.notRun.notCheckedNotRun, { substance: s.name, brand: s.tradeName });
  return fill(DESK_NEW.routeAware.notCheckedUnmapped, { ingredient: s.name, brand: s.tradeName });
}

export default function CheckResults({ result: r }: { result: CheckResult }) {
  const groups = groupBySeverity(r.alerts);
  const others = r.notChecked.filter((n) => n.reason !== "no_data");
  const brand = new Map(r.products.map((p) => [p.conceptId, p.tradeName]));
  const checkedLines = r.products.flatMap((p) => p.substances.flatMap((s) => s.ddinter.map((c) => ({ p, s, c }))));
  const openChecked = checkedLines.some(({ c }) => c.routeAssumed || (c.routeScope !== "systemic" && c.routeScope !== "any"));
  return (
    <div className={styles.results}>
      {groups.map(([sev, alerts]) => (
        <div key={sev} className={styles["s-group"]}>
          <h3 className={styles["s-group-h"]}>{fill(CHECK.groupHeading, { severity: severityLabel(sev), k: alerts.length, pairs: pairsWord(alerts.length) })}</h3>
          {alerts.map((a) => <AlertCard key={`${a.ddinterA}|${a.ddinterB}|${a.a.conceptId}|${a.b.conceptId}`} a={a} i={r.alerts.indexOf(a)} result={r} />)}
        </div>
      ))}
      {r.noInteraction.length > 0 && (
        <div className={styles["s-quiet"]}>
          <h3>{fill(N.noInteractionHeading, { k: r.noInteraction.length, pairs: pairsWord(r.noInteraction.length) })}</h3>
          <ul>{r.noInteraction.map((n) => (
            <li key={`${n.a.conceptId}|${n.a.name}|${n.b.conceptId}|${n.b.name}`}>{n.a.tradeName} + {n.b.tradeName} <span className={styles["s-route"]}>({n.a.name} + {n.b.name})</span></li>
          ))}</ul>
          <p>{N.noInteractionCaveat}</p>
        </div>
      )}
      {noDataBlocks(r).map((b) => (
        <NoDataBlock key={`${b.conceptId}|${b.bdsId ?? b.name}`} title={b.brand === b.name ? b.brand : `${b.brand}, ${b.name}`} bdsId={b.bdsId ?? undefined} pairs={b.chips} />
      ))}
      {others.map((n, i) => <p key={i} className={styles.plain}>{otherLine(r, n)}</p>)}
      {r.duplicates.length > 0 && (
        <div className={styles["s-quiet"]}>
          <h3>{N.sameSubstanceHeading}</h3>
          <ul>{r.duplicates.map((d) => <li key={d.bdsId}>{d.name}: {d.conceptIds.map((c) => brand.get(c) ?? c).join(", ")}</li>)}</ul>
        </div>
      )}
      {r.notReviewed.length > 0 && (
        <div className={styles["s-quiet"]}>
          <h3>{`${NOT_REVIEWED}, ${fill(N.notReviewedCount, { k: r.notReviewed.length, products: plural(r.notReviewed.length, CHECK.productOne, CHECK.productMany) })}`}</h3>
          <ul>{r.notReviewed.map((n) => <li key={n.conceptId}>{n.tradeName} <ReviewStatus status="pending" /></li>)}</ul>
          <p>{N.notReviewedNote}</p>
        </div>
      )}
      {checkedLines.length > 0 && (
        <details open={openChecked ? true : undefined}>
          <summary>{N.whatChecked}</summary>
          <ul className={styles.checkedList}>
            {checkedLines.map(({ p, s, c }) => (
              <li key={`${p.conceptId}|${s.bdsId}|${c.ddinterId}`}>
                {fillNodes(N.checkedLine, { brand: p.tradeName, substance: s.name, id: <Mono id={c.ddinterId} />,
                  name: entryBaseName(c.name, c.ddinterId, c.routeScope), route: c.routeScope })}
                {c.routeAssumed && DESK_NEW.routeAware.routeAssumedSuffix}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** §6.7.3 item 8, verbatim from Board P. */
export function CheckLegend() {
  return (
    <>
      <div className={styles["s-legend"]}>
        <h3>{CHECK.legendHeading}</h3>
        <dl>
          <dt><Severity level="major" /></dt><dd>Major</dd>
          <dt><Severity level="moderate" /></dt><dd>Moderate</dd>
          <dt><Severity level="minor" /></dt><dd>Minor</dd>
          <dt><Severity level="unknown" /></dt><dd>{PUBLIC_BOARD.legendUnclassified}</dd>
          <dt><NoDataChip label={CHECK.noDataChip} /></dt><dd>{NO_DATA_SENTENCE}</dd>
        </dl>
      </div>
      <p className={styles["s-disc"]}>{DECISION_SUPPORT}</p>
    </>
  );
}
