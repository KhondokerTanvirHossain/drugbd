import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import PairReviewState from "@/components/ui/PairReviewState";
import Severity from "@/components/ui/Severity";
import SourceLink from "@/components/ui/SourceLink";
import pc from "@/components/ui/PairCard.module.css";
import { FROM_DDINTER, NO_MANAGEMENT, UNKNOWN_PAIR_LINE } from "@/lib/copy";
import type { PublicPairReview, Source } from "@/lib/public-types";
import { CHECK } from "@/lib/public-copy";
import { ddinterText } from "@/lib/ddinter-text";
import { severityOf } from "@/lib/severity";
import styles from "./pair.module.css";

export const TRUNCATE_AT = 200;
export type PairText = { kind: "management" | "interaction"; body: string } | null;

/** Management first, otherwise the interaction description (§5.6.2, §6.7.3). DDInter placeholders count as no text (§3.6). */
export function pairText(p: { management: string | null; interaction: string | null }): PairText {
  const m = ddinterText(p.management), i = ddinterText(p.interaction);
  if (m) return { kind: "management", body: m };
  if (i) return { kind: "interaction", body: i };
  return null;
}

/**
 * One DDInter text and its kind label line: "{kind}, full text from DDInter 2.0.", or, over TRUNCATE_AT, both wordings
 * plus the Expander. The text is server-rendered open (no JS: unclamped), so a long text carries both wordings and
 * PairCard.module.css shows "truncated" only while the Expander has clamped it. `labelId` (the checker's two-text card,
 * §6.7.3) wraps the kind label in an element the Expander is described by.
 */
function TextParts({ kind, body, textId, labelId }: { kind: "management" | "interaction"; body: string; textId: string; labelId?: string }) {
  const long = body.length > TRUNCATE_AT;
  const [truncated, full] = kind === "management"
    ? [CHECK.managementTruncated, CHECK.managementFull]
    : [CHECK.interactionTruncated, CHECK.interactionFull];
  const kindLabel = long ? <><span className={pc.whenClosed}>{truncated}</span><span className={pc.whenOpen}>{full}</span></> : full;
  return (
    <>
      <p className={`pair-text ${pc.open}`} id={textId}>{body}</p>
      <p className="pair-source">{labelId ? <span id={labelId}>{kindLabel}</span> : kindLabel}
        {long && <> <Expander targetId={textId} label="public" describedBy={labelId} /></>}</p>
    </>
  );
}

/**
 * Board P's public pair card (product page, substance page, checker). DDInter text is never rewritten: it is rendered in
 * full and the Expander clamps it once JavaScript runs (§4.2). The label line is FROM_DDINTER and the public review
 * state, plain text (§3.4 mark exclusivity, D53); every pair is shown with its text whatever that state says (G3).
 *
 * `description` (QA, D64) is the checker's opt-in: DDInter's interaction text, shown after the management text in its
 * own block (§6.7.3). It applies only when the card shows management text and the description is not a DDInter
 * placeholder (§3.6); otherwise the card is exactly the one without it. Each text and its label line are wrapped, so the
 * PairCard.module.css sibling rules swap only their own label's wording.
 */
export default function PublicPairCard({ id, severity, names, meta, review, text, description, reviewFirst = false, extra, source, link, heading }: {
  id: string; severity: string; names: ReactNode; meta?: ReactNode; review: PublicPairReview; text: PairText; description?: string | null;
  reviewFirst?: boolean; extra?: ReactNode; source: ReactNode; link?: Source | null; heading: "h3" | "h4";
}) {
  const H = heading;
  const textId = `${id}-text`;
  const label = (
    <div className={styles.label}>
      <span>{FROM_DDINTER}</span><span aria-hidden="true">·</span>
      <PairReviewState state={review.state} at={review.reviewedAt} mine={false} note={null} surface="public" />
    </div>
  );
  const desc = text?.kind === "management" ? ddinterText(description) : null;
  return (
    <article className="pair">
      <div className="pair-head"><Severity level={severity} /><H className="pair-names">{names}</H></div>
      {reviewFirst && label}
      {meta && <p className="pair-meta">{meta}</p>}
      {!reviewFirst && label}
      {text === null && <p className="pair-source">{severityOf(severity) === "unknown" ? UNKNOWN_PAIR_LINE : CHECK.noText}</p>}
      {text?.kind === "interaction" && <p className="pair-source">{NO_MANAGEMENT}</p>}
      {text && desc === null && <TextParts kind={text.kind} body={text.body} textId={textId} />}
      {text && desc !== null && (
        <>
          <div className={styles.textBlock}><TextParts kind={text.kind} body={text.body} textId={textId} labelId={`${textId}-kind`} /></div>
          <div className={styles.textBlock}><TextParts kind="interaction" body={desc} textId={`${id}-desc`} labelId={`${id}-desc-kind`} /></div>
        </>
      )}
      {extra}
      <p className="pair-source">{source}{link && <> <SourceLink url={link.url} label={link.label} fetchedAt={link.fetchedAt} /></>}</p>
    </article>
  );
}
