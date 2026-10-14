import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import Severity from "./Severity";
import styles from "./PairCard.module.css";

/**
 * §3.4 PairCard. DDInter text is passed through as given (truncated by CSS, never rewritten). The server renders it
 * unclamped; the Expander island clamps it once JavaScript runs and offers the toggle. With `sourceOpen`, the footer
 * reads `source` while clamped and `sourceOpen` while open (Board R's "…, truncated." / "…, in full.").
 */
export default function PairCard({ id, severity, names, meta, text, source, sourceOpen, surface, heading }: {
  id: string; severity: string; names: string; meta?: ReactNode;
  text?: { kind: "management" | "interaction"; body: string }; source: ReactNode; sourceOpen?: ReactNode;
  surface: "reviewer" | "public"; heading?: "h4";
}) {
  const textId = `${id}-text`;
  return (
    <article className="pair">
      <div className="pair-head">
        <Severity level={severity} />
        {heading === "h4" ? <h4 className="pair-names">{names}</h4> : <span className="pair-names">{names}</span>}
      </div>
      {meta && <p className="pair-meta">{meta}</p>}
      {text && <p className={`pair-text ${styles.open}`} id={textId}>{text.body}</p>}
      <p className="pair-source">
        {text && sourceOpen !== undefined
          ? <><span className={styles.whenClosed}>{source}</span><span className={styles.whenOpen}>{sourceOpen}</span></>
          : source}
        {text && <> <Expander targetId={textId} label={surface} /></>}
      </p>
    </article>
  );
}
