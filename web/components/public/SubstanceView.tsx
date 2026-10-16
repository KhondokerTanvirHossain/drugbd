import Expander from "@/components/Expander";
import NoDataBlock from "@/components/ui/NoDataBlock";
import Severity from "@/components/ui/Severity";
import SourceLink from "@/components/ui/SourceLink";
import pc from "@/components/ui/PairCard.module.css";
import { DESK_NEW, NOT_RUN, SEVERITY_NOT_CLASSIFIED, fill } from "@/lib/copy";
import type { PublicSubstance, SeverityFilter, SubstanceInteractionItem, SubstanceInteractions } from "@/lib/public-types";
import { PRODUCT, SUBSTANCE } from "@/lib/public-copy";
import { ddinterText } from "@/lib/ddinter-text";
import { DESK, fillNodes } from "@/lib/review-copy";
import { CodesRows } from "./CodesTable";
import PublicPairCard, { TRUNCATE_AT, pairText } from "./PublicPairCard";
import { groupNames } from "./WhatsInIt";
import styles from "./product.module.css";

const enc = encodeURIComponent;
const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;
const FILTERS: [SeverityFilter | null, string][] = [[null, SUBSTANCE.filterAll], ["major", "Major"], ["moderate", "Moderate"],
  ["minor", "Minor"], ["unknown", SEVERITY_NOT_CLASSIFIED]];

function href(bdsId: string, severity: SeverityFilter | null, page: number) {
  const p = new URLSearchParams();
  if (severity) p.set("severity", severity);
  if (page > 0) p.set("page", String(page));
  const q = p.toString();
  return `/substances/${enc(bdsId)}${q ? `?${q}` : ""}#pairs`;
}

/**
 * A disease or food line: name, chip and DDInter's text, clamped by the Expander once JavaScript runs (§6.6). DDInter
 * placeholders ("None", "-") are never printed (§3.6).
 */
function TextLine({ id, name, severity, text: raw }: { id: string; name: string; severity: string; text: string | null }) {
  const text = ddinterText(raw);
  return (
    <li className={styles["s-panel"]}>
      <p className={styles["s-row"]}><b>{name}</b> <Severity level={severity} /></p>
      {text && <p className={`pair-text ${pc.open}`} id={id}>{text}</p>}
      {text && text.length > TRUNCATE_AT && <p className="pair-source"><Expander targetId={id} label="public" /></p>}
    </li>
  );
}

function Pair({ s, item, i }: { s: PublicSubstance; item: SubstanceInteractionItem; i: number }) {
  const mine = new Set(s.entries.map((e) => e.ddinterId));
  const myId = mine.has(item.ddinterA) ? item.ddinterA : item.ddinterB;
  const partnerId = myId === item.ddinterA ? item.ddinterB : item.ddinterA;
  const partner = item.partnerBdsId ? <a href={`/substances/${enc(item.partnerBdsId)}`}>{item.partnerName}</a> : item.partnerName;
  return (
    <PublicPairCard id={`sp-${i}`} severity={item.severity} heading="h3" names={<>{s.preferredName} + {partner}</>}
      meta={fillNodes(SUBSTANCE.pairMeta, { a: <Mono id={myId} />, route: item.routeScope, b: <Mono id={partnerId} />, actions: item.actions.join(", ") })}
      review={item.pairReview} text={pairText(item)}
      source={fillNodes(PRODUCT.sourceLine, { a: <Mono id={item.ddinterA} />, b: <Mono id={item.ddinterB} /> })}
      link={item.sourceUrl ? { url: item.sourceUrl, label: SUBSTANCE.fullRecord, fetchedAt: null } : null} />
  );
}

/** §6.6: built from the product-page components only. Coverage full is neutral text, never green. */
export default function SubstanceView({ s, list, severity, page }:
    { s: PublicSubstance; list: SubstanceInteractions | null; severity: SeverityFilter | null; page: number }) {
  const cov = s.coverage.coverage;
  const last = list ? Math.max(0, Math.ceil(list.total / list.size) - 1) : 0;
  const past = list !== null && list.total > 0 && page > last;   // a stale or edited ?page= past the end (Review Focus 5)
  const more = list !== null && !past && (page + 1) * list.size < list.total;
  const codes = s.codes.map((c) => ({ ...c, source: c.sourceLink }));
  return (
    <div className={styles.single}>
      <div>
        <nav aria-label={PRODUCT.crumbLabel}><p className={styles["s-crumb"]}><a href="/search">{PRODUCT.crumbRoot}</a><span aria-hidden="true">/</span><span>{s.preferredName}</span></p></nav>
        <h1 className={styles.h1}>{s.preferredName} <span className="mono">{s.bdsId}</span></h1>
      </div>
      {s.names.length > 0 && (
        <ul className={styles["s-names"]} aria-label={PRODUCT.namesLabel}>
          {groupNames(s.names.map((n) => ({ name: n.name, type: n.nameType, source: n.source }))).map(([name, sources]) => <li key={name}>{name} <span>{sources}</span></li>)}
        </ul>
      )}
      <section className={styles["s-psec"]} aria-labelledby="codes">
        <div className={styles["s-psec-h"]}><h2 id="codes" className={styles.h2}>{PRODUCT.codes}</h2></div>
        <div className={styles["s-tw"]} tabIndex={0} role="region" aria-label={fill(PRODUCT.codesRegion, { name: s.preferredName })}>
          <table className={styles["s-table"]}>
            <caption className="sr-only">{fill(PRODUCT.codesCaption, { name: s.preferredName })}</caption>
            <thead><tr><th scope="col">{PRODUCT.colSystem}</th><th scope="col">{PRODUCT.colCode}</th><th scope="col">{PRODUCT.colWhat}</th>
              <th scope="col">{PRODUCT.colHow}</th><th scope="col">{PRODUCT.colSource}</th></tr></thead>
            <tbody><CodesRows codes={codes} chosen={null} coverage={cov} route={null} /></tbody>
          </table>
        </div>
      </section>
      <section className={styles["s-psec"]} aria-labelledby="entries">
        <div className={styles["s-psec-h"]}><h2 id="entries" className={styles.h2}>{SUBSTANCE.entriesHeading}</h2></div>
        {cov === "full" && <p>{DESK.dataFound}</p>}
        {cov === "none" && <NoDataBlock title={s.preferredName} bdsId={s.bdsId} extra={<p className="nodata-text">{DESK.noDataLine}</p>} />}
        {cov === "not_run" && <p>{NOT_RUN}</p>}
        {cov === "full" && s.entries.map((e) => (
          <div key={e.ddinterId} className={styles["s-row"]}>
            <span>{fillNodes(SUBSTANCE.entryLine, { id: <Mono id={e.ddinterId} />, route: e.routeScope })}</span>
            {(["major", "moderate", "minor", "unknown"] as const).filter((k) => e.counts[k] > 0).map((k) => <Severity key={k} level={k} count={e.counts[k]} />)}
            {e.sourceLink && <SourceLink url={e.sourceLink.url} label={e.sourceLink.label} fetchedAt={e.sourceLink.fetchedAt} />}
          </div>
        ))}
      </section>
      {cov === "full" && (
        <section className={styles["s-psec"]} aria-labelledby="pairs">
          <div className={styles["s-psec-h"]}><h2 id="pairs" className={styles.h2}>{SUBSTANCE.ddHeading}</h2></div>
          <nav aria-label={SUBSTANCE.filterLabel}>
            <p className={styles.filters}>
              {FILTERS.map(([value, label]) => (
                <a key={label} aria-current={value === severity ? "page" : undefined} href={href(s.bdsId, value, 0)}>{label}</a>
              ))}
            </p>
          </nav>
          {list && list.items.length === 0 && !past && <p>{SUBSTANCE.noneListed}</p>}
          {list?.items.map((item, i) => <Pair key={`${item.ddinterA}|${item.ddinterB}|${i}`} s={s} item={item} i={i} />)}
          {list && list.total > 0 && (page > 0 || more) && (
            <p className={styles.pager}>
              {page > 0 && <a href={href(s.bdsId, severity, past ? last : page - 1)}>{DESK_NEW.reviewLists.previousPage}</a>}
              {more && <a href={href(s.bdsId, severity, page + 1)}>{DESK_NEW.reviewLists.nextPage}</a>}
            </p>
          )}
        </section>
      )}
      {cov === "full" && (
        <section className={styles["s-psec"]} aria-labelledby="diseases">
          <div className={styles["s-psec-h"]}><h2 id="diseases" className={styles.h2}>{SUBSTANCE.diseaseHeading}</h2></div>
          {s.diseases.length === 0 ? <p>{SUBSTANCE.noneListed}</p> : (
            <ul className={styles.brandList}>{s.diseases.map((d, i) => <TextLine key={`${d.interactionId}|${d.routeScope}`} id={`dis-${i}`} name={d.diseaseName} severity={d.severity} text={d.text} />)}</ul>
          )}
        </section>
      )}
      {cov === "full" && (
        <section className={styles["s-psec"]} aria-labelledby="foods">
          <div className={styles["s-psec-h"]}><h2 id="foods" className={styles.h2}>{SUBSTANCE.foodHeading}</h2></div>
          {s.foods.length === 0 ? <p>{SUBSTANCE.noneListed}</p> : (
            <ul className={styles.brandList}>{s.foods.map((f, i) => <TextLine key={`${f.interactionId}|${f.routeScope}`} id={`food-${i}`} name={f.food} severity={f.severity} text={ddinterText(f.management) || f.description} />)}</ul>
          )}
        </section>
      )}
      <section className={styles["s-psec"]} aria-labelledby="products">
        <div className={styles["s-psec-h"]}><h2 id="products" className={styles.h2}>{SUBSTANCE.productsHeading}</h2></div>
        <ul className={styles.brandList}>{s.products.map((p) => <li key={p.conceptId}><a href={`/products/${enc(p.conceptId)}`}>{p.tradeName}</a> {p.company}</li>)}</ul>
      </section>
      {s.clinicalDrugs.length > 0 && (
        <section className={styles["s-psec"]} aria-labelledby="clinical">
          <div className={styles["s-psec-h"]}><h2 id="clinical" className={styles.h2}>{SUBSTANCE.clinicalHeading}</h2></div>
          <ul className={styles.brandList}>{s.clinicalDrugs.map((c) => <li key={c.bdcId}>{c.displayName} <span className="mono">{c.bdcId}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
