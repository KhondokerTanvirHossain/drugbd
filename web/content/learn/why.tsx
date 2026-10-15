import type { ReactNode } from "react";
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, SnapshotBlock } from "@/components/learn/parts";
import CodeChip from "@/components/ui/CodeChip";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import { formatCount } from "@/lib/stats";
import { CHAPTERS } from "./chapters";
import { P, PILOT_SNAPSHOT as S, substanceNamed } from "./pilot-snapshot";

const SECTIONS = CHAPTERS.find((c) => c.slug === "why")!.sections;

/** One rule: its heading (an h2, §6.8: Board L's h4 moves up to the level under the chapter's h1), text and pilot evidence. */
function Rule({ id, children }: { id: string; children: ReactNode }) {
  return <li id={id}><h2>{SECTIONS.find((x) => x.id === id)!.title}</h2>{children}</li>;
}

/** Chapter 5 "Why it works this way" (Board L). */
export default function WhyChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin], amox = S.records[P.amoxiclav];
  const warfS = substanceNamed("Warfarin"), amoxS = substanceNamed("Amoxicillin"), clavS = substanceNamed("Clavulanic acid");
  const dompS = substanceNamed("Domperidone");
  // §6.8 Approval-state sentences: the pilot's count and approval come from /v1/stats, never from a fallback.
  const batch = ctx.batch;
  return (
    <Chapter slug="why" level={1}>
      <ul className={styles.why}>
        <Rule id="why-dgda">
          <p>The DGDA register is the official list of what may be sold in Bangladesh: {formatCount(ctx.stats.registerProducts)} products, each with a DAR number, mapped by the regulator to ICD-11 substance codes. The catalogue we had before was scraped, could not be shared with partners, and left many brands with no generic linked.</p>
          <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
            <p className={styles.ev}>Pilot: {warf.tradeName}'s ingredient comes from DGDA's own mapping, <CodeChip system="ICD11_XM" code={warfS.codes.icd11} /></p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-substance">
          <p>Interactions happen between active ingredients, not brand names. Attaching them to the substance means one DDInter record covers every brand that contains it, and a combination product is checked ingredient by ingredient.</p>
          <SnapshotBlock ctx={ctx} ids={[P.amoxiclav]}>
            <p className={styles.ev}>Pilot: {amox.tradeName} is checked as {amoxS.name} <span className="mono">{amoxS.bdsId}</span> plus {clavS.name} <span className="mono">{clavS.bdsId}</span>.</p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-batches">
          <p>Extraction mistakes are cheap to fix when ten records are on the table and expensive after thousands. Automated extraction can make mistakes that look plausible, so a person compares the source with every extracted field.</p>
          {batch && <p className={styles.ev}>Pilot: {batch.itemCount} records, each with the raw DGDA row beside what we extracted.</p>}
        </Rule>
        <Rule id="why-nodata">
          {/* G3 (§1.2, §6.8 Withdrawn examples): Domperidone's coverage is its record's value, so it shows only while that example is usable. */}
          <p>{ctx.usable(P.domperidone) && "Domperidone has no DDInter 2.0 entry (coverage: none). "}A missing entry says nothing about whether a combination is safe, so we say exactly that: {NO_DATA_SENTENCE} Its pairs are marked "not checked".</p>
          <SnapshotBlock ctx={ctx} ids={[P.domperidone]}>
            <p className={styles.ev}>Pilot: <NoDataChip label="No interaction data" /> {dompS.name}</p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-unclassified">
          <p>DDInter lists many pairs without a grade. Folding them into Minor would make hundreds of ungraded pairs look mild. They keep their own chip and their own count.</p>
          <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
            <p className={styles.ev}>Pilot: {warfS.name} has <Severity level="minor" count={warfS.drugDrug.minor} /><Severity level="unknown" count={warfS.drugDrug.unknown} /></p>
          </SnapshotBlock>
        </Rule>
        <Rule id="why-pharmacist">
          <p>Saying a brand contains a substance, and that the substance carries these interactions, is a clinical claim. Engineers check the extraction and their check is recorded, but only a pharmacist's approval reaches the public site and the API.</p>
          {batch && (batch.approved === 0
            ? <p className={styles.ev}>Pilot: <ReviewStatus status="pending" /> on all {batch.itemCount} records, so none is public.</p>
            : <p className={styles.ev}>Pilot: <ReviewStatus status="approved" /> on {batch.approved} of {batch.itemCount} records.</p>)}
        </Rule>
      </ul>
    </Chapter>
  );
}
