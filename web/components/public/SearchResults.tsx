import { Fragment, type ReactNode } from "react";
import CodeChip from "@/components/ui/CodeChip";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { buttonClass } from "@/components/ui/Button";
import { joinAnd } from "@/lib/check-summary";
import { DESK_NEW, NOT_RUN, NO_DATA_SENTENCE, PUBLIC_NEW, fill } from "@/lib/copy";
import type { SearchProduct, SearchResult, SearchStub, SearchSubstance } from "@/lib/public-types";
import { SEARCH, SYSTEM_NAMES, plural } from "@/lib/public-copy";
import { SEARCH_PAGE_MAX } from "@/lib/public-params";
import { fillNodes } from "@/lib/review-copy";
import styles from "./search.module.css";

const enc = encodeURIComponent;
const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

/** The first case-insensitive occurrence of q in <mark>; the text as it is when q does not occur. */
export function Marked({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function hitLine(s: SearchSubstance): ReactNode {
  const matched = <mark>{s.matchedName}</mark>;
  if (s.matchedNameType === "dgda_content") {
    const systems = s.otherNameTypes.map((t) => SYSTEM_NAMES[t]).filter(Boolean);
    const template = systems.length ? SEARCH.hitDgda : SEARCH.hitDgda.split(" {systems}")[0];
    return fillNodes(template, { matched, systems: joinAnd(systems), preferred: s.preferredName });
  }
  if (s.matchedNameType === "rxnorm") return fillNodes(PUBLIC_NEW.search.hitRxnorm, { matched });
  if (s.matchedNameType === "ddinter") return fillNodes(PUBLIC_NEW.search.hitDdinter, { matched });
  return null;
}

function SubstanceHit({ s }: { s: SearchSubstance }) {
  const line = hitLine(s);
  return (
    <article className={styles["s-res"]}>
      <div className={styles["s-res-main"]}>
        <a className={styles["s-res-name"]} href={`/substances/${enc(s.bdsId)}`}>{s.preferredName}</a>
        {line && <p className={styles["s-hit"]}>{line}</p>}
        <p className={styles["s-res-meta"]}>
          <Mono>{s.bdsId}</Mono>
          {s.coverage === "full" && <span>{fillNodes(SEARCH.dataFound, { ids: s.ddinterIds.map((id, i) => <Fragment key={id}>{i > 0 && ", "}<Mono>{id}</Mono></Fragment>) })}</span>}
          {s.coverage === "none" && <span><NoDataChip label="No interaction data" /> {NO_DATA_SENTENCE}</span>}
          {s.coverage === "not_run" && <span>{NOT_RUN}</span>}
          <span>{fill(s.approvedProductCount === 1 ? PUBLIC_NEW.search.approvedOne : PUBLIC_NEW.search.approvedMany, { k: s.approvedProductCount })}</span>
        </p>
      </div>
      <div className={styles["s-res-side"]}>
        <div className="codes">
          {s.keyCodes.atc.map((c) => <CodeChip key={`a${c}`} system="ATC" code={c} />)}
          {s.keyCodes.rxcui.map((c) => <CodeChip key={`r${c}`} system="RXCUI" code={c} />)}
        </div>
      </div>
    </article>
  );
}

function ProductHit({ p, q }: { p: SearchProduct; q: string }) {
  return (
    <article className={styles["s-res"]}>
      <div className={styles["s-res-main"]}>
        <a className={styles["s-res-name"]} href={`/products/${enc(p.conceptId)}`}>{p.tradeName}</a>
        <p className={styles["s-res-meta"]}><span>{p.dosageForm}</span><span>{p.company}</span><Mono>DAR {p.darNumber}</Mono></p>
        {p.clinicalDrug && (
          <p className={styles["s-hit"]}>{fillNodes(SEARCH.filedAs, { raw: <Marked text={p.genericContentRaw} q={q} />,
            display: p.clinicalDrug.displayName, bdc: <Mono>{p.clinicalDrug.bdcId}</Mono> })}</p>
        )}
      </div>
      <div className={styles["s-res-side"]}><ReviewStatus status="approved" /></div>
    </article>
  );
}

/** §6.3 stub hit: matched on trade name or DAR only; its composition is never shown (D16). */
function StubHit({ p }: { p: SearchStub }) {
  return (
    <article className={`${styles["s-res"]} ${styles["s-res--stub"]}`}>
      <div className={styles["s-res-main"]}>
        <a className={styles["s-res-name"]} href={`/products/${enc(p.conceptId)}`}>{p.tradeName}</a>
        <p className={styles["s-res-meta"]}><Mono>{p.conceptId}</Mono></p>
        <p className={styles["s-res-meta"]}>{SEARCH.stubLine}</p>
      </div>
      <div className={styles["s-res-side"]}><ReviewStatus status="pending" /></div>
    </article>
  );
}

const pageHref = (q: string, page: number) => `/search?${new URLSearchParams({ q, page: String(page) })}`;

export default function SearchResults({ result, q, page, capped, inReview }:
    { result: SearchResult; q: string; page: number; capped: boolean; inReview: number }) {
  if (result.total === 0) {
    return (
      <section className={styles["s-page"]}>
        <div className={styles["s-empty"]}>
          <h1 className={styles.h1}>{fill(SEARCH.noResults, { q })}</h1>
          <p>{SEARCH.noResultsHint}</p>
          {result.suggestion && (
            <p className={styles["s-row"]}><a className={buttonClass("tonal")} href={`/search?${new URLSearchParams({ q: result.suggestion })}`}>
              {fill(SEARCH.searchFor, { suggestion: result.suggestion })}</a></p>
          )}
          {inReview > 0 && <p>{fill(SEARCH.pilot, { n: inReview })}</p>}
        </div>
      </section>
    );
  }
  const { substances, products } = result.counts;
  const count = [substances > 0 && `${substances} ${plural(substances, SEARCH.substanceOne, SEARCH.substanceMany)}`,
    products > 0 && `${products} ${plural(products, SEARCH.productOne, SEARCH.productMany)}`].filter(Boolean).join(", ");
  const atCap = capped || (page === SEARCH_PAGE_MAX && result.hasMore);
  return (
    <section className={styles["s-page"]}>
      <div className={styles["s-results-h"]}><h1 className={styles.h1}>{fill(SEARCH.resultsFor, { q })}</h1><span>{count}</span></div>
      {result.substances.length > 0 && (
        <div className={styles["s-rgroup"]}>
          <h2 className={styles.h2}>{result.substances.length === 1 && substances === 1 ? SEARCH.groupSubstance : SEARCH.groupSubstances}</h2>
          {result.substances.map((s) => <SubstanceHit key={s.bdsId} s={s} />)}
        </div>
      )}
      {result.products.length > 0 && (
        <div className={styles["s-rgroup"]}>
          <h2 className={styles.h2}>{SEARCH.groupProducts}</h2>
          {result.products.map((p) => ("hidden" in p ? <StubHit key={p.conceptId} p={p} /> : <ProductHit key={p.conceptId} p={p} q={q} />))}
        </div>
      )}
      {(page > 0 || (result.hasMore && !atCap)) && (
        <p className={styles["s-row"]}>
          {page > 0 && <a href={pageHref(q, page - 1)}>{DESK_NEW.reviewLists.previousPage}</a>}
          {result.hasMore && !atCap && <a href={pageHref(q, page + 1)}>{DESK_NEW.reviewLists.nextPage}</a>}
        </p>
      )}
      {atCap && <p className={styles["s-cap"]}>{PUBLIC_NEW.search.pageCap}</p>}
    </section>
  );
}
