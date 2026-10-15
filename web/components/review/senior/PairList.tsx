import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { SENIOR_PAGE_SIZE, pairKey, type PairRef, type PairView } from "@/lib/senior-types";
import PairRow from "./PairRow";
import SeniorDesk, { type SeniorDeskProps } from "./SeniorDesk";
import s from "./pages.module.css";

const toRef = (p: PairView): PairRef => ({ ddinterA: p.ddinterA, ddinterB: p.ddinterB, nameA: p.substanceA.name, nameB: p.substanceB.name,
  version: p.version, state: p.review.state });

/**
 * One page of pair rows inside the SeniorDesk island, with "{from}–{to} of {total} pairs" and the paging links. A page past
 * the end (stale link, Review Focus 5) shows "Previous page" to the last page, never the empty-state sentence.
 */
export default function PairList({ items, total, page, heading, emptyText, emptyLink, pageHref, desk }: {
  items: PairView[]; total: number; page: number; heading: "h2" | "h3"; emptyText: string; emptyLink: string | null;
  pageHref: (page: number) => string; desk: Omit<SeniorDeskProps, "pairs" | "children" | "role">;
}) {
  const r = P1C_COPY.review, t = DESK_NEW.reviewLists;
  if (total === 0) {
    return (
      <div className={s.empty}>
        <p>{emptyText}</p>
        {emptyLink && <a className={buttonClass("tonal", "sm")} href={emptyLink}>{r.showAllPairs}</a>}
      </div>
    );
  }
  const last = Math.max(0, Math.ceil(total / SENIOR_PAGE_SIZE) - 1);
  const prev = items.length === 0 ? Math.min(last, page - 1) : page > 0 ? page - 1 : null;
  const next = (page + 1) * SENIOR_PAGE_SIZE < total && items.length > 0 ? page + 1 : null;
  return (
    <>
      {items.length > 0 && (
        <>
          <p className={s.range}>{fill(r.range, { from: page * SENIOR_PAGE_SIZE + 1, to: page * SENIOR_PAGE_SIZE + items.length, total })}</p>
          <SeniorDesk role="senior" {...desk} pairs={items.map(toRef)}>
            <div className={s.rows}>{items.map((p) => <PairRow key={pairKey(p.ddinterA, p.ddinterB)} p={p} heading={heading} />)}</div>
          </SeniorDesk>
          <noscript><p>{r.noScript}</p></noscript>
        </>
      )}
      {(prev !== null || next !== null) && (
        <p className={s.paging}>
          {prev !== null && <a href={pageHref(prev)}>{t.previousPage}</a>}
          {next !== null && <a href={pageHref(next)}>{t.nextPage}</a>}
        </p>
      )}
    </>
  );
}
