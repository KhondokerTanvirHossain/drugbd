import { DESK_NEW, fill } from "@/lib/copy";
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, historyText } from "@/lib/review-copy";
import type { ReviewItem } from "@/lib/review-types";
import s from "./detail.module.css";

/** §5.6.5 "History", oldest first. Roles only; "(you)" from the API's `mine`. Notes are shown in .raw, never logged. */
export default function History({ item }: { item: ReviewItem }) {
  return (
    <section className={s.sec} aria-labelledby="sec-hist">
      <div className={s.secT}><h2 id="sec-hist">{DESK.historyTitle}</h2><span>{DESK.historySub}</span></div>
      <ol className={s.hist}>
        {item.history.map((e, i) => (
          <li key={i}>
            <span className={s.histT}>{fmtUtc(e.at)}<span>{fmtDhaka(e.at)}</span></span>
            <span>{historyText(e, item.batchId)}{e.kind === "extract" && e.carriedFrom ? (
              <span className={s.histSub}>{fill(DESK_NEW.history.carriedOver, { batchId: e.carriedFrom })}</span>
            ) : null}{e.kind === "decision" && e.note ? <> <span className="raw">{e.note}</span></> : null}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
