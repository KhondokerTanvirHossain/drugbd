import type { ReactNode } from "react";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import NoDataChip from "./NoDataChip";
import styles from "./NoDataBlock.module.css";

/** §3.4 NoDataBlock: always expanded, never green, never inside <details>. The sentence is built in. */
export default function NoDataBlock({ title, bdsId, pairs, extra }:
    { title: ReactNode; bdsId?: string; pairs?: string[]; extra?: ReactNode }) {
  return (
    <div className="nodata-block hatch" role="note">
      <span className="nodata-glyph" aria-hidden="true" />
      <div className="nodata-plate">
        <p className="nodata-title">{title}{bdsId && <> <span className={`mono ${styles.id}`}>{bdsId}</span></>}</p>
        <p className="nodata-text">{NO_DATA_SENTENCE}</p>
        {pairs && pairs.length > 0 && (
          <p className="nodata-pairs">Not checked: {pairs.map((p) => <NoDataChip key={p} label={p} />)}</p>
        )}
        {extra}
      </div>
    </div>
  );
}
