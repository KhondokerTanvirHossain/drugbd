import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import Severity from "./Severity";
import styles from "./PairCard.module.css";

export type PairHeading = "h2" | "h3" | "h4" | "h5" | "h6";
type Text = { kind: "management" | "interaction"; body: string };

/**
 * §3.4 PairCard. DDInter text is passed through as given (truncated by CSS, never rewritten). The server renders it
 * unclamped; the Expander island clamps it once JavaScript runs and offers the toggle. With `sourceOpen`, the footer
 * reads `source` while clamped and `sourceOpen` while open (Board R's "…, truncated." / "…, in full."). *(P1C)* `details`
 * follows the meta line, `link` (the DDInter pair SourceLink) follows the source line, and `review` (PairReviewState) is last.
 */
export default function PairCard({ id, severity, names, meta, details, text, source, sourceOpen, link, review, surface, heading }: {
  id: string; severity: string; names: string; meta?: ReactNode; details?: ReactNode; text?: Text; source: ReactNode;
  sourceOpen?: ReactNode; link?: ReactNode; review?: ReactNode; surface: "reviewer" | "public"; heading?: PairHeading;
}) {
  const H = heading;
  return (
    <article className="pair">
      <div className="pair-head">
        <Severity level={severity} />
        {H ? <H className="pair-names">{names}</H> : <span className="pair-names">{names}</span>}
      </div>
      {meta && <p className="pair-meta">{meta}</p>}
      {details}
      <PairText id={id} text={text} source={source} sourceOpen={sourceOpen} link={link} surface={surface} />
      {review}
    </article>
  );
}

/** The text block and its footer, shared by PairCard and the senior pair row (§5.17.2 item 4). */
export function PairText({ id, text, source, sourceOpen, link, surface }: {
  id: string; text?: Text; source: ReactNode; sourceOpen?: ReactNode; link?: ReactNode; surface: "reviewer" | "public";
}) {
  const textId = `${id}-text`;
  return (
    <>
      {text && <p className={`pair-text ${styles.open}`} id={textId}>{text.body}</p>}
      <p className="pair-source">
        {text && sourceOpen !== undefined
          ? <><span className={styles.whenClosed}>{source}</span><span className={styles.whenOpen}>{sourceOpen}</span></>
          : source}
        {link && <> {link}</>}
        {text && <> <Expander targetId={textId} label={surface} /></>}
      </p>
    </>
  );
}
