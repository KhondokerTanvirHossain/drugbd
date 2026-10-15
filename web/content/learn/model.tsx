import type { LearnContext } from "@/components/learn/context";
import { EntityDiagram } from "@/components/learn/diagrams";
import styles from "@/components/learn/learn.module.css";
import { Chapter, DownArrow, LivePill, ScrollHint, ScrollRegion, Section, SnapshotBlock, St } from "@/components/learn/parts";
import CodeChip from "@/components/ui/CodeChip";
import MatchRelation from "@/components/ui/MatchRelation";
import NoDataBlock from "@/components/ui/NoDataBlock";
import { P, PILOT_SNAPSHOT as S, substanceNamed, substancesOf } from "./pilot-snapshot";

const H = 2;
const records = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;

/** Chapter 2 "The model" (Board L, §1.6 item 3). */
export default function ModelChapter({ ctx }: { ctx: LearnContext }) {
  const napa = S.records[P.napa], warf = S.records[P.warfarin], metf = S.records[P.metformin], asp = S.records[P.aspirin];
  const amox = S.records[P.amoxiclav], chlor = S.records[P.chloramphenicol], domp = S.records[P.domperidone];
  const [acet] = substancesOf(P.napa);
  const warfS = substanceNamed("Warfarin"), metfS = substanceNamed("Metformin"), aspS = substanceNamed("Acetylsalicylic acid");
  const amoxS = substanceNamed("Amoxicillin"), clavS = substanceNamed("Clavulanic acid"), chlorS = substanceNamed("Chloramphenicol");
  const dompS = substanceNamed("Domperidone");
  const napaWarn = S.warnings[P.napa].status === "warn" ? 1 : 0;
  const otherPilot = S.notCheckedPairs - 2;
  return (
    <Chapter slug="model" level={1}>
      <Section id="model-diagram" h={H}>
        <SnapshotBlock ctx={ctx} ids={[P.napa, P.domperidone]}>
          <figure className={styles.fig}>
            <ScrollHint />
            <ScrollRegion label="Entity diagram, scrolls sideways"><EntityDiagram /></ScrollRegion>
            <figcaption className={styles.figcap}>Solid boxes are the three levels of the drug master. The numbers at each end of a line say how many records connect.</figcaption>
          </figure>
          <div className={styles.dgRead} role="group" aria-label="How to read the lines">
            <div><b>Brand product is a clinical drug</b><span>Many brands, one clinical drug. Napa and any other paracetamol 500 mg tablet share <span className="mono">{napa.bdcId}</span>.</span></div>
            <div><b>Clinical drug contains substances</b><span>One or more, each with its own strength. A combination tablet has two.</span></div>
            <div><b>Substance is coded as</b><span>Many codes per substance, each with how it was matched and a confidence from 0 to 1.</span></div>
            <div><b>Substance is found in DDInter entries</b><span>Zero or more, one per route. Domperidone has none. Chloramphenicol has three.</span></div>
            <div><b>DDInter entry lists interactions</b><span>Drug–drug pairs, drug–disease and drug–food records, from DDInter 2.0.</span></div>
            <div><b>Substance has coverage</b><span>Exactly one: full, or none. "None" is stored, never guessed from an empty list.</span></div>
            <div><b>Brand product is reviewed in a batch</b><span>Each batch record keeps stage results, raw evidence and every review decision.</span></div>
          </div>
        </SnapshotBlock>
      </Section>

      <Section id="model-napa" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>The same record at each step of the pipeline, with the values stored for it today.</p>
        <SnapshotBlock ctx={ctx} ids={[P.napa]} pills="inline">
          <ol className={styles.jr}>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>1</span>DGDA register row</p>
              <dl>
                <dt>Trade name</dt><dd>{napa.tradeName}</dd>
                <dt>Company</dt><dd>{napa.company}</dd>
                <dt>DAR</dt><dd className="mono">{napa.darNumber}</dd>
                <dt>Form</dt><dd>{napa.dosageForm}</dd>
                <dt>Content</dt><dd><span className="raw">{napa.genericContentRaw}</span></dd>
                <dt>DGDA maps to</dt><dd><span className="mono">{acet.codes.icd11}</span> {acet.name}</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>2</span>Substance</p>
              <dl>
                <dt>Id</dt><dd className="mono">{acet.bdsId}</dd>
                <dt>Name</dt><dd>{acet.name}</dd>
                <dt>Also</dt><dd>Paracetamol (DGDA content), acetaminophen (RxNorm), Acetaminophen (ICD-11, DDInter)</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>3</span>Clinical drug</p>
              <dl>
                <dt>Id</dt><dd className="mono">{napa.bdcId}</dd>
                <dt>Name</dt><dd>{napa.clinicalDrug}</dd>
                <dt>Route</dt><dd>{napa.route}</dd>
                <dt>Signature</dt><dd className="mono">{napa.signature}</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>4</span>Codes</p>
              <div className="codes">
                <CodeChip system="ICD11_XM" code={acet.codes.icd11} />
                <CodeChip system="RXCUI" code={acet.codes.rxcui} />
                {acet.codes.atc.map((c) => <CodeChip key={c} system="ATC" code={c} />)}
                <CodeChip system="DRUGBANK" code={acet.codes.drugbank} />
                {acet.codes.snomed.map((c) => <CodeChip key={c} system="SNOMEDCT" code={c} />)}
              </div>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>5</span>DDInter</p>
              <dl>
                <dt>Entry</dt><dd><span className="mono">{acet.entries[0].id}</span>, {acet.entries[0].route}</dd>
                <dt>Drug–drug</dt><dd>{records(acet.drugDrug.total)}</dd>
                <dt>Disease</dt><dd>{records(acet.disease)}</dd>
                <dt>Food</dt><dd>{records(acet.food)}</dd>
                <dt>Coverage</dt><dd>Interaction data found</dd>
              </dl>
            </li>
            <li>
              <p className={styles.jrH}><span className={styles.jrN}>6</span>Review</p>
              <dl>
                <dt>Batch</dt><dd className="mono">{S.batchId}</dd>
                <dt>Stages</dt><dd><St status="ok" /> {4 - napaWarn}{"  "}<St status="warn" /> {napaWarn}</dd>
                <dt>Status</dt><dd><LivePill ctx={ctx} id={P.napa} /></dd>
              </dl>
            </li>
          </ol>
        </SnapshotBlock>
      </Section>

      <Section id="model-edges" h={H}>
        <p className={`${styles.prose} ${styles.prose2}`}>Three of the ten pilot medicines show the edge cases the model has to handle.</p>
        <div className={styles.ec}>
          <SnapshotBlock ctx={ctx} ids={[P.warfarin, P.metformin]}>
            <article className={styles.card}>
              <p className={styles.h4}>Salt removed</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{warf.tradeName}, DAR <span className="mono">{warf.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{warf.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="salt" /></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{warfS.name}</b><span className="mono">{warfS.bdsId}</span><span className="mono">{warfS.codes.icd11}</span></span>
              </div>
              <p className={styles.small}>The salt changes the registered name, not the substance. {metf.tradeName}'s <span className="raw">{metf.genericContentRaw}</span> becomes {metfS.name} <span className="mono">{metfS.bdsId}</span> the same way.</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.napa, P.aspirin]}>
            <article className={styles.card}>
              <p className={styles.h4}>Different names, same substance</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{napa.tradeName} and {asp.tradeName}</span>
                <span className={styles.flowNode}><span className="raw">{napa.genericContentRaw}</span><span className="raw">{asp.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="norm" /></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{acet.name}</b><span className="mono">{acet.bdsId}</span></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{aspS.name}</b><span className="mono">{aspS.bdsId}</span></span>
              </div>
              <p className={styles.small}>DGDA's ICD-11 mapping and DDInter both use Acetaminophen and Acetylsalicylic acid. We keep the local names as synonyms so a search for either finds the record.</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.amoxiclav]}>
            <article className={styles.card}>
              <p className={styles.h4}>Combination product</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{amox.tradeName}, DAR <span className="mono">{amox.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{amox.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow />One clinical drug, <span className="mono">{amox.bdcId}</span></span>
                <div className={styles.flowSplit}>
                  <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{amoxS.name}</b> 500 mg<span className="mono">{amoxS.bdsId}</span></span>
                  <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{clavS.name}</b> 125 mg<span className="mono">{clavS.bdsId}</span></span>
                </div>
              </div>
              <p className={styles.small}>Each strength is matched to its own substance, and checks run on both. The signature sorts them: <span className="mono">{amox.signature}</span>.</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.chloramphenicol]}>
            <article className={styles.card}>
              <p className={styles.h4}>Route scope</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{chlor.tradeName} eye drops, DAR <span className="mono">{chlor.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{chlor.genericContentRaw}</span><span>{chlor.dosageForm}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="added" /> route: {chlor.route}</span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{chlorS.name}</b><span className="mono">{chlorS.bdsId}</span></span>
                <span className={styles.flowStep}><DownArrow />DDInter entries, by route</span>
                <div className={styles.flowSplit}>
                  {chlorS.entries.map((e) => (
                    <span key={e.id} className={e.route === chlor.route ? `${styles.flowNode} ${styles.flowKey}` : styles.flowNode}>
                      <span className="mono">{e.id}</span> {e.route}
                    </span>
                  ))}
                </div>
              </div>
              <p className={styles.small}>This eye-drop product is checked against <span className="mono">DDInter352</span>, the ophthalmic entry. When a product's route has no DDInter entry, the systemic entry is used and marked "route assumed".</p>
            </article>
          </SnapshotBlock>
          <SnapshotBlock ctx={ctx} ids={[P.domperidone]} className={styles.ecWide}>
            <article className={styles.card}>
              <p className={styles.h4}>No interaction data</p>
              <div className={styles.flow}>
                <span className={styles.flowLab}>{domp.tradeName}, DAR <span className="mono">{domp.darNumber}</span></span>
                <span className={styles.flowNode}><span className="raw">{domp.genericContentRaw}</span></span>
                <span className={styles.flowStep}><DownArrow /><MatchRelation kind="same" /></span>
                <span className={`${styles.flowNode} ${styles.flowKey}`}><b>{dompS.name}</b><span className="mono">{dompS.bdsId}</span>
                  <CodeChip system="ATC" code={dompS.codes.atc[0]} /><CodeChip system="DRUGBANK" code={dompS.codes.drugbank} /></span>
                <span className={styles.flowStep}><DownArrow />No DDInter entry, coverage: none</span>
              </div>
              <NoDataBlock title={dompS.name} bdsId={dompS.bdsId}
                pairs={[`${dompS.name} + ${warfS.name}`, `${dompS.name} + ${aspS.name}`, `${dompS.name} + ${otherPilot} other pilot substances`]} />
              <p className={styles.small}>Domperidone has no DDInter 2.0 entry (coverage: none). It still gets a substance and every code we can find. Its pairs are "not checked", never counted as checked.</p>
            </article>
          </SnapshotBlock>
        </div>
      </Section>
    </Chapter>
  );
}
