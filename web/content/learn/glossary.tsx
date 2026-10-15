import type { ReactNode } from "react";
import type { LearnContext } from "@/components/learn/context";
import GlossaryFilter from "@/components/learn/GlossaryFilter";
import { GLOSSARY_LIST_ID } from "@/components/learn/glossary-filter";
import styles from "@/components/learn/learn.module.css";
import { AsStored, BatchNote, Chapter, LivePill, Section, St } from "@/components/learn/parts";
import BotCheck from "@/components/ui/BotCheck";
import CodeChip from "@/components/ui/CodeChip";
import Kbd from "@/components/ui/Kbd";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataChip from "@/components/ui/NoDataChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { APPROVED, DESK_NEW, LEARN_BOARD, NOT_REVIEWED, NO_DATA_SENTENCE, SEVERITY_NOT_CLASSIFIED, STALE_TITLE } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { BATCH_STATUS_WORD, batchPill, formatCount } from "@/lib/stats";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S, severityCounts, substanceNamed, type PilotId } from "./pilot-snapshot";

/**
 * One glossary entry (Board L). `ids` names the pilot records the example draws on: when /v1/stats does not report one
 * of them as usable, the example shows the §6.4 stub (trade name and live pill) instead (§6.8). Examples without `ids`
 * are live counts, snapshot-only values (followed by "as stored on"), or not about a record. `ex: null` leaves the
 * example out: the live batch lines state the pilot batch's approval state, so they show only while /v1/stats reports
 * that batch (§6.8 "Approval-state sentences"; no replacement copy).
 */
type Term = { term: string; small?: string; def: ReactNode; label?: "Pilot" | "Shown as" | "Keys"; ex: ReactNode | null; ids?: readonly PilotId[] };

function terms(ctx: LearnContext): Term[] {
  const b = ctx.batch;
  const n = b?.itemCount ?? 0, a = b?.approved ?? 0;
  const c = severityCounts();
  const asp = substanceNamed("Acetylsalicylic acid"), warf = substanceNamed("Warfarin"), amox = substanceNamed("Amoxicillin");
  const clar = substanceNamed("Clarithromycin"), metf = substanceNamed("Metformin"), amlo = substanceNamed("Amlodipine");
  const domp = substanceNamed("Domperidone"), simva = substanceNamed("Simvastatin"), chlor = substanceNamed("Chloramphenicol");
  const amoxRec = S.records[P.amoxiclav], clarRec = S.records[P.clarith], chlorRec = S.records[P.chloramphenicol];
  const full = S.substances.filter((s) => s.coverage === "full").length;
  const none = (k: number) => (k === 0 ? "none so far" : String(k));
  return [
    { term: "Action", def: "DDInter's label for how two drugs interact, such as synergy or metabolism.", ex: <>Simvastatin + Clarithromycin, metabolism</>, ids: [P.simvastatin, P.clarith] },
    // With a > 0 the pill is "Approved by a pharmacist": the batch's pending pill after "2 of 10" would read "2 of 10 not yet reviewed".
    { term: "Approved record", small: APPROVED, def: <>A record a pharmacist marked "Looks correct" after its latest extraction, with no issue since. Only these are public.</>,
      ex: b && <>{a === 0 ? "none yet, " : ""}{a} of {n} <ReviewStatus status={a === 0 ? batchPill(b) : "approved"} /></> },
    { term: "ATC", small: "Anatomical Therapeutic Chemical", def: "WHO's classification of drugs by organ system and therapeutic use. One substance can have several codes.",
      ex: <>{asp.name} {asp.codes.atc.map((x) => <CodeChip key={x} system="ATC" code={x} />)}</>, ids: [P.aspirin] },
    { term: "BAN", small: "British Approved Name", def: "The UK's official name for a substance. Often the same as the INN.", ex: <>Paracetamol, the name DGDA uses for Napa's ingredient</>, ids: [P.napa] },
    { term: "Back in review", def: "An approved record that was re-run, or whose shared substance data changed. It leaves public view until a pharmacist approves it again.",
      ex: <><ReviewStatus status="back_in_review" /> {none(S.review.backInReview)}<AsStored /></> },
    { term: "Batch", def: "A committed list of DGDA concept ids that the pipeline runs and people review together.",
      ex: b && <><span className="mono">{S.batchId}</span>, {n} records, {BATCH_STATUS_WORD[b.status]}</> },
    { term: "Batch size rule", def: "Batches start at 10 and grow to 50, then 100, after two batches in a row with at most 1 issue each and no systemic bug. More than 5% issues, or any systemic bug, drops back to 10.", ex: <>at 10</> },
    { term: "BDC id", def: "Our permanent id for a clinical drug. Never reused.", ex: <><span className="mono">{amoxRec.bdcId}</span> {amoxRec.clinicalDrug}</>, ids: [P.amoxiclav] },
    { term: "BDS id", def: "Our permanent id for a substance, one per ICD-11 XM code. Never reused.", ex: <><span className="mono">{domp.bdsId}</span> {domp.name}</>, ids: [P.domperidone] },
    { term: "Brand product", def: "One DGDA-registered product: a trade name from one company in one dosage form.", ex: <>{clarRec.tradeName}, {clarRec.company}, {clarRec.dosageForm}</>, ids: [P.clarith] },
    { term: "Clinical drug", def: "Substances with strengths, a dose form and a route. Brands with the same signature share one.", ex: <><span className="mono">{clarRec.bdcId}</span> {clarRec.clinicalDrug}</>, ids: [P.clarith] },
    { term: "Concept id", def: "The OCL server's id for a DGDA product: the DAR number and the trade name.", ex: <span className="mono">{P.clarith}</span>, ids: [P.clarith] },
    { term: "Confidence", def: "How sure a code match is, from 0 to 1. Lower scores go to review.", ex: <>every code matched at 1.00</>, ids: PILOT_IDS },
    { term: "Coverage", def: "Whether DDInter has data for a substance: full or none. Stored, never inferred.", ex: <>{full} substances full, {domp.name} none</>, ids: PILOT_IDS },
    { term: "Crosswalk code", def: "An outside code linked to our substance, with the method that found it and a confidence.",
      ex: <><span className="code"><span className="code-sys">RxCUI</span>{amox.codes.rxcui}<span className="code-meta">rxnav-exact, 1.00</span></span> {amox.name}</>, ids: [P.amoxiclav] },
    { term: "DAR number", def: "The DGDA registration number of a product.", ex: <>Napa <span className="mono">{S.records[P.napa].darNumber}</span></>, ids: [P.napa] },
    { term: "DDInter", small: "DDInter 2.0", def: "The drug interaction database we take drug–drug, drug–disease and drug–food data from.",
      ex: <><CodeChip system="DDINTER" code={warf.entries[0].id} /> {warf.name}</>, ids: [P.warfarin] },
    { term: "DGDA", def: "Directorate General of Drug Administration, Bangladesh's drug regulator. Its register is our source for every brand.",
      ex: <>{formatCount(ctx.stats.registerProducts)} products in the register</> },
    { term: "Dose form", def: "The physical form of a product.", ex: <>Tablet; {chlorRec.dosageForm} for {chlorRec.tradeName}</>, ids: [P.chloramphenicol] },
    { term: "DrugBank", def: "A drug database whose accession numbers we use to confirm DDInter matches.", ex: <><CodeChip system="DRUGBANK" code={warf.codes.drugbank} /> {warf.name}</>, ids: [P.warfarin] },
    { term: "Drug–disease", def: "A DDInter record warning about a substance in a patient with a condition.", ex: <>{asp.name}, {asp.disease} records</>, ids: [P.aspirin] },
    { term: "Drug–food", def: "A DDInter record about a substance taken with a food.", ex: <>{warf.name}, {warf.food} records</>, ids: [P.warfarin] },
    { term: "Engineer checked", def: "An engineer marked the extraction correct. Recorded, but it does not publish.",
      ex: <><ReviewStatus status="engineer_checked" /> {none(S.review.engineerChecked)}<AsStored /></> },
    { term: "Evidence snapshot", def: "A source response stored exactly as it arrived, so every value can be traced back.",
      ex: <>{S.evidence.oclConcept} DGDA records, plus every RxNav and DDInter response</> },
    { term: "ICD-11 XM", def: "WHO ICD-11 medicament codes. DGDA maps each ingredient to one.", ex: <><CodeChip system="ICD11_XM" code={clar.codes.icd11} /> {clar.name}</>, ids: [P.clarith] },
    { term: "INN", small: "International Nonproprietary Name", def: "WHO's official generic name for a substance.", ex: <>Paracetamol is the INN; DDInter uses the USAN Acetaminophen</>, ids: [P.napa] },
    { term: "Interaction pair", def: "Two substances DDInter records together, stored once with its severity, actions and text.",
      ex: <>{warf.name} + {asp.name} <Severity level="major" /></>, ids: [P.warfarin, P.aspirin] },
    { term: "Issue reported", def: "A reviewer flagged a problem with a note. The record stays hidden until it is fixed and re-run.",
      ex: <><ReviewStatus status="issue" /> {none(S.review.issueReported)}<AsStored /></> },
    { term: "Major", def: "DDInter's most serious severity grade.", ex: <><Severity level="major" /> {simva.name} + {clar.name}</>, ids: [P.simvastatin, P.clarith] },
    { term: "Management text", def: "DDInter's advice for a pair. Shown truncated with a link to the full text, never rewritten.", ex: <>{simva.name} + {warf.name} has none in DDInter</>, ids: [P.simvastatin, P.warfarin] },
    { term: "Match method", def: "How a code was found: xm from DGDA, rxnav-exact from RxNav, drugbank for DDInter.",
      ex: <><span className="mono">drugbank</span> for <span className="mono">{amox.entries[0].id}</span> {amox.name}</>, ids: [P.amoxiclav] },
    { term: "Minor", def: "DDInter's lowest severity grade.", ex: <><Severity level="minor" /> {clar.name} + {amox.name}</>, ids: [P.clarith, P.amoxiclav] },
    { term: "Moderate", def: "DDInter's middle severity grade.", ex: <><Severity level="moderate" /> {metf.name} + {warf.name}</>, ids: [P.metformin, P.warfarin] },
    { term: "No interaction data", def: NO_DATA_SENTENCE, ex: <><NoDataChip label="No interaction data" /> {domp.name}</>, ids: [P.domperidone] },
    { term: "Not checked", def: "A pair involving a substance with no DDInter data. Never counted as checked.", ex: <>{domp.name} + {metf.name}</>, ids: [P.domperidone, P.metformin] },
    { term: NOT_REVIEWED, def: "A record no pharmacist has approved. Hidden from public pages and from public API answers.",
      ex: b && <>{a === 0 ? `all ${n} records` : `${n - a} of ${n} records`}</> },
    { term: "OCL", small: "Open Concept Lab", def: "The terminology server the pipeline reads the DGDA register from.", ex: <>each record's raw DGDA JSON comes from it</> },
    { term: "Re-run", def: "Running the pipeline again for a record. Its earlier approvals stop counting.",
      ex: <>{S.review.reruns === 0 ? "none" : `${S.review.reruns} ${S.review.reruns === 1 ? "re-run" : "re-runs"}`} since the first run, {fmtUtc(S.runAt).slice(0, 10)}<AsStored /></> },
    { term: "Review decision", def: "An OK or an issue, with a note, the reviewer's role and the time. Only ever added, never edited.",
      ex: <>{S.review.decisions} decisions recorded<AsStored /></> },
    { term: "Route", def: "How a product enters the body: systemic, ophthalmic, otic, nasal or topical. Worked out from the dosage form.",
      ex: <>{chlorRec.dosageForm} gives {chlorRec.route}</>, ids: [P.chloramphenicol] },
    { term: "Route assumed", def: "The product's route had no DDInter entry, so the systemic one was used. The alert says so.",
      ex: <>This eye-drop product is checked against <span className="mono">DDInter352</span>, the ophthalmic entry. When a product's route has no DDInter entry, the systemic entry is used and marked "route assumed".</>,
      ids: [P.chloramphenicol] },
    { term: "Route scope", def: "The route a DDInter entry covers.",
      ex: <>{chlor.entries.filter((e) => e.route !== "systemic").map((e, i) => <span key={e.id}>{i > 0 && ", "}<span className="mono">{e.id}</span> {e.route}</span>)}</>, ids: [P.chloramphenicol] },
    { term: "RxNorm and RxCUI", def: "NLM's drug vocabulary and its concept id.", ex: <><CodeChip system="RXCUI" code={metf.codes.rxcui} /> {metf.name}</>, ids: [P.metformin] },
    { term: "Salt", def: "The salt form a product is registered as. We remove it to reach the substance.",
      ex: <>Metformin Hydrochloride <MatchRelation kind="salt" /> {metf.name}</>, ids: [P.metformin] },
    { term: "Severity", def: "DDInter's grade for a pair: Major, Moderate, Minor, or not classified.",
      ex: <>{c.major} Major, {c.moderate} Moderate, {c.minor} Minor, {c.unknown} not classified</>, ids: PILOT_IDS },
    { term: SEVERITY_NOT_CLASSIFIED, def: LEARN_BOARD.unclassifiedGlossary, ex: <><Severity level="unknown" /> Acetaminophen + {amlo.name}</>, ids: [P.napa, P.amlodipine] },
    { term: "Signature", def: "The key that makes a clinical drug unique: dose form, route and sorted strengths.", ex: <span className="mono">{chlorRec.signature}</span>, ids: [P.chloramphenicol] },
    { term: "SNOMED CT", def: "A clinical terminology many EMRs code in.", ex: <><CodeChip system="SNOMEDCT" code={amlo.codes.snomed[0]} /> {amlo.name}</>, ids: [P.amlodipine] },
    { term: "Stage check", def: "One of four pipeline steps, each reporting OK, Warning or Failed with a note.",
      ex: <><St status="warn" /> DDInter for {S.stages.ddinter.warn} of {PILOT_IDS.length} records<AsStored /></> },
    { term: "Stale page", def: "A review page whose record changed after it loaded. Decisions pause until you reload.", label: "Shown as", ex: STALE_TITLE },
    { term: "Strength", def: "The amount of a substance per unit, sometimes per volume.", ex: <>5 mg per 1 ml, {chlorRec.tradeName} eye drops</>, ids: [P.chloramphenicol] },
    { term: "Substance", def: "One active ingredient, with its names and codes. Interactions attach here.", ex: <><span className="mono">{simva.bdsId}</span> {simva.name}</>, ids: [P.simvastatin] },
    { term: "Turnstile", def: "Cloudflare's bot check, run on every review decision and problem report.", label: "Shown as", ex: <BotCheck state="passed" /> },
    // The desk settings sheet names it the same way; NEW_COPY holds the words once (copy.test.ts).
    { term: DESK_NEW.deskSettings.undoLabel, def: <>The undo window after "Looks correct" {LEARN_BOARD.undoWindowDetail} when U cancels it. Nothing is saved until it closes.</>,
      label: "Keys", ex: <><Kbd keys="A" /> then <Kbd keys="U" /></> },
    { term: "USAN", small: "United States Adopted Name", def: "The US official name for a substance. DDInter and RxNorm use it.", ex: <>Acetaminophen, for Paracetamol</>, ids: [P.napa] },
  ];
}

/** Chapter 9 "Glossary" (Board L; §1.6 items 3, 11 and 14; §6.8 snapshot-only lines). */
export default function GlossaryChapter({ ctx }: { ctx: LearnContext }) {
  return (
    <Chapter slug="glossary" level={1}>
      <Section id="gl-terms" h={2}>
        {ctx.batch && <p className={styles.snapPills}><BatchNote ctx={ctx} /></p>}
        <div className={styles.glTools}><GlossaryFilter /></div>
        <dl className={styles.gl} id={GLOSSARY_LIST_ID}>
          {terms(ctx).map((t) => {
            const label = t.label ?? "Pilot";
            const withdrawn = t.ids !== undefined && !t.ids.every((id) => ctx.usable(id));
            return (
              <div className={styles.glItem} key={t.term} data-gl-item="">
                <dt>{t.term}{t.small && <small>{t.small}</small>}</dt>
                <dd>
                  <p>{t.def}</p>
                  {withdrawn
                    ? <p className={styles.glEx} data-withdrawn=""><b>{label}:</b> {t.ids!.map((id) => <span key={id} className={styles.row}><b>{ctx.tradeName(id)}</b><LivePill ctx={ctx} id={id} /></span>)}</p>
                    : t.ex !== null && <p className={styles.glEx}><b>{label}:</b> {t.ex}</p>}
                </dd>
              </div>
            );
          })}
        </dl>
      </Section>
    </Chapter>
  );
}
