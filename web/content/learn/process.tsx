import type { LearnContext } from "@/components/learn/context";
import { SwimlaneDiagram } from "@/components/learn/diagrams";
import styles from "@/components/learn/learn.module.css";
import { AsStored, Chapter, GateArrow, LivePill, ScrollHint, ScrollRegion, Section, SnapshotBlock, St } from "@/components/learn/parts";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import ExampleMarker from "@/components/ui/ExampleMarker";
import Kbd from "@/components/ui/Kbd";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import StageCheck from "@/components/ui/StageCheck";
import { LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { BATCH_STATUS_WORD, pillStatus } from "@/lib/stats";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S } from "./pilot-snapshot";

const H = 2;
const SZ_ARROW = (
  <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 6H96" className={styles.svgE} vectorEffect="non-scaling-stroke" /><path d="M92 2l6 4-6 4z" className={styles.svgAh} />
  </svg>
);
const allOf = (t: { ok: number }) => `${t.ok} of ${PILOT_IDS.length} records`;

/** Chapter 4 "The process" (Board L; §1.6 items 4, 11, 12 and 14). */
export default function ProcessChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin];
  const [warfPair] = S.warnings[P.warfarin].textMissing;
  const batch = ctx.batch;
  // /v1/stats lists removed records too (they carry exampleUsable: false) but leaves them out of itemCount and approved.
  const removed = batch ? batch.items.length - batch.itemCount : 0;
  return (
    <Chapter slug="process" level={1}>
      <Section id="process-flow" h={H}>
        <figure className={styles.fig}>
          <ScrollHint />
          <ScrollRegion label="Swimlane diagram of the review process, scrolls sideways">
            <SwimlaneDiagram notReviewed={NOT_REVIEWED} undoWindow={LEARN_BOARD.undoWindow} />
          </ScrollRegion>
          <figcaption className={styles.figcap}>Each lane is one party. Data moves left to right; the dashed line is the loop back when a record has an issue or is re-run.</figcaption>
        </figure>
      </Section>

      <Section id="process-batches" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>A batch is a list of DGDA concept ids committed to the repository, picked in order of how many brands share each generic. Batches grow only when the last ones came back clean, by the size rule in the approved plan.</p>
        <div className={styles.sz}>
          <div className={`${styles.szN} ${styles.isNow}`}><b>10</b><span>records</span></div>
          <div className={styles.szC}>{SZ_ARROW}<span>Two batches in a row with at most 1 issue each and no systemic bug</span></div>
          <div className={styles.szN}><b>50</b><span>records</span></div>
          <div className={styles.szC}>{SZ_ARROW}<span>The same test again</span></div>
          <div className={styles.szN}><b>100</b><span>records</span></div>
        </div>
        <div className={styles.szBack}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M15 4v5a3 3 0 0 1-3 3H3" className={styles.svgE} /><path d="M6.5 8.5 3 12l3.5 3.5" className={styles.svgE} /></svg>
          <p><b>Drop back to 10</b> when a batch has more than 5% issues or any systemic bug. Stay at 10 until the cause is fixed and covered by a test.</p>
        </div>
        {batch && <p className={styles.small}>We are at 10. Batch <span className="mono">{batch.batchId}</span> holds {batch.itemCount} records and its status is {BATCH_STATUS_WORD[batch.status]}.</p>}
      </Section>

      <Section id="process-stages" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The stages always run in this order, and each one commits on its own. One failing product never stops the others. Each stage reports OK, Warning or Failed for every record, with a note a reviewer can read.</p>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <div className={styles.stg}>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>1. DGDA load</span><span className="mono">dgda</span></p>
              <p className={styles.small}>Fetches the product from the DGDA register (an OCL concept) and loads it with DGDA's own ingredient mapping.</p>
              <dl>
                <dt>Reads</dt><dd>OCL concept, one per product</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="fail" /> "not found at source"</li><li><St status="fail" /> "not a registered Drug product"</li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="ok"><p className={styles.small}>{allOf(S.stages.dgda)}</p></StageCheck>
            </article>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>2. Substances</span><span className="mono">substances</span></p>
              <p className={styles.small}>Finds or creates one BDS substance per ICD-11 XM code, records its names and adds codes from NLM RxNav.</p>
              <dl>
                <dt>Reads</dt><dd>RxNav name lookup, then codes for the RxCUI</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="warn" /> "no RxCUI for …"</li><li><St status="fail" /> "no ICD-11 ingredient mapping"</li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="ok"><p className={styles.small}>{allOf(S.stages.substances)}</p></StageCheck>
            </article>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>3. Clinical drug</span><span className="mono">clinical</span></p>
              <p className={styles.small}>Parses the strength text, matches each strength to its substance, maps the dosage form to a route and links the product to a shared BDC clinical drug.</p>
              <dl>
                <dt>Reads</dt><dd>Nothing outside. Pure parsing.</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="warn" /> partial parse, unaligned ingredient, or a substance missing from the text</li><li><St status="fail" /> the text cannot be parsed</li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="ok"><p className={styles.small}>{allOf(S.stages.clinical)}</p></StageCheck>
            </article>
            <article className={styles.card}>
              <p className={styles.stgH}><span className={styles.h4}>4. DDInter</span><span className="mono">ddinter</span></p>
              <p className={styles.small}>Maps each substance to its DDInter entries by route, confirms the match by DrugBank id, stores pairs, disease and food records and their text, and records coverage.</p>
              <dl>
                <dt>Reads</dt><dd>DDInter 2.0 pages</dd>
                <dt>Can report</dt><dd><ul><li><St status="ok" /></li><li><St status="warn" /> name-only match, no DDInter data, or text not found</li><li><St status="fail" /></li></ul></dd>
              </dl>
              <StageCheck name="Pilot result" status="warn"><p className={`${styles.small} ${styles.fgText}`}>9 of 10 records warned. Eight list pairs with no DDInter text. Domperidone has no DDInter data. Chloramphenicol is OK.</p></StageCheck>
            </article>
          </div>
        </SnapshotBlock>
        <div className={styles.grid2}>
          {/* The card names Amlodipine-5's substance and DDInter entry, so it is keyed on that record too (G3, §6.8). */}
          <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.amlodipine]}>
            <StageCheck name={`DDInter, ${warf.tradeName}`} status="warn">
              <p className="stage-note">DDInter text not found for {warfPair.ddinterA}/{warfPair.ddinterB}</p>
              <ul className="stage-pairs"><li className="stage-pair">{warfPair.a} + {warfPair.b} <span className="mono">{warfPair.ddinterA}/{warfPair.ddinterB}</span><Severity level="unknown" /></li></ul>
            </StageCheck>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.domperidone]}>
            <StageCheck name={`DDInter, ${S.records[P.domperidone].tradeName}`} status="warn">
              <p className="stage-note">{NO_DATA_SENTENCE}</p>
              <p className={`${styles.small} ${styles.fgText}`}>Shown to reviewers and visitors as the full no-data statement in chapter 6.</p>
            </StageCheck>
          </SnapshotBlock>
        </div>
      </Section>

      <Section id="process-evidence" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Every source response is stored as it arrived, so any code or interaction can be traced to the exact response that produced it, and re-parsing never needs a new fetch. Batch pages show this evidence to signed-in reviewers only, because it includes extracted data no pharmacist has checked yet.</p>
        <ScrollRegion label="Evidence tables, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblMin}`}>
            <caption>What the pilot run kept</caption>
            <thead><tr><th scope="col">Kept in</th><th scope="col">What it holds</th><th scope="col">Pilot rows</th></tr></thead>
            <tbody>
              <tr><th scope="row" className="mono">raw.ocl_concept</th><td>The DGDA record exactly as the OCL server returned it</td><td className="num">{S.evidence.oclConcept}<AsStored /></td></tr>
              <tr><th scope="row" className="mono">raw.http_snapshot</th><td>Every RxNav and DDInter response, with security tokens removed. A stored good response is never overwritten by an error.</td><td>Not in the pilot export</td></tr>
              <tr><th scope="row" className="mono">ops.stage_result</th><td>One result per record per stage, with its note and JSON evidence</td><td className="num">{S.evidence.stageResult}<AsStored /></td></tr>
              <tr><th scope="row" className="mono">ops.batch_run</th><td>Each pipeline run, with OK, Warning and Failed counts per stage</td><td className="num">{S.evidence.batchRun}<AsStored /></td></tr>
              <tr><th scope="row" className="mono">ops.review_decision</th><td>Every "Looks correct" and every issue, with role and time. Rows are only ever added.</td><td className="num">{S.evidence.reviewDecision}<AsStored /></td></tr>
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      <Section id="process-gate" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Approval comes from the decision history. Each decision updates the record's review status, and a re-run resets it, so a decision made before the latest extraction never counts. A record is public only when a pharmacist said "Looks correct" after its latest extraction, and nobody reported an issue after that.</p>
        <div className={styles.gate} role="table" aria-label="Review status changes">
          <div className={`${styles.gateRow} ${styles.gateHead}`} role="row"><span role="columnheader">From</span><span role="columnheader">What happens</span><span role="columnheader">To</span><span role="columnheader">Public</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="pending" /></span><span className={styles.gateEv} role="cell"><GateArrow />An engineer presses <Kbd keys="A" /> and the {LEARN_BOARD.undoWindow} closes</span><span role="cell"><ReviewStatus status="engineer_checked" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="pending" /></span><span className={styles.gateEv} role="cell"><GateArrow />A pharmacist presses <Kbd keys="A" /> and the {LEARN_BOARD.undoWindow} closes</span><span role="cell"><ReviewStatus status="approved" /></span><span className={styles.gatePub} role="cell">Yes</span></div>
          <div className={styles.gateRow} role="row"><span role="cell">Any status</span><span className={styles.gateEv} role="cell"><GateArrow />A reviewer presses <Kbd keys="R" /> and sends a note</span><span role="cell"><ReviewStatus status="issue" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="approved" /></span><span className={styles.gateEv} role="cell"><GateArrow />The pipeline re-runs the record, or shared substance data it shows changes</span><span role="cell"><ReviewStatus status="back_in_review" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
          <div className={styles.gateRow} role="row"><span role="cell"><ReviewStatus status="issue" /></span><span className={styles.gateEv} role="cell"><GateArrow />The cause is fixed, covered by a test, and the record re-runs</span><span role="cell"><ReviewStatus status="pending" /></span><span className={`${styles.gatePub} ${styles.gatePubNo}`} role="cell">No</span></div>
        </div>
      </Section>

      <Section id="process-rerun" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Each record remembers when it was last extracted. Decisions made before that moment stay in the history but stop counting, so an old approval can never cover new data.</p>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin]} pills="inline">
          <ol className={styles.jr}>
            <li><p className={styles.jrH}><span className={styles.jrN}>1</span>Extracted</p><p className={styles.small}>{warf.tradeName} was extracted{S.warfarinExtractedAt ? ` ${fmtUtc(S.warfarinExtractedAt)}` : ""} in batch <span className="mono">{S.batchId}</span>.</p><LivePill ctx={ctx} id={P.warfarin} /></li>
            <li><p className={styles.jrH}><span className={styles.jrN}>2</span>Approved <ExampleMarker /></p><p className={styles.small}>A pharmacist presses <Kbd keys="A" />. When the undo window closes, the record is public.</p><ReviewStatus status="approved" /></li>
            <li><p className={styles.jrH}><span className={styles.jrN}>3</span>Re-run <ExampleMarker /></p><p className={styles.small}>An engineer re-runs the record. The approval stops counting and the record leaves public view.</p><ReviewStatus status="back_in_review" /></li>
          </ol>
        </SnapshotBlock>
        <Banner tone="warn" title={STALE_TITLE}
          body="A reviewer with the old page open sees this. Decisions pause until they reload, and a decision sent from the old page is refused."
          action={<span className={buttonClass("tonal", "sm")} aria-hidden="true">Reload</span>} />
      </Section>

      <Section id="process-done" h={H}>
        {/* Live only: with the pilot batch unreported there is no status to state (§6.8 Approval-state sentences). */}
        {batch && <>
          <ul className={styles.progList} aria-label={`Batch ${S.batchId} records`}>
            {batch.items.map((i) => <li key={i.conceptId}><b>{i.tradeName}</b><ReviewStatus status={pillStatus(i)} /></li>)}
          </ul>
          <p className={styles.small}><b className={styles.fgText}>{batch.approved} of {batch.itemCount} approved.</b>{removed > 0 ? ` ${removed} ${removed === 1 ? "record was" : "records were"} removed from the batch file.` : ""} Batch <span className="mono">{S.batchId}</span> is {BATCH_STATUS_WORD[batch.status]}.{batch.status === "approved" ? "" : ` It becomes approved when all ${batch.itemCount} records are approved by a pharmacist.`}</p>
        </>}
      </Section>
    </Chapter>
  );
}
