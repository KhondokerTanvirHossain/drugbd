import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import Severity from "./Severity";
import styles from "./PairCard.module.css";

/**
 * §3.4 PairCard. DDInter text is passed through as given (truncated by CSS, never rewritten). The server renders it
 * unclamped; the Expander island clamps it once JavaScript runs and offers the toggle.
 */
export default function PairCard({ id, severity, names, meta, text, source, surface }: {
  id: string; severity: string; names: string; meta?: string;
  text?: { kind: "management" | "interaction"; body: string }; source: ReactNode; surface: "reviewer" | "public";
}) {
  const textId = `${id}-text`;
  return (
    <article className="pair">
      <div className="pair-head"><Severity level={severity} /><span className="pair-names">{names}</span></div>
      {meta && <p className="pair-meta">{meta}</p>}
      {text && <p className={`pair-text ${styles.open}`} id={textId}>{text.body}</p>}
      <p className="pair-source">{source}{text && <> <Expander targetId={textId} label={surface} /></>}</p>
    </article>
  );
}
