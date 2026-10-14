import type { CSSProperties } from "react";
import styles from "./ProgressMeter.module.css";

const pct = (n: number, total: number) => `${total > 0 ? Math.round((n / total) * 100) : 0}%`;
/** §3.4 ProgressMeter (.prog, role="img"). Widths are the only inline style: the --w custom property. */
export default function ProgressMeter({ approved, issue, total, wide = false, label }:
    { approved: number; issue: number; total: number; wide?: boolean; label?: string }) {
  return (
    <span className={wide ? "prog prog--wide" : "prog"} role="img"
      aria-label={label ?? `${approved} of ${total} approved by a pharmacist, ${issue} with an issue reported`}>
      <i className={`p-ok ${styles.bar}`} style={{ "--w": pct(approved, total) } as CSSProperties} />
      <i className={`p-issue ${styles.bar}`} style={{ "--w": pct(issue, total) } as CSSProperties} />
    </span>
  );
}
