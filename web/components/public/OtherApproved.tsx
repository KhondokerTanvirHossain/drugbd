import { Fragment } from "react";
import NoDataBlock from "@/components/ui/NoDataBlock";
import PairRecordLine from "@/components/ui/PairRecordLine";
import RecordLabel from "@/components/ui/RecordLabel";
import PairReviewBracket from "./PairReviewBracket";
import Severity from "@/components/ui/Severity";
import { DESK_NEW, PUBLIC_NEW, SHOW_COPY, UNKNOWN_PAIRS_LINE, fill } from "@/lib/copy";
import { pairRecord, unapproved, worst, type PairRecord, type PublicLabel, type PublicMode } from "@/lib/public-mode";
import type { InteractionNotChecked, InteractionPair, ProductInteractions } from "@/lib/public-types";
import { PRODUCT, plural } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import { severityOf } from "@/lib/severity";
import PublicPairCard, { pairText } from "./PublicPairCard";
import styles from "./product.module.css";

const APPROVED_ONLY = PUBLIC_NEW.otherApproved;
/** §6.10: the show-mode strings of "With other medicines"; the rest of the section's copy is shared. */
const SHOWN = { ...APPROVED_ONLY, heading: SHOW_COPY.otherHeading, meta: SHOW_COPY.otherMeta, metaMore: SHOW_COPY.otherMetaMore,
  notCheckedIn: SHOW_COPY.otherNotCheckedIn, empty: SHOW_COPY.otherEmpty };
type Copy = typeof APPROVED_ONLY;
const enc = encodeURIComponent;
const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;
const brandsWord = (k: number) => plural(k, PRODUCT.brandOne, PRODUCT.brandMany);
const joinAnd = (xs: React.ReactNode[]) => xs.map((x, i) => <Fragment key={i}>{i > 0 && (i === xs.length - 1 ? " and " : ", ")}{x}</Fragment>);

/** "With {k} approved brand[s]: {up to 3 names}[ and {n} more]. Action: {actions}" (§6.5); show mode drops "approved" (§6.10). */
function brandsMeta(p: InteractionPair, N: Copy) {
  const shown = p.brands.slice(0, 3).map((b) => b.tradeName);
  const list = shown.length < 2 ? shown.join("") : p.brandCount > 3 ? shown.join(", ") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return fill(p.brandCount > 3 ? N.metaMore : N.meta, { k: p.brandCount, brands: brandsWord(p.brandCount), list, n: p.brandCount - 3,
    actions: p.actions.join(", ") });
}

function AllBrands({ p, N, show }: { p: { brands: InteractionPair["brands"]; brandCount: number; partnerSubstance: InteractionPair["partnerSubstance"] };
    N: Copy; show: boolean }) {
  return (
    <details>
      <summary>{fill(N.allBrands, { k: p.brandCount })}</summary>
      <ul className={styles.brandList}>
        {p.brands.map((b) => <li key={b.conceptId}><a href={`/products/${enc(b.conceptId)}`}>{b.tradeName}</a>
          {show && unapproved(b.review) && <> <RecordLabel review={b.review} /></>}</li>)}
      </ul>
      {p.brandCount > p.brands.length && <p>{fill(N.brandsMore, { n: p.brandCount - p.brands.length })}
        {p.partnerSubstance.bdsId && <> <a href={`/substances/${enc(p.partnerSubstance.bdsId)}`}>{fill(N.allBrandsOf, { substance: p.partnerSubstance.name })}</a></>}</p>}
    </details>
  );
}

const QuietRecord = ({ r }: { r: PairRecord | null }) => (r ? <PairRecordLine review={r} /> : null);

const isUnclassifiedNoText = (p: InteractionPair) => severityOf(p.severity) === "unknown" && pairText(p) === null;

/** §6.7.3 item 4 line for one brand and the substance whose reason it is (no_route, not_run, unmapped). */
function otherLine(n: InteractionNotChecked, brand: string, substance: string): string {
  if (n.reason === "no_route") return n.route
    ? fill(DESK_NEW.routeAware.notCheckedNoRoute, { brand, route: n.route, substance })
    : fill(DESK_NEW.routeAware.notCheckedNoRouteNoRoute, { brand, substance });
  if (n.reason === "not_run") return fill(DESK_NEW.notRun.notCheckedNotRun, { substance, brand });
  return fill(DESK_NEW.routeAware.notCheckedUnmapped, { ingredient: substance, brand });
}

/**
 * §6.5 "With other approved medicines" (D60): approved products of every batch, grouped by partner substance, 20 partner
 * substances a page (?ix=). Unapproved partners are not shown here (the checker names them). In show mode (§6.10, D74)
 * it is "With other medicines": every visible product, each brand that is not approved labelled, and each card carries
 * PairRecordLine when this product or any brand of the group is not approved. "No interaction listed" is
 * dropped from the product page. A not-checked line whose reason is this product's own substance (side "this", G3) is
 * never dropped: a no-data one is one hatch block per own substance listing each partner; any other is its item 4 line
 * once, naming this brand ({brand}).
 */
export default function OtherApproved({ data, ix, conceptId, subject, brand, mode = "approved_only", review }:
    { data: ProductInteractions; ix: number; conceptId: string; subject: string; brand: string; mode?: PublicMode; review?: PublicLabel | null }) {
  const show = mode === "show_unreviewed";
  const N = show ? SHOWN : APPROVED_ONLY;
  const record = (partner: PublicLabel | null | undefined) => (show ? pairRecord(review ?? data.review, partner) : null);
  const href = (page: number) => `/products/${enc(conceptId)}?ix=${page}#with-other`;
  const texted = data.partners.filter((p) => !isUnclassifiedNoText(p));
  const quiet = data.partners.filter(isUnclassifiedNoText);
  const quietBy = new Map<string, InteractionPair[]>();
  for (const p of quiet) quietBy.set(p.substance.name, [...(quietBy.get(p.substance.name) ?? []), p]);
  const theirs = data.notChecked.filter((n) => n.side !== "this"), mine = data.notChecked.filter((n) => n.side === "this");
  const noData = theirs.filter((n) => n.reason === "no_data");
  const others = theirs.filter((n) => n.reason !== "no_data");
  const ownNoData = new Map<string, InteractionNotChecked[]>();
  for (const n of mine.filter((x) => x.reason === "no_data")) ownNoData.set(n.substance.name, [...(ownNoData.get(n.substance.name) ?? []), n]);
  const ownLines = [...new Set(mine.filter((n) => n.reason !== "no_data").map((n) => otherLine(n, brand, n.substance.name)))];
  const empty = data.totalPartners === 0;
  const last = Math.max(0, Math.ceil(data.totalPartners / 20) - 1);
  const past = !empty && ix > last;   // an edited or stale ?ix= past the end: back to the last real page (Review Focus 5)
  const prev = past ? last : ix - 1;
  const more = !past && (ix + 1) * 20 < data.totalPartners;
  return (
    <div className={styles["s-psec"]}>
      <h3 id="with-other" className={styles.h3}>{N.heading}</h3>
      {empty && <p>{fill(N.empty, { substance: subject })}</p>}
      {texted.map((p, i) => (
        <Fragment key={`${p.ddinterA}|${p.ddinterB}`}>
          <PublicPairCard id={`oa-${ix}-${i}`} severity={p.severity} heading="h4" names={`${p.substance.name} + ${p.partnerSubstance.name}`}
            meta={brandsMeta(p, N)} review={p.pairReview} text={pairText(p)} record={record(p.partnerReview)}
            source={fillNodes(PRODUCT.sourceLine, { a: <Mono id={p.ddinterA} />, b: <Mono id={p.ddinterB} /> })} />
          {(p.brandCount > 3 || (show && p.brands.some((b) => unapproved(b.review)))) && <AllBrands p={p} N={N} show={show} />}
        </Fragment>
      ))}
      {[...quietBy.entries()].map(([substance, pairs]) => (
        <div key={substance} className={styles["s-panel"]}>
          <div className={styles["s-row"]}><Severity level="unknown" count={pairs.length} /></div>
          <p className={styles["s-panelLead"]}>{fillNodes(N.unclassifiedWith, { substance, partners: joinAnd(pairs.map((p) => (
            <>{p.partnerSubstance.name} <PairReviewBracket review={p.pairReview} /></>))) })}</p>
          <p>{UNKNOWN_PAIRS_LINE}</p>
          <QuietRecord r={record(worst(pairs.map((p) => p.partnerReview)))} />
        </div>
      ))}
      {[...ownNoData.entries()].map(([substance, list]) => (
        <NoDataBlock key={`own|${substance}`} title={substance} bdsId={list[0].substance.bdsId ?? undefined}
          extra={list.map((n) => <p key={n.partnerSubstance.name} className="nodata-pairs">{fill(N.notCheckedIn, { substance,
            partner: n.partnerSubstance.name, k: n.brandCount, brands: brandsWord(n.brandCount) })}</p>)} />
      ))}
      {ownLines.map((line) => <p key={line}>{line}</p>)}
      {noData.map((n) => (
        <NoDataBlock key={n.partnerSubstance.name} title={n.partnerSubstance.name} bdsId={n.partnerSubstance.bdsId ?? undefined}
          extra={<p className="nodata-pairs">{fill(N.notCheckedIn, { substance: n.substance.name, partner: n.partnerSubstance.name,
            k: n.brandCount, brands: brandsWord(n.brandCount) })}</p>} />
      ))}
      {others.map((n) => n.brands.map((b) => <p key={`${n.partnerSubstance.name}|${n.reason}|${b.conceptId}`}>{otherLine(n, b.tradeName, n.partnerSubstance.name)}</p>))}
      {!empty && (ix > 0 || more) && (
        <p className={styles.pager}>
          {ix > 0 && <a href={href(prev)}>{N.previous}</a>}
          {more && <a href={href(ix + 1)}>{N.more}</a>}
        </p>
      )}
    </div>
  );
}
