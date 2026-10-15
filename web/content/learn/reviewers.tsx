import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import BotCheck from "@/components/ui/BotCheck";
import { buttonClass } from "@/components/ui/Button";
import ExampleMarker from "@/components/ui/ExampleMarker";
import Kbd from "@/components/ui/Kbd";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataChip from "@/components/ui/NoDataChip";
import Severity from "@/components/ui/Severity";
import StageCheck from "@/components/ui/StageCheck";
import { LEARN_BOARD, NO_DATA_SENTENCE, PROMISE_ENGINEER, PROMISE_PHARMACIST } from "@/lib/copy";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S, type PilotId, substanceNamed } from "./pilot-snapshot";

const H = 2;
const pairs = (n: number) => `${n} ${n === 1 ? "pair" : "pairs"}`;
/** Pictures of the desk keep the default 8 seconds (§1.6 item 14). */
const DESK_DEFAULT_SECONDS = 8;

/**
 * A warning card's records: its own, then every pilot record whose substance carries an entry of one of its pairs,
 * in PILOT_IDS order. The card prints those partners' names and DDInter entries, so it is withdrawn with them (G3, §6.8).
 */
function cardIds(id: PilotId): PilotId[] {
  const entries = new Set(S.warnings[id].textMissing.flatMap((t) => [t.ddinterA, t.ddinterB]));
  const partners = new Set(S.substances.filter((s) => s.entries.some((e) => entries.has(e.id))).map((s) => s.product));
  return [id, ...PILOT_IDS.filter((p) => p !== id && partners.has(p))];
}

/** Chapter 7 "For reviewers" (Board L; §1.6 items 6, 7, 12 and 14). */
export default function ReviewersChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin];
  const warfS = substanceNamed("Warfarin");
  return (
    <Chapter slug="reviewers" level={1}>
      <Section id="rev-checklist" h={H}>
        <ScrollRegion label="Review checklist, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblWide}`}>
            <caption>What to compare for every record</caption>
            <thead><tr><th scope="col">Field</th><th scope="col">Compare</th><th scope="col">Looks correct when</th><th scope="col">Report an issue when</th></tr></thead>
            <tbody>
              <tr><th scope="row">Trade name, company, DAR</th><td>The DGDA row with the record header</td><td>The text is identical</td><td>Any character differs</td></tr>
              <tr><th scope="row">Dosage form and route</th><td>DGDA's dosage form with the clinical drug's form and route</td><td>Tablet stays Tablet; Eye Drops gives ophthalmic</td><td>The route does not follow from the form</td></tr>
              <tr><th scope="row">Ingredients</th><td>DGDA's content text with the substances</td><td>Every named ingredient appears once, with salts removed</td><td>An ingredient is missing, extra, or appears twice</td></tr>
              <tr><th scope="row">Strength</th><td>Numbers, units and "per" amounts</td><td><span className="raw">5 mg/ml</span> gives 5 mg per 1 ml</td><td>A number, unit or per amount differs</td></tr>
              <tr><th scope="row">ICD-11 code</th><td>DGDA's XM code with the substance's ICD-11 code</td><td>The same code, such as <span className="mono">XM86W0</span></td><td>The codes differ</td></tr>
              <tr><th scope="row">Crosswalk codes</th><td>RxCUI, ATC, DrugBank and SNOMED CT, with method and confidence</td><td>An exact match at 1.00</td><td>A code belongs to another substance</td></tr>
              <tr><th scope="row">DDInter entry</th><td>The DDInter name and route with the substance and the product's route</td><td><span className="mono">DDInter14</span> Acetaminophen, systemic</td><td>Wrong drug, or the wrong route entry</td></tr>
              <tr><th scope="row">Stage warnings</th><td>Every note in the stage cards</td><td>You understand each warning and it is expected</td><td>A warning points to a real problem</td></tr>
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      <Section id="rev-labels" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
          <div className="cmp-wrap" tabIndex={0} role="region" aria-label={`${warf.tradeName} comparison table, scrolls sideways`}>
            <table className="cmp">
              <caption>{warf.tradeName}, DGDA source beside the extraction</caption>
              <thead><tr><th scope="col">Field</th><th scope="col">DGDA source</th><th scope="col">Relation</th><th scope="col">Extracted</th></tr></thead>
              <tbody>
                <tr><th scope="row">Trade name</th><td className="cmp-src">{warf.tradeName}</td><td><MatchRelation kind="same" /></td><td>{warf.tradeName}</td></tr>
                <tr><th scope="row">DAR number</th><td className="cmp-src"><span className="mono">{warf.darNumber}</span></td><td><MatchRelation kind="same" /></td><td><span className="mono">{warf.darNumber}</span></td></tr>
                <tr><th scope="row">Dosage form</th><td className="cmp-src">{warf.dosageForm}</td><td><MatchRelation kind="same" /></td><td>{warf.dosageForm}</td></tr>
                <tr><th scope="row">Route</th><td className="cmp-src">Not stated<span className="cmp-sub">The register has no route field</span></td><td><MatchRelation kind="added" /></td><td>{warf.route}<span className="cmp-sub">From the dosage form</span></td></tr>
                <tr><th scope="row">Ingredient</th><td className="cmp-src"><span className="raw">{warf.genericContentRaw}</span></td><td><MatchRelation kind="salt" /></td><td>{warfS.name} <span className="mono">{warfS.bdsId}</span>, 5 mg</td></tr>
                <tr><th scope="row">ICD-11 code</th><td className="cmp-src"><span className="mono">{warfS.codes.icd11}</span> {warfS.name}</td><td><MatchRelation kind="same" /></td><td><span className="mono">{warfS.codes.icd11}</span></td></tr>
              </tbody>
            </table>
          </div>
        </SnapshotBlock>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.napa, P.chloramphenicol]}>
          <ul className={styles.sevLegend}>
            <li><span><MatchRelation kind="same" /></span><p>The same value on both sides. G Warfarin's dosage form, Tablet.</p><span /></li>
            <li><span><MatchRelation kind="norm" /></span><p>The same substance under a different name. Napa's Paracetamol is Acetaminophen.</p><span /></li>
            <li><span><MatchRelation kind="salt" /></span><p>The salt is dropped to reach the substance. Warfarin Sodium becomes Warfarin.</p><span /></li>
            <li><span><MatchRelation kind="added" /></span><p>A value we derived that the source does not state. Ophthalmic for Chloramphenicol eye drops.</p><span /></li>
            <li><span><MatchRelation kind="differs" /></span><p>The two sides disagree. Decide which is right, and report an issue if the extraction is wrong. No pilot record has one.</p><span /></li>
          </ul>
        </SnapshotBlock>
      </Section>

      <Section id="rev-warnings" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The DDInter stage names every pair whose text it could not find. Expect these on the review desk. Each one is a pair DDInter lists without a grade or text.</p>
        <div className={styles.stg}>
          {PILOT_IDS.map((id) => {
            const w = S.warnings[id];
            return (
              <SnapshotBlock key={id} ctx={ctx} ids={cardIds(id)}>
                <StageCheck name={S.records[id].tradeName} status={w.status}>
                  {w.noData && <>
                    <p className="stage-note">{NO_DATA_SENTENCE}</p>
                    <p className="stage-pair"><NoDataChip label="No interaction data" />Its pairs are not checked.</p>
                  </>}
                  {w.textMissing.length > 0 && <>
                    <p className="stage-note">DDInter text not found for {pairs(w.textMissing.length)}:</p>
                    <ul className="stage-pairs">
                      {w.textMissing.map((t) => (
                        <li key={`${t.ddinterA}/${t.ddinterB}`} className="stage-pair">{t.a} + {t.b} <span className="mono">{t.ddinterA}/{t.ddinterB}</span><Severity level="unknown" /></li>
                      ))}
                    </ul>
                  </>}
                </StageCheck>
              </SnapshotBlock>
            );
          })}
        </div>
      </Section>

      <Section id="rev-issue" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>An engineer reads your note and fixes the cause. Name the field, quote both values, and say what you expected. One problem per note, 5 to 1000 characters.</p>
        <div className={styles.notes}>
          {/* G3 (§1.2, §6.8 Withdrawn examples): each specific note quotes its records' DDInter mappings, so it shows only while they are usable. */}
          {ctx.usable(P.chloramphenicol) && <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteGood}`}><span className="ico" aria-hidden="true" />Specific <ExampleMarker /></p>
            <p className={styles.quote}>Chloramphenicol eye drops: route is ophthalmic, and the interactions use DDInter352 (ophthalmic). The ophthalmic entry DDInter352 has no pair with the pilot drugs; it has 112 pairs in DDInter. Please confirm that DDInter351 (systemic) should not apply to this product.</p>
            <p className={styles.small}>Names the record, the field, both values and the question.</p>
          </div>}
          <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteVague}`}><span className="ico" aria-hidden="true" />Vague <ExampleMarker /></p>
            <p className={styles.quote}>Interactions look wrong.</p>
            <p className={styles.small}>Which pair? Wrong how? The engineer has to guess.</p>
          </div>
          {ctx.usable(P.warfarin) && ctx.usable(P.amlodipine) && <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteGood}`}><span className="ico" aria-hidden="true" />Specific <ExampleMarker /></p>
            <p className={styles.quote}>G Warfarin: Warfarin + Amlodipine (DDInter1951/DDInter79) has no grade and no text. Please confirm DDInter 2.0 shows none before I approve.</p>
            <p className={styles.small}>Quotes the stage note and asks for one check.</p>
          </div>}
          <div className={styles.noteCard}>
            <p className={`${styles.noteH} ${styles.noteVague}`}><span className="ico" aria-hidden="true" />Vague <ExampleMarker /></p>
            <p className={styles.quote}>Check this record.</p>
            <p className={styles.small}>No field and no reason. It will come back to you.</p>
          </div>
        </div>
      </Section>

      <Section id="rev-decide" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The decision bar stays pinned under the record and says what your decision does for your role. Approving uses the <Kbd keys="A" /> key or the "Looks correct" button. Enter never approves.</p>
        <div className={styles.mockDesk} role="img" aria-label="Decision bar for a pharmacist: Looks correct publishes this record after an 8-second undo window.">
          <div className={styles.peek} aria-hidden="true"><i className={styles.peek60} /><i className={styles.peek85} /><i className={styles.peek40} /></div>
          <div className="decision-bar">
            <div className="decision-main">
              <p className="decision-promise"><b>{PROMISE_PHARMACIST.lead}</b> {PROMISE_PHARMACIST.body(DESK_DEFAULT_SECONDS)}</p>
              <div className="decision-actions"><BotCheck state="passed" /><span className={buttonClass("tonal")}>Report issue <Kbd keys="R" /></span><span className={buttonClass("primary")}>Looks correct <Kbd keys="A" /></span></div>
            </div>
          </div>
        </div>
        <div className={styles.mockDesk} role="img" aria-label="Decision bar for an engineer: Looks correct records your check. It does not publish.">
          <div className="decision-bar">
            <div className="decision-main">
              <p className="decision-promise"><b>{PROMISE_ENGINEER.lead}</b> {PROMISE_ENGINEER.body}</p>
              <div className="decision-actions"><BotCheck state="passed" /><span className={buttonClass("tonal")}>Report issue <Kbd keys="R" /></span><span className={buttonClass("primary")}>Looks correct <Kbd keys="A" /></span></div>
            </div>
          </div>
        </div>
        <div className={styles.toastDemo}>
          <div className="toast" role="img" aria-label="Toast: G Warfarin marked correct. Publishes in 8 seconds. Undo, key U.">
            <p className="toast-msg"><b>G Warfarin</b> marked correct.<span className="toast-sub">Publishes in {DESK_DEFAULT_SECONDS} seconds.</span></p>
            <span className="toast-undo"><span className="ico" aria-hidden="true" />Undo <Kbd keys="U" /></span>
            <span className="toast-bar" aria-hidden="true"><i className={styles.toastAt60} /></span>
          </div>
          <p className={`${styles.small} ${styles.toastNote}`}>Shown here at 60% of the window. Press <Kbd keys="U" /> or Undo and nothing is saved or published. The toast never takes focus, and screen readers hear one announcement when it opens, not a countdown. Every decision passes a Cloudflare Turnstile bot check.</p>
        </div>
      </Section>

      <Section id="rev-keys" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Shortcuts work while focus is inside the review workspace. They stop while you type in a field, and Ctrl, Cmd and Alt combinations are left to the browser.</p>
        <ScrollRegion label="Keyboard shortcuts, scrolls sideways">
          <table className={`${styles.tbl} ${styles.tblMin}`}>
            <caption>Review workspace shortcuts</caption>
            <thead><tr><th scope="col">Key</th><th scope="col">Action</th><th scope="col">What it does</th></tr></thead>
            <tbody>
              <tr><th scope="row"><Kbd keys="A" /></th><td>Looks correct</td><td>Opens the {LEARN_BOARD.undoWindow}. Pharmacist: publishes when it closes. Engineer: records the check, does not publish.</td></tr>
              <tr><th scope="row"><Kbd keys="U" /></th><td>Undo</td><td>Cancels the open window. Nothing is saved or published.</td></tr>
              <tr><th scope="row"><Kbd keys="R" /></th><td>Report issue</td><td>Opens the note field and moves focus into it.</td></tr>
              <tr><th scope="row"><Kbd keys="J" /> <Kbd keys="K" /></th><td>Next, previous</td><td>Moves the selection in the record list. Arrow keys do the same inside the list.</td></tr>
              <tr><th scope="row"><Kbd keys="E" /></th><td>Evidence</td><td>Shows or hides the raw DGDA JSON and the pipeline notes.</td></tr>
              <tr><th scope="row"><Kbd keys="S" /></th><td>DGDA source</td><td>Opens the register entry for the record's DAR number in a new tab.</td></tr>
              <tr><th scope="row"><Kbd keys="?" /></th><td>Shortcuts</td><td>Shows this list inside the workspace.</td></tr>
              <tr><th scope="row"><Kbd keys="Esc" /></th><td>Close</td><td>Closes the shortcuts sheet, the evidence panel or the note field.</td></tr>
              <tr><th scope="row"><Kbd keys="Enter" /></th><td>Never approves</td><td>Bare Enter has no workspace action. On a focused "Looks correct" button it is blocked and a hint names the A key.</td></tr>
              <tr><th scope="row"><Kbd keys="Ctrl" /> <Kbd keys="Enter" /></th><td>Send report</td><td>Only inside the note field. Cmd and Enter on a Mac.</td></tr>
            </tbody>
          </table>
        </ScrollRegion>
      </Section>
    </Chapter>
  );
}
