import type { LearnContext } from "@/components/learn/context";
import { MatchDiagram } from "@/components/learn/diagrams";
import styles from "@/components/learn/learn.module.css";
import { Chapter, ScrollHint, ScrollRegion, Section, SnapshotBlock } from "@/components/learn/parts";
import CodeChip from "@/components/ui/CodeChip";
import { P, PILOT_SNAPSHOT as S, substanceNamed, substancesOf } from "./pilot-snapshot";

const H = 2;
/** "A01AD05, B01AC06 and N02BA01" */
const andList = (xs: readonly string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Chapter 3 "Our IDs and the code systems" (Board L). */
export default function CodesChapter({ ctx }: { ctx: LearnContext }) {
  const warf = S.records[P.warfarin];
  const warfS = substanceNamed("Warfarin"), dompS = substanceNamed("Domperidone"), aspS = substanceNamed("Acetylsalicylic acid");
  const [acet] = substancesOf(P.napa);
  const [bds, bdsNum] = warfS.bdsId.split("-");
  const [bdc, bdcNum] = warf.bdcId.split("-");
  return (
    <Chapter slug="codes" level={1}>
      <Section id="codes-ids" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.domperidone]}>
          <div className={styles.idx}>
            <div className={styles.idxOne}>
              <div className={styles.idxParts} aria-hidden="true">
                <div className={styles.idxPart}><code>{bds}</code><span>Bangladesh substance</span></div>
                <div className={styles.idxPart}><code>-</code></div>
                <div className={styles.idxPart}><code>{bdsNum}</code><span>Next number from a sequence</span></div>
              </div>
              <p className={styles.small}><span className="mono">{warfS.bdsId}</span> is {warfS.name}.</p>
            </div>
            <div className={styles.idxOne}>
              <div className={styles.idxParts} aria-hidden="true">
                <div className={styles.idxPart}><code>{bdc}</code><span>Bangladesh clinical drug</span></div>
                <div className={styles.idxPart}><code>-</code></div>
                <div className={styles.idxPart}><code>{bdcNum}</code><span>Its own sequence</span></div>
              </div>
              <p className={styles.small}><span className="mono">{warf.bdcId}</span> is {warf.clinicalDrug}.</p>
            </div>
          </div>
          <ul className={styles.bul}>
            <li><b>Stable.</b> A re-run looks up the existing id before minting a new one, so Warfarin stays <span className="mono">{warfS.bdsId}</span> however often the pipeline runs.</li>
            <li><b>Never reused.</b> Neither sequence ever cycles, so a retired number can never point at a different medicine.</li>
            <li><b>One substance per ICD-11 XM code.</b> The database refuses a second substance for the same XM code, so Warfarin Sodium and Warfarin cannot split into two.</li>
            <li><b>One clinical drug per signature.</b> Dose form, route and sorted strengths make the key. Two brands of the same tablet share one BDC.</li>
            <li><b>Covers what others miss.</b> Domperidone has no DDInter entry, yet it still has <span className="mono">{dompS.bdsId}</span> and six crosswalk codes.</li>
          </ul>
        </SnapshotBlock>
      </Section>

      <Section id="codes-systems" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.napa, P.aspirin]}>
          <p className={`${styles.prose} ${styles.prose2}`}>Napa's substance, {acet.name} <span className="mono">{acet.bdsId}</span>, carries one code from each system. Method says how we found the code. Confidence runs from 0 to 1. Every pilot code was an exact match at 1.00.</p>
          <ScrollRegion label="Code systems table, scrolls sideways">
            <table className={`${styles.tbl} ${styles.tblWide}`}>
              <caption>Crosswalk codes for {acet.name}, {acet.bdsId}</caption>
              <thead><tr><th scope="col">System</th><th scope="col">What it is for</th><th scope="col">Napa's code</th><th scope="col">Matched by</th><th scope="col">Confidence</th></tr></thead>
              <tbody>
                <tr><th scope="row">ICD-11 XM</th><td>WHO ICD-11 medicament codes. DGDA maps each registered ingredient to one, so it anchors our substance.</td><td><CodeChip system="ICD11_XM" code={acet.codes.icd11} /></td><td><span className="mono">xm</span>: read from DGDA's own ingredient mapping</td><td className="num">1.00</td></tr>
                <tr><th scope="row">RxNorm RxCUI</th><td>NLM's ingredient concept. Lets systems built on RxNorm recognise the substance.</td><td><CodeChip system="RXCUI" code={acet.codes.rxcui} /></td><td><span className="mono">rxnav-exact</span>: exact name match in NLM RxNav</td><td className="num">1.00</td></tr>
                <tr><th scope="row">ATC</th><td>WHO Anatomical Therapeutic Chemical class. One substance can sit in several: {aspS.name} has {andList(aspS.codes.atc)}.</td><td><CodeChip system="ATC" code={acet.codes.atc[0]} /></td><td><span className="mono">rxnav-exact</span>: read from the matched RxCUI</td><td className="num">1.00</td></tr>
                <tr><th scope="row">DrugBank</th><td>DrugBank accession. DDInter lists DrugBank ids too, so this confirms the DDInter match.</td><td><CodeChip system="DRUGBANK" code={acet.codes.drugbank} /></td><td><span className="mono">rxnav-exact</span>: read from the matched RxCUI</td><td className="num">1.00</td></tr>
                <tr><th scope="row">SNOMED CT</th><td>Clinical terminology concepts for EMRs that code in SNOMED CT. RxNav returned two for most pilot substances.</td><td><div className="codes">{acet.codes.snomed.map((c) => <CodeChip key={c} system="SNOMEDCT" code={c} />)}</div></td><td><span className="mono">rxnav-exact</span>: read from the matched RxCUI</td><td className="num">1.00</td></tr>
                {/* Board L prints the DDInter chip with its route as code-meta and no method (the method is in the next column). */}
                <tr><th scope="row">DDInter</th><td>The DDInter 2.0 drug entry, and the route it covers. Interactions come from here.</td><td><span className="code"><span className="code-sys">DDInter</span>{acet.entries[0].id}<span className="code-meta">{acet.entries[0].route}</span></span></td><td><span className="mono">drugbank</span>: DDInter entry whose DrugBank id equals ours</td><td className="num">1.00</td></tr>
              </tbody>
            </table>
          </ScrollRegion>
        </SnapshotBlock>
      </Section>

      <Section id="codes-match" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.napa]}>
          <figure className={styles.fig}>
            <ScrollHint />
            <ScrollRegion label="Matching chain diagram, scrolls sideways"><MatchDiagram /></ScrollRegion>
            <figcaption className={styles.figcap}>Each step starts from a code the previous step proved, not from a name guess. A name-only DDInter match, a missing RxCUI or an unparsed strength becomes a stage warning that a reviewer sees.</figcaption>
          </figure>
        </SnapshotBlock>
      </Section>
    </Chapter>
  );
}
