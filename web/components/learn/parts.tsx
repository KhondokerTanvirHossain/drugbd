import type { ReactNode } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { CHAPTERS, sectionTitle, type ChapterSlug } from "@/content/learn/chapters";
import { PILOT_IDS, PILOT_SNAPSHOT, type PilotId } from "@/content/learn/pilot-snapshot";
import { LEARN_NEW, fill } from "@/lib/copy";
import { batchPill, pillStatus } from "@/lib/stats";
import type { LearnContext } from "./context";
import styles from "./learn.module.css";

/**
 * Pieces every Learn chapter shares (§6.8). Server components only. `SnapshotBlock` is the one place that decides
 * whether a frozen pilot example may show.
 */

/** One chapter: `<section>` with its numbered title (h2 on /learn/start under the hero's h1, h1 elsewhere) and lede. */
export function Chapter({ slug, level, children }: { slug: ChapterSlug; level: 1 | 2; children: ReactNode }) {
  const c = CHAPTERS.find((x) => x.slug === slug)!;
  const H = level === 1 ? "h1" : "h2";
  return (
    <section className={styles.ch} id={slug} aria-labelledby={`h-${slug}`}>
      <div className={styles.chHead}>
        <H id={`h-${slug}`}><span className={styles.chN}>{c.n}</span>{" "}{c.title}</H>
        <p className={styles.chLede}>{c.lede}</p>
      </div>
      {children}
    </section>
  );
}

/** One section with its registry title: h3 on /learn/start, h2 elsewhere (§6.8 "Headings"). */
export function Section({ id, h, children }: { id: string; h: 2 | 3; children: ReactNode }) {
  const H = h === 2 ? "h2" : "h3";
  return <div className={styles.sub} id={id}><H>{sectionTitle(id)}</H>{children}</div>;
}

/** §10.4: a wide table or diagram in its own labelled, keyboard-scrollable region. */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.scroll} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

export function ScrollHint() {
  return <p className={styles.scrollHint}>Scroll sideways to see the whole diagram.</p>;
}

const ST = { ok: [styles.stOk, "OK"], warn: [styles.stWarn, "Warning"], fail: [styles.stFail, "Failed"] } as const;
/** A stage status word with its icon (Board L `.st`). */
export function St({ status }: { status: keyof typeof ST }) {
  return <span className={`${styles.st} ${ST[status][0]}`}><span className="ico" aria-hidden="true" />{ST[status][1]}</span>;
}

/** Coverage `full`: neutral text, never green (Board L `.neutral-tag`). */
export function NeutralTag() {
  return <span className={styles.neutralTag}><span className="ico" aria-hidden="true" />Interaction data found</span>;
}

/** The numbered marker of the annotated record (Board L `.ann`). */
export function Ann({ n }: { n: number }) {
  return <span className={styles.ann}>{n}</span>;
}

/** The down arrow between flow nodes (Board L edge cases). */
export function DownArrow() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
      <path d="M6 1v12M1.5 9 6 13.5 10.5 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The right arrow in the review gate table. */
export function GateArrow() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      <path d="M1 6h13M10 1.5 14.5 6 10 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A pilot record's live pill (§6.8 "Status pills are live"): from /v1/stats, never from the snapshot. */
export function LivePill({ ctx, id }: { ctx: LearnContext; id: PilotId }) {
  return <ReviewStatus status={pillStatus(ctx.item(id))} />;
}

/** The pilot batch's live pill and "All {n} pilot records, batch {id}." (Board L nav note). */
export function BatchNote({ ctx }: { ctx: LearnContext }) {
  return (
    <>
      <ReviewStatus status={batchPill(ctx.batch)} />
      <span>All {ctx.batch?.itemCount ?? 0} pilot records, batch <span className="mono">{PILOT_SNAPSHOT.batchId}</span>.</span>
    </>
  );
}

/** ", as stored on {date}" after a snapshot-only value (§6.8, §1.7). */
export function AsStored() {
  return <span className={styles.small}>, {fill(LEARN_NEW.asStored, { date: PILOT_SNAPSHOT.storedOn })}</span>;
}

/**
 * A frozen pilot example (§6.8), keyed by the records it draws on. It shows only while /v1/stats reports every one of
 * them as usable; otherwise each record is shown as the §6.4 stub (trade name and its pill), with no clinical value.
 * `pills="row"` (the default) prints the records' live pills above the example (the whole batch's pill for a block
 * that draws on all ten); `pills="inline"` when the example prints each record's LivePill itself.
 */
export function SnapshotBlock({ ctx, ids, pills = "row", className, children }: {
  ctx: LearnContext; ids: readonly PilotId[]; pills?: "row" | "inline"; className?: string; children: ReactNode;
}) {
  const cls = className ? `${styles.snap} ${className}` : styles.snap;
  if (!ids.every((id) => ctx.usable(id))) {
    return (
      <div className={cls} data-withdrawn="">
        <ul className={styles.withdrawn}>
          {ids.map((id) => <li key={id}><b>{ctx.tradeName(id)}</b><LivePill ctx={ctx} id={id} /></li>)}
        </ul>
      </div>
    );
  }
  const all = PILOT_IDS.every((id) => ids.includes(id));
  return (
    <div className={cls} data-snapshot={ids.join(" ")}>
      {pills === "row" && (all
        ? <p className={styles.snapPills}><BatchNote ctx={ctx} /></p>
        : <p className={styles.snapPills}>{ids.map((id) => <span key={id} className={styles.row}><b>{ctx.tradeName(id)}</b><LivePill ctx={ctx} id={id} /></span>)}</p>)}
      {children}
    </div>
  );
}
