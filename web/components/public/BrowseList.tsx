import UnreviewedCaution from "@/components/ui/UnreviewedCaution";
import { BROWSE_COPY, DESK_NEW, fill } from "@/lib/copy";
import { rendersUnreviewed, type PublicMode } from "@/lib/public-mode";
import { BROWSE_DIGITS, BROWSE_LETTERS, SEARCH_PAGE_MAX } from "@/lib/public-params";
import type { BrowseResult } from "@/lib/public-types";
import { ProductHit } from "./SearchResults";
import styles from "./search.module.css";

const B = BROWSE_COPY;
/** The letter as a sentence names it: `0-9` is "a number or symbol". */
const letterName = (letter: string) => (letter === BROWSE_DIGITS ? B.digitsPhrase : letter);
/** The letter as the bar shows it: `0-9` is "0–9". */
const letterLabel = (letter: string) => (letter === BROWSE_DIGITS ? B.digits : letter);

/** A medicine-list URL: the letter when one is chosen, then the page when given (the letter bar's links drop it). */
export function browseHref(letter: string | null, page?: number): string {
  const params = new URLSearchParams();
  if (letter !== null) params.set("letter", letter);
  if (page !== undefined) params.set("page", String(page));
  const s = params.toString();
  return s ? `/search?${s}` : "/search";
}

/** "{n} medicine[s]", "{n} medicine[s] starting with {letter}" or "… starting with a number or symbol" (§6.11.2). */
export function browseCount(total: number, letter: string | null): string {
  if (letter === null) return fill(total === 1 ? B.countOne : B.countMany, { n: total });
  return fill(total === 1 ? B.countLetterOne : B.countLetterMany, { n: total, letter: letterName(letter) });
}

/** §6.11.2 letter bar: All, A–Z, 0–9. A letter with no visible product is a span, not a link; the current choice is marked. */
function LetterBar({ counts, current }: { counts: Map<string, number>; current: string | null }) {
  return (
    <nav aria-label={B.barLabel} className={styles["s-letters"]}>
      <ul>
        <li><a href={browseHref(null)} aria-current={current === null ? "page" : undefined}>{B.all}</a></li>
        {BROWSE_LETTERS.map((l) => {
          const here = current === l ? "page" : undefined;
          return (
            <li key={l}>
              {(counts.get(l) ?? 0) > 0 ? <a href={browseHref(l)} aria-current={here}>{letterLabel(l)}</a>
                : <span aria-disabled="true" aria-current={here}>{letterLabel(l)}</span>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * §6.11.2 the medicine list: every visible product A to Z, 50 a page, by first letter, each row the §6.3 approved product
 * hit with its label. In show mode the page opens with the caution when a listed row is not approved (§6.10).
 */
export default function BrowseList({ result, letter, page, capped, mode = "approved_only" }:
    { result: BrowseResult; letter: string | null; page: number; capped: boolean; mode?: PublicMode }) {
  const counts = new Map(result.letters.map((x) => [x.letter, x.count]));
  const anyVisible = result.letters.some((x) => x.count > 0);
  const atCap = capped || (page === SEARCH_PAGE_MAX && result.hasMore);
  const caution = rendersUnreviewed(mode, result.products.map((p) => p.review));
  return (
    <>
    {caution && <UnreviewedCaution />}
    <section className={styles["s-page"]}>
      <div className={styles["s-browse-h"]}>
        <h1 className={styles.h1}>{B.h1}</h1>
        <p className={styles["s-lede"]}>{B.lede}</p>
        {result.total > 0 ? <p className={styles["s-count"]}>{browseCount(result.total, letter)}</p>
          : <p className={styles["s-count"]}>{letter === null ? B.emptyAll : fill(B.emptyLetter, { letter: letterName(letter) })}</p>}
      </div>
      {anyVisible && <LetterBar counts={counts} current={letter} />}
      {result.products.length > 0 && (
        <div className={styles["s-rgroup"]}>
          {result.products.map((p) => <ProductHit key={p.conceptId} p={p} q="" />)}
        </div>
      )}
      {(page > 0 || (result.hasMore && !atCap)) && (
        <p className={styles["s-row"]}>
          {page > 0 && <a href={browseHref(letter, page - 1)}>{DESK_NEW.reviewLists.previousPage}</a>}
          {result.hasMore && !atCap && <a href={browseHref(letter, page + 1)}>{DESK_NEW.reviewLists.nextPage}</a>}
        </p>
      )}
      {atCap && <p className={styles["s-cap"]}>{letter === null ? B.capAll : fill(B.capLetter, { letter: letterName(letter) })}</p>}
    </section>
    </>
  );
}
