import { DESK } from "@/lib/review-copy";
import { FILTER_KEYS, type FilterKey } from "@/lib/review-types";
import { recordHref } from "./desk/hrefs";
import s from "./sidebar.module.css";

const ICON: Record<FilterKey, string | null> = { all: s.icoStack, needs: s.icoClock, warn: s.icoWarn, issue: s.icoFlag, approved: s.icoSeal, nodata: null };

/** §5.3 "Show" filters as GET links (they work without JavaScript); the search text is kept. */
export default function ShowFilters({ batchId, conceptId, show, q, counts }:
    { batchId: string; conceptId: string; show: FilterKey; q: string; counts: Record<FilterKey, number> }) {
  return (
    <div>
      <p className="chrome-heading">{DESK.showHeading}</p>
      <div className="filters" role="group" aria-label={DESK.showHeading}>
        {FILTER_KEYS.map((k) => (
          <a key={k} className="filter" data-fk={`f-${k}`} href={recordHref(batchId, conceptId, { show: k, q })}
            aria-current={k === show ? "true" : undefined}>
            {ICON[k] ? <span className={`ico ${ICON[k]}`} aria-hidden="true" /> : <span className={s.ndIco} aria-hidden="true" />}
            {DESK.filters[k]}<span className="filter-n">{counts[k]}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
