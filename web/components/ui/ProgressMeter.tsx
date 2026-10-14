import type { CSSProperties } from "react";
import styles from "./ProgressMeter.module.css";

const pct = (n: number, total: number) => `${total > 0 ? Math.round((n / total) * 100) : 0}%`;
/** §3.4 ProgressMeter (.prog, role="img"). Widths are the only inline style: the --w custom property. */
export default function ProgressMeter({ approved, issue, total }: { approved: number; issue: number; total: number }) {
  return (
    <span className="prog" role="img"
      aria-label={`${approved} of ${total} approved by a pharmacist, ${issue} with an issue reported`}>
      <i className={`p-ok ${styles.bar}`} style={{ "--w": pct(approved, total) } as CSSProperties} />
      <i className={`p-issue ${styles.bar}`} style={{ "--w": pct(issue, total) } as CSSProperties} />
    </span>
  );
}
