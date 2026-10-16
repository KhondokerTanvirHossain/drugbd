import { Fragment } from "react";
import NoDataBlock from "@/components/ui/NoDataBlock";
import PairReviewBracket from "./PairReviewBracket";
import Severity from "@/components/ui/Severity";
import { DESK_NEW, PUBLIC_NEW, UNKNOWN_PAIRS_LINE, fill } from "@/lib/copy";
import type { InteractionNotChecked, InteractionPair, ProductInteractions } from "@/lib/public-types";
import { PRODUCT, plural } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import { severityOf } from "@/lib/severity";
import PublicPairCard, { pairText } from "./PublicPairCard";
import styles from "./product.module.css";

const N = PUBLIC_NEW.otherApproved;
const enc = encodeURIComponent;
const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;
const brandsWord = (k: number) => plural(k, PRODUCT.brandOne, PRODUCT.brandMany);
const joinAnd = (xs: React.ReactNode[]) => xs.map((x, i) => <Fragment key={i}>{i > 0 && (i === xs.length - 1 ? " and " : ", ")}{x}</Fragment>);

/** "With {k} approved brand[s]: {up to 3 names}[ and {n} more]. Action: {actions}" (§6.5). */
function brandsMeta(p: InteractionPair) {
  const shown = p.brands.slice(0, 3).map((b) => b.tradeName);
  const list = shown.length < 2 ? shown.join("") : p.brandCount > 3 ? shown.join(", ") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return fill(p.brandCount > 3 ? N.metaMore : N.meta, { k: p.brandCount, brands: brandsWord(p.brandCount), list, n: p.brandCount - 3,
    actions: p.actions.join(", ") });
}

function AllBrands({ p }: { p: { brands: InteractionPair["brands"]; brandCount: number; partnerSubstance: InteractionPair["partnerSubstance"] } }) {
  return (
    <details>
      <summary>{fill(N.allBrands, { k: p.brandCount })}</summary>
      <ul className={styles.brandList}>
        {p.brands.map((b) => <li key={b.conceptId}><a href={`/products/${enc(b.conceptId)}`}>{b.tradeName}</a></li>)}
      </ul>
      {p.brandCount > p.brands.length && <p>{fill(N.brandsMore, { n: p.brandCount - p.brands.length })}
        {p.partnerSubstance.bdsId && <> <a href={`/substances/${enc(p.partnerSubstance.bdsId)}`}>{fill(N.allBrandsOf, { substance: p.partnerSubstance.name })}</a></>}</p>}
    </details>
  );
}

const isUnclassifiedNoText = (p: InteractionPair) => severityOf(p.severity) === "unknown" && pairText(p) === null;

/** §6.7.3 item 4 line for one partner brand (no_route, not_run, unmapped). */
function otherLine(n: InteractionNotChecked, brand: string): string {
  if (n.reason === "no_route") return n.route
    ? fill(DESK_NEW.routeAware.notCheckedNoRoute, { brand, route: n.route, substance: n.partnerSubstance.name })
    : fill(DESK_NEW.routeAware.notCheckedNoRouteNoRoute, { brand, substance: n.partnerSubstance.name });
  if (n.reason === "not_run") return fill(DESK_NEW.notRun.notCheckedNotRun, { substance: n.partnerSubstance.name, brand });
  return fill(DESK_NEW.routeAware.notCheckedUnmapped, { ingredient: n.partnerSubstance.name, brand });
}

/**
 * §6.5 "With other approved medicines" (D60): approved products of every batch, grouped by partner substance, 20 partner
 * substances a page (?ix=). Unapproved partners are not shown here (the checker names them). "No interaction listed" is
 * dropped from the product page.
 */
export default function OtherApproved({ data, ix, conceptId, subject }:
    { data: ProductInteractions; ix: number; conceptId: string; subject: string }) {
  const href = (page: number) => `/products/${enc(conceptId)}?ix=${page}#with-other`;
  const texted = data.partners.filter((p) => !isUnclassifiedNoText(p));
  const quiet = data.partners.filter(isUnclassifiedNoText);
  const quietBy = new Map<string, InteractionPair[]>();
  for (const p of quiet) quietBy.set(p.substance.name, [...(quietBy.get(p.substance.name) ?? []), p]);
  const noData = data.notChecked.filter((n) => n.reason === "no_data");
  const others = data.notChecked.filter((n) => n.reason !== "no_data");
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
            meta={brandsMeta(p)} review={p.pairReview} text={pairText(p)}
            source={fillNodes(PRODUCT.sourceLine, { a: <Mono id={p.ddinterA} />, b: <Mono id={p.ddinterB} /> })} />
          {p.brandCount > 3 && <AllBrands p={p} />}
        </Fragment>
      ))}
      {[...quietBy.entries()].map(([substance, pairs]) => (
        <div key={substance} className={styles["s-panel"]}>
          <div className={styles["s-row"]}><Severity level="unknown" count={pairs.length} /></div>
          <p className={styles["s-panelLead"]}>{fillNodes(N.unclassifiedWith, { substance, partners: joinAnd(pairs.map((p) => (
            <>{p.partnerSubstance.name} <PairReviewBracket review={p.pairReview} /></>))) })}</p>
          <p>{UNKNOWN_PAIRS_LINE}</p>
        </div>
      ))}
      {noData.map((n) => (
        <NoDataBlock key={n.partnerSubstance.name} title={n.partnerSubstance.name} bdsId={n.partnerSubstance.bdsId ?? undefined}
          extra={<p className="nodata-pairs">{fill(N.notCheckedIn, { substance: n.substance.name, partner: n.partnerSubstance.name,
            k: n.brandCount, brands: brandsWord(n.brandCount) })}</p>} />
      ))}
      {others.map((n) => n.brands.map((b) => <p key={`${n.partnerSubstance.name}|${n.reason}|${b.conceptId}`}>{otherLine(n, b.tradeName)}</p>))}
      {!empty && (ix > 0 || more) && (
        <p className={styles.pager}>
          {ix > 0 && <a href={href(prev)}>{N.previous}</a>}
          {more && <a href={href(ix + 1)}>{N.more}</a>}
        </p>
      )}
    </div>
  );
}
