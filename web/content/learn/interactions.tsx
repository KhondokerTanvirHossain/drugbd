import type { CSSProperties } from "react";
import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Chapter, LivePill, NeutralTag, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import Banner from "@/components/ui/Banner";
import NoDataBlock from "@/components/ui/NoDataBlock";
import NoDataChip from "@/components/ui/NoDataChip";
import PairCard from "@/components/ui/PairCard";
import Severity from "@/components/ui/Severity";
import { FULL_TEXT, LEARN_BOARD, NOT_REVIEWED, NOT_RUN, NO_DATA_SENTENCE, SEVERITY_NOT_CLASSIFIED, UNKNOWN_PAIR_LINE } from "@/lib/copy";
import { groupBySeverity, type Severity as Level } from "@/lib/severity";
import { P, PILOT_IDS, PILOT_SNAPSHOT as S, actionCounts, severityCounts, substanceNamed } from "./pilot-snapshot";

const H = 2;
/** The worked check's three products (Board L chapter 6). */
const CHECK_IDS = [P.warfarin, P.aspirin, P.domperidone] as const;
const pairs = (n: number) => `${n} ${n === 1 ? "pair" : "pairs"}`;
const pilotPairs = (n: number) => `${n} pilot ${n === 1 ? "pair" : "pairs"}`;
const LEVELS: Level[] = ["major", "moderate", "minor", "unknown"];
const BAR_CLASS: Record<Level, string> = { major: styles.bMajor, moderate: styles.bModerate, minor: styles.bMinor, unknown: styles.bUnknown };
/** Board L's actions, in its order, with its explanation of each. "unknown" is DDInter's own word, shown as "Not given". */
const ACTIONS: [string, string, string][] = [
  ["synergy", "Synergy", "The two drugs add to or strengthen the same effect."],
  ["metabolism", "Metabolism", "One drug changes how the body breaks down the other."],
  ["antagonism", "Antagonism", "One drug works against the other's effect."],
  ["distribution", "Distribution", "One drug changes how the other spreads through the body."],
  ["others", "Others", "A mechanism DDInter files outside these groups."],
  ["unknown", "Not given", "DDInter gives no mechanism for the pair."],
];

/** Chapter 6 "Interactions explained" (Board L; §1.6 items 5, 11 and 12). */
export default function InteractionsChapter({ ctx }: { ctx: LearnContext }) {
  const counts = severityCounts();
  const acts = actionCounts();
  const total = S.pairs.length;
  const allUsable = PILOT_IDS.every((id) => ctx.usable(id));
  const warfS = substanceNamed("Warfarin"), aspS = substanceNamed("Acetylsalicylic acid"), dompS = substanceNamed("Domperidone");
  const w = warfS.drugDrug;
  return (
    <Chapter slug="interactions" level={1}>
      <Section id="int-severity" h={H}>
        {/* G3 (§1.2): the 28 is a count drawn from every pilot record, so it shows only while all ten examples are usable. */}
        <p className={`${styles.prose} ${styles.prose2}`}>Severity chips are square-cornered and each has its own shape, so they never depend on colour alone.{allUsable && ` The counts are the ${total} DDInter pairs that apply to the pilot products.`}</p>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <ul className={styles.sevLegend}>
            <li><span><Severity level="major" /></span><p>DDInter's most serious grade.</p><span className={styles.cnt}>{counts.major}<small>pairs</small></span></li>
            <li><span><Severity level="moderate" /></span><p>DDInter's middle grade.</p><span className={styles.cnt}>{counts.moderate}<small>pairs</small></span></li>
            <li><span><Severity level="minor" /></span><p>DDInter's lowest grade.</p><span className={styles.cnt}>{counts.minor}<small>pairs</small></span></li>
            <li><span><Severity level="unknown" /></span><p>{LEARN_BOARD.unclassifiedLegend}</p><span className={styles.cnt}>{counts.unknown}<small>pairs</small></span></li>
            <li><span><NoDataChip label="No interaction data" /></span><p>{NO_DATA_SENTENCE} Its pairs are not checked.</p><span className={styles.cnt}>{S.notCheckedPairs}<small>not checked</small></span></li>
          </ul>
        </SnapshotBlock>
      </Section>

      <Section id="int-pilot" h={H}>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <p className={styles.small}><span className={styles.pairSum}>Most serious first: {LEVELS.map((l) => <Severity key={l} level={l} count={counts[l]} />)}</span> Every pair is listed by name below.</p>
          {groupBySeverity(S.pairs).map(([level, group]) => (
            <div key={level} className={styles.pairsGroup}>
              <p className={styles.row}><Severity level={level} /><span className={styles.small}>{pairs(group.length)}</span></p>
              <ul>{group.map((p) => (
                <li key={`${p.ddinterA}/${p.ddinterB}`}>{p.a} + {p.b}{p.action !== "unknown" && <> <span className={styles.small}>{p.action}</span></>}</li>
              ))}</ul>
            </div>
          ))}
          <p className={styles.small}>The {S.notCheckedPairs} pairs between Domperidone and the other pilot substances are not checked, because Domperidone has no DDInter entry. They are not in the {total}.</p>
        </SnapshotBlock>
      </Section>

      <Section id="int-substance" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin]}>
          <figure className={styles.fig}>
            <p className={styles.h4}>{warfS.name} <span className={`mono ${styles.monoMuted}`}>{warfS.bdsId}</span>, {w.total} drug–drug records in DDInter</p>
            <div className={styles.bar} role="img" aria-label={`${warfS.name} drug–drug records: Major ${w.major}, Moderate ${w.moderate}, Minor ${w.minor}, ${SEVERITY_NOT_CLASSIFIED} ${w.unknown}, of ${w.total}.`}>
              {LEVELS.map((l) => (
                <i key={l} className={`${BAR_CLASS[l]} ${styles.barSeg}`} style={{ "--w": w[l] } as CSSProperties}><span className={styles.bG} aria-hidden="true" /></i>
              ))}
            </div>
            <div className={styles.barLegend}>{LEVELS.map((l) => <Severity key={l} level={l} count={w[l]} />)}</div>
            <figcaption className={styles.figcap}>Drawn to scale, each segment with its severity glyph. {SEVERITY_NOT_CLASSIFIED} is the second-largest group, and it stays separate from Minor.</figcaption>
          </figure>
        </SnapshotBlock>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <ScrollRegion label="Interaction counts per pilot substance, scrolls sideways">
            <table className={`${styles.tbl} ${styles.tblWide}`}>
              <caption>DDInter 2.0 records for each pilot substance</caption>
              <thead><tr><th scope="col">Substance</th><th scope="col">Pilot product</th><th scope="col">DDInter entries</th><th scope="col">Drug–drug</th><th scope="col">Disease</th><th scope="col">Food</th><th scope="col">Coverage</th></tr></thead>
              <tbody>
                {S.substances.map((s) => (
                  <tr key={s.bdsId}>
                    <th scope="row">{s.name}<span className={`${styles.cmpSub} mono`}>{s.bdsId}</span></th>
                    <td>{S.records[s.product].tradeName}</td>
                    {s.coverage === "none" ? (
                      <>
                        <td>None</td>
                        <td colSpan={3}><div className={styles.stack}><NoDataChip label="No interaction data" /><span>{NO_DATA_SENTENCE}</span></div></td>
                        <td>none</td>
                      </>
                    ) : (
                      <>
                        <td>{s.entries.map((e, i) => <span key={e.id}>{i > 0 && <br />}<span className="mono">{e.id}</span> {e.route}</span>)}</td>
                        <td><div className={styles.stack}><span className="num">{s.drugDrug.total} records</span>{LEVELS.map((l) => <Severity key={l} level={l} count={s.drugDrug[l]} />)}{s.countedEntry && <span className={styles.small}>Counted for <span className="mono">{s.countedEntry.id}</span> {s.countedEntry.route}, the entry {S.records[s.product].tradeName} uses.</span>}</div></td>
                        <td className="num">{s.disease}</td>
                        <td className="num">{s.food}</td>
                        <td><NeutralTag /></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </SnapshotBlock>
      </Section>

      <Section id="int-actions" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>DDInter tags each pair with an action, the kind of mechanism behind it. These are the actions in the pilot. Other pairs may carry further DDInter groups; we show DDInter's word as given.</p>
        <SnapshotBlock ctx={ctx} ids={PILOT_IDS}>
          <ol className={styles.act}>
            {ACTIONS.map(([action, name, what]) => {
              const ex = S.actionExamples.find((e) => e.action === action)!;
              return (
                <li key={action}>
                  <p className={styles.actN}>{name}<span>{what}</span></p>
                  <div className={styles.actB}>
                    <p className={styles.row}><Severity level={ex.severity} /><b>{ex.names}</b><span className={styles.small}>{pilotPairs(acts[action] ?? 0)}</span></p>
                    {ex.interaction !== null && <p className="pair-text">{ex.interaction}</p>}
                    <p className="pair-source">{ex.interaction === null ? UNKNOWN_PAIR_LINE
                      : ex.truncated ? <>Interaction text, truncated. {FULL_TEXT}.</> : "Interaction text from DDInter 2.0."}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </SnapshotBlock>
      </Section>

      <Section id="int-disease" h={H}>
        <div className={styles.grid2}>
          <SnapshotBlock ctx={ctx} ids={[P.aspirin, P.warfarin]}>
            <div className={styles.card}>
              <p className={styles.h4}>Drug–disease and drug–food</p>
              <p className={styles.small}>DDInter also links a substance to conditions and foods. In the pilot data these are counts only: {aspS.name} {aspS.disease} drug–disease, {warfS.name} {warfS.food} drug–food. The condition and food names and their text are not in the pilot data.</p>
            </div>
          </SnapshotBlock>
          <div className={styles.card}>
            <p className={styles.h4}>Coverage</p>
            <p className={styles.small}>Every substance has a stored coverage value. <span className="mono">full</span> shows as neutral text, never green:</p>
            <p><NeutralTag /></p>
            <p className={styles.small}><span className="mono">none</span> shows the full no-data statement, always expanded. A substance whose DDInter stage has not run yet is a different state: "{NOT_RUN}". It never gets the no-data sentence, because DDInter was never asked.</p>
          </div>
        </div>
      </Section>

      <Section id="int-check" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.aspirin, P.domperidone]} pills="inline">
          <p className={`${styles.prose} ${styles.prose2}`}>Three pilot products checked together: G Warfarin, Aspirin and Domperidone. Three substances make three pairs. One has DDInter data; two involve Domperidone and are not checked.</p>
          <div className="window">
            <div className="window-bar"><span className="window-dot" /><span className="window-dot" /><span className="window-dot" /><span className={styles.wbUrl}>drugdb.eliooo.org/check</span></div>
            <div className={styles.chk}>
              <div className={styles.chkPicked} role="group" aria-label="Products in this check">
                {CHECK_IDS.map((id) => (
                  <span key={id} className={styles.chkP}>{S.records[id].tradeName} <small>{S.records[id].dosageForm}</small><LivePill ctx={ctx} id={id} /></span>
                ))}
              </div>
              {CHECK_IDS.every((id) => ctx.pending(id)) && (
                <Banner tone="info" role="note" title="Run with reviewer access"
                  body={`All three records are "${NOT_REVIEWED}". A public check today would list them as not reviewed and check nothing.`} />
              )}
              <p className={styles.chkSum}><span><b>3</b> substances</span><span><b>1</b> pair checked</span><span><b>2</b> pairs not checked</span></p>
              <PairCard id="chk" severity="major" names={`${warfS.name} + ${aspS.name}`}
                meta={`${S.records[P.warfarin].tradeName} with ${S.records[P.aspirin].tradeName}. Action: synergy. Route: systemic for both.`}
                text={{ kind: "management", body: S.workedCheck.management }} source={<>Management, truncated. {FULL_TEXT}.</>} surface="public" />
              <NoDataBlock title={dompS.name} bdsId={dompS.bdsId} pairs={[`${dompS.name} + ${warfS.name}`, `${dompS.name} + ${aspS.name}`]} />
            </div>
          </div>
          <p className={styles.small}>{LEARN_BOARD.checkerNeverSays}</p>
        </SnapshotBlock>
      </Section>
    </Chapter>
  );
}
