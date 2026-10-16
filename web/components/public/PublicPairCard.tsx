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
 * Board P's public pair card (product page, substance page, checker). DDInter text is never rewritten: it is rendered in
 * full and the Expander clamps it once JavaScript runs (§4.2). The label line is FROM_DDINTER and the public review
 * state, plain text (§3.4 mark exclusivity, D53); every pair is shown with its text whatever that state says (G3).
 */
export default function PublicPairCard({ id, severity, names, meta, review, text, reviewFirst = false, extra, source, link, heading }: {
  id: string; severity: string; names: ReactNode; meta?: ReactNode; review: PublicPairReview; text: PairText; reviewFirst?: boolean;
  extra?: ReactNode; source: ReactNode; link?: Source | null; heading: "h3" | "h4";
}) {
  const H = heading;
  const textId = `${id}-text`;
  const label = (
    <div className={styles.label}>
      <span>{FROM_DDINTER}</span><span aria-hidden="true">·</span>
      <PairReviewState state={review.state} at={review.reviewedAt} mine={false} note={null} surface="public" />
    </div>
  );
  const long = text !== null && text.body.length > TRUNCATE_AT;
  const [truncated, full] = text?.kind === "management"
    ? [CHECK.managementTruncated, CHECK.managementFull]
    : [CHECK.interactionTruncated, CHECK.interactionFull];
  // The text is server-rendered open (no JS: unclamped), so a long card carries both wordings; PairCard.module.css shows
  // "truncated" only while the Expander has clamped it.
  const kindLabel = long ? <><span className={pc.whenClosed}>{truncated}</span><span className={pc.whenOpen}>{full}</span></> : full;
  return (
    <article className="pair">
      <div className="pair-head"><Severity level={severity} /><H className="pair-names">{names}</H></div>
      {reviewFirst && label}
      {meta && <p className="pair-meta">{meta}</p>}
      {!reviewFirst && label}
      {text === null && <p className="pair-source">{severityOf(severity) === "unknown" ? UNKNOWN_PAIR_LINE : CHECK.noText}</p>}
      {text?.kind === "interaction" && <p className="pair-source">{NO_MANAGEMENT}</p>}
      {text && <p className={`pair-text ${pc.open}`} id={textId}>{text.body}</p>}
      {text && <p className="pair-source">{kindLabel}{long && <> <Expander targetId={textId} label="public" /></>}</p>}
      {extra}
      <p className="pair-source">{source}{link && <> <SourceLink url={link.url} label={link.label} fetchedAt={link.fetchedAt} /></>}</p>
    </article>
  );
}
