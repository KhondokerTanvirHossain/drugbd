import { fmtUtc } from "@/lib/format";
import { DESK } from "@/lib/review-copy";
import type { DiffRow } from "@/lib/review-types";
import s from "../detail/detail.module.css";

const cell = (row: DiffRow, v: string | null) => (v === null ? "" : row.field === "Pipeline extracted at" ? fmtUtc(v) : v);

/** §5.11 diff table: "You were reviewing" against "Now", changed cells only. Used by the server and the desk. */
export default function DiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <>
      <div className="cmp-wrap">
        <table className="cmp">
          <caption>{DESK.diffCaption}</caption>
          <thead><tr><th scope="col">{DESK.cmpField}</th><th scope="col" className="cmp-src">{DESK.diffBefore}</th><th scope="col">{DESK.diffNow}</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}><th scope="row">{row.field}</th><td className="cmp-src">{cell(row, row.before)}</td><td className={s.chg}>{cell(row, row.now)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.diffFoot}>{DESK.diffFooter}</p>
    </>
  );
}
