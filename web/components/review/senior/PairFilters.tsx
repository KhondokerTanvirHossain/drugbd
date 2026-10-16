import { SEVERITY_LABEL } from "@/components/ui/Severity";
import { ISSUE_REPORTED, P1C_COPY } from "@/lib/copy";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import { PAIR_SHOWS, SEVERITY_FILTERS, type PairScope, type PairShow, type SeverityFilter } from "@/lib/senior-types";
import s from "./pages.module.css";

const r = P1C_COPY.review;
export const SHOW_LABEL: Record<PairShow, string> = {
  todo: r.showTodo, changed: r.showChanged, issue: ISSUE_REPORTED, reviewed: r.showReviewed, all: r.allPairs,
};

/** §5.17.1 show filters (GET links with tabular counts; the counts follow the scope). */
export function ShowLinks({ show, counts, href }: { show: PairShow; counts: Record<PairShow, number>; href: (v: PairShow) => string }) {
  return (
    <div className={s.filters} role="group" aria-label={DESK.showHeading}>
      {PAIR_SHOWS.map((k) => (
        <a key={k} className="filter" href={href(k)} aria-current={k === show ? "true" : undefined}>
          {SHOW_LABEL[k]}<span className="filter-n">{counts[k]}</span>
        </a>
      ))}
    </div>
  );
}

/** "All pairs" / "Applies to our brands" (PO D3) and the severity filter, as GET links. */
export function ScopeAndSeverity({ pairs, severity, scopeHref, severityHref }: {
  pairs: PairScope; severity: SeverityFilter | null; scopeHref: (v: PairScope) => string; severityHref: (v: SeverityFilter | null) => string;
}) {
  return (
    <>
      <p className={s.links}>
        <a href={scopeHref("all")} aria-current={pairs === "all" ? "true" : undefined}>{r.allPairs}</a>
        <a href={scopeHref("applies")} aria-current={pairs === "applies" ? "true" : undefined}>{r.applies}</a>
      </p>
      <p className={s.links}>
        <a href={severityHref(null)} aria-current={severity === null ? "true" : undefined}>{SHARED_WORDS.all}</a>
        {SEVERITY_FILTERS.map((v) => (
          <a key={v} href={severityHref(v)} aria-current={severity === v ? "true" : undefined}>{SEVERITY_LABEL[v]}</a>
        ))}
      </p>
    </>
  );
}
