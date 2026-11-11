import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import { ddinterText } from "@/lib/ddinter-text";
import { DESK } from "@/lib/review-copy";
import Severity from "./Severity";
import styles from "./PairCard.module.css";

export type PairHeading = "h2" | "h3" | "h4" | "h5" | "h6";
type Text = { kind: "management" | "interaction"; body: string };

/**
 * §3.4 PairCard. DDInter text is passed through as given (truncated by CSS, never rewritten). The server renders it
 * unclamped; the Expander island clamps it once JavaScript runs and offers the toggle. With `sourceOpen`, the footer
 * reads `source` while clamped and `sourceOpen` while open (Board R's "…, truncated." / "…, in full."). *(P1C)* `details`
 * follows the meta line, `link` (the DDInter pair SourceLink) follows the source line, and `review` (PairReviewState) is last.
 * *(D78)* With `texts`, the card shows both DDInter texts in full (PairTexts) in place of `text`/`source`: reviewers only.
 */
export default function PairCard({ id, severity, names, meta, details, text, texts, source, sourceOpen, link, review, surface, heading }: {
  id: string; severity: string; names: string; meta?: ReactNode; details?: ReactNode; text?: Text; source?: ReactNode;
  texts?: { interaction: string | null; management: string | null };
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
      {texts ? <PairTexts id={id} interaction={texts.interaction} management={texts.management} link={link} />
        : <PairText id={id} text={text} source={source} sourceOpen={sourceOpen} link={link} surface={surface} />}
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

/**
 * *(D78)* A reviewer checks both DDInter texts: the interaction description and the management text, each labelled and
 * in full (never clamped), in that order. A missing one says so; neither is ever replaced by the other. DDInter
 * placeholders ("None", "-") count as missing (§3.6). Then the source line and the DDInter pair link.
 */
export function PairTexts({ id, interaction, management, link }: {
  id: string; interaction: string | null; management: string | null; link?: ReactNode;
}) {
  const i = ddinterText(interaction), m = ddinterText(management);
  return (
    <>
      <dl className={styles.texts} id={`${id}-text`}>
        <div><dt>{DESK.textInteraction}</dt><dd className={i === null ? styles.none : undefined}>{i ?? DESK.noInteractionText}</dd></div>
        <div><dt>{DESK.textManagement}</dt><dd className={m === null ? styles.none : undefined}>{m ?? DESK.noManagementText}</dd></div>
      </dl>
      <p className="pair-source">{DESK.textsSource}{link && <> {link}</>}</p>
    </>
  );
}
