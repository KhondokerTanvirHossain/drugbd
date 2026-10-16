import type { ReactNode } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PairText } from "@/components/ui/PairCard";
import Severity from "@/components/ui/Severity";
import { SourceOf } from "@/components/ui/SourceLink";
import { DESK_NEW, FROM_DDINTER, NO_TEXT, P1C_COPY, UNKNOWN_PAIR_LINE, fill } from "@/lib/copy";
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, fillNodes, plural } from "@/lib/review-copy";
import { pairKey, type PairBrand, type PairView } from "@/lib/senior-types";
import { substanceHref } from "@/lib/senior-params";
import { severityOf } from "@/lib/severity";
import { recordHref } from "../desk/hrefs";
import PairActions from "./PairActions";
import PairStateLine from "./PairStateLine";
import s from "./pages.module.css";

const mono = (t: ReactNode) => <span className="mono">{t}</span>;
const r = P1C_COPY.review;

function Entry({ id, entry }: { id: string; entry: PairView["entryA"] }) {
  return <>{mono(id)}{entry.source && <> <SourceOf source={entry.source} /></>}{entry.name ? ` ${entry.name}` : ""} ({entry.routeScope})</>;
}

function Side({ side, total, list }: { side: PairView["substanceA"]; total: number; list: PairBrand[] }) {
  return (
    <>
      <p className={s.side}>{side.name}</p>
      <ul>
        {list.map((b) => (
          <li key={`${b.batchId}/${b.conceptId}`}>
            <a href={recordHref(b.batchId, b.conceptId)}>{fillNodes(P1C_COPY.other.partnerRef, { name: b.tradeName, batchId: mono(b.batchId) })}</a>{" "}
            <ReviewStatus status={b.displayStatus} />
          </li>
        ))}
      </ul>
      {total > list.length && (
        <p>{fill(r.andMore, { n: total - list.length })} <a href={substanceHref(side.bdsId)}>{fill(r.allBrandsOf, { substance: side.name })}</a></p>
      )}
    </>
  );
}

/**
 * §5.17.2 pair row, the same on the queue (`h2`) and the substance page (`h3`). Server-rendered: the text, brands, changes
 * and history read without JavaScript. PairStateLine and PairActions are the SeniorDesk island's parts.
 */
export default function PairRow({ p, heading }: { p: PairView; heading: "h2" | "h3" }) {
  const id = `pair-${p.ddinterA}-${p.ddinterB}`;
  const H = heading;
  const sideA = p.brands.filter((b) => b.side === "a"), sideB = p.brands.filter((b) => b.side === "b");
  // §5.17.2 item 2: the entry no held product is checked against; both when neither is.
  const notChosen = p.brandCounts.a === 0 && p.brandCounts.b === 0
    ? fillNodes(r.eitherId, { a: mono(p.ddinterA), b: mono(p.ddinterB) }) : mono(p.brandCounts.a === 0 ? p.ddinterA : p.ddinterB);
  const body = p.management ?? p.interaction;
  const management = p.management !== null;
  const suffix = management ? "" : DESK.noManagementForPair;
  const footer = body === null ? (severityOf(p.severity) === "unknown" ? UNKNOWN_PAIR_LINE : NO_TEXT)
    : `${management ? DESK.managementTruncated : DESK.interactionTruncated}${suffix}`;
  return (
    <article className={`pair-row ${s.row}`} id={id} aria-labelledby={`${id}-h`} data-pair={pairKey(p.ddinterA, p.ddinterB)}>
      <div className={s.rowHead}>
        <Severity level={p.severity} />
        <H className={s.rowTitle} id={`${id}-h`} tabIndex={-1}>
          <a href={substanceHref(p.substanceA.bdsId)}>{p.substanceA.name}</a> + <a href={substanceHref(p.substanceB.bdsId)}>{p.substanceB.name}</a>
        </H>
      </div>
      <p className="pair-meta">
        {FROM_DDINTER}. <Entry id={p.ddinterA} entry={p.entryA} /> + <Entry id={p.ddinterB} entry={p.entryB} />.{" "}
        {p.actions.length > 0 && fill(DESK.actionIn, { actions: p.actions.join(", ") })}
      </p>
      {!p.applies && <p className={s.plain}>{fillNodes(r.notApplies, { id: notChosen })}</p>}
      <p className={s.plain}>{fill(r.brandsLine, { a: p.brandCounts.a, brandsA: plural(p.brandCounts.a, "brand", "brands"),
        substanceA: p.substanceA.name, b: p.brandCounts.b, brandsB: plural(p.brandCounts.b, "brand", "brands"), substanceB: p.substanceB.name,
        k: p.brandCounts.batches, batches: plural(p.brandCounts.batches, "batch", "batches") })}</p>
      <details className={s.brands}>
        <summary>{r.brands}</summary>
        <Side side={p.substanceA} total={p.brandCounts.a} list={sideA} />
        <Side side={p.substanceB} total={p.brandCounts.b} list={sideB} />
      </details>
      <PairText id={id} text={body === null ? undefined : { kind: management ? "management" : "interaction", body }} source={footer}
        sourceOpen={body === null ? undefined : `${management ? DESK.managementFull : DESK.interactionFull}${suffix}`}
        link={p.source ? <SourceOf source={p.source} /> : undefined} surface="reviewer" />
      <PairStateLine ddinterA={p.ddinterA} ddinterB={p.ddinterB} review={p.review} />
      {p.review.state === "changed" && p.changes.length > 0 && (
        <details className={s.details}>
          <summary>{r.changedSummary}</summary>
          <table className={s.changes}>
            <thead><tr><th scope="col"><span className="sr-only">{DESK.cmpField}</span></th><th scope="col">{r.atReview}</th><th scope="col">{DESK.diffNow}</th></tr></thead>
            <tbody>{p.changes.map((c) => <tr key={c.field}><th scope="row">{c.field}</th><td>{c.atReview ?? ""}</td><td>{c.now ?? ""}</td></tr>)}</tbody>
          </table>
        </details>
      )}
      <PairActions ddinterA={p.ddinterA} ddinterB={p.ddinterB} />
      {p.history.length > 0 && (
        <details className={s.details}>
          <summary>{r.historySummary}</summary>
          <ol className={s.hist}>
            {p.history.map((h, i) => (
              <li key={i}>
                <span className={s.histT}>{fmtUtc(h.at)}<span>{fmtDhaka(h.at)}</span></span>
                <span>
                  {h.decision === "reviewed" ? (h.mine ? r.historyReviewedMine : r.historyReviewed) : (h.mine ? DESK.issueMine : DESK_NEW.history.issueSenior)}
                  {h.note ? <> <span className="raw">{h.note}</span></> : null}
                  {h.changedAfter && <span className={s.histSub}>{r.historyChangedAfter}</span>}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
