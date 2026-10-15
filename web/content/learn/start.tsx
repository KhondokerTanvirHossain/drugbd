import type { LearnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import { Ann, Chapter, LivePill, NeutralTag, Section, SnapshotBlock } from "@/components/learn/parts";
import { buttonClass } from "@/components/ui/Button";
import CodeChip from "@/components/ui/CodeChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { NOT_REVIEWED } from "@/lib/copy";
import { fmtDhakaClock, fmtUtc } from "@/lib/format";
import { batchPill, formatCount } from "@/lib/stats";
import { P, PILOT_SNAPSHOT as S, substancesOf } from "./pilot-snapshot";

const H = 3;   // §6.8: on /learn/start the hero holds the <h1>, the chapter title is an <h2>, sections are <h3>

/** /learn/start: the Learn hero and chapter 1 (Board L, §1.6 item 13). */
export default function StartChapter({ ctx }: { ctx: LearnContext }) {
  const st = ctx.stats;
  const napa = S.records[P.napa];
  const [acet] = substancesOf(P.napa);
  const nothingPublic = ctx.batch !== null && ctx.batch.approved === 0;
  // §6.8 "Approval-state sentences": only while /v1/stats reports Napa as not reviewed. pending() is also true for a
  // record it does not report, which would state Napa's approval from absence (Review Focus 2).
  const napaHidden = ctx.item(P.napa)?.status === "not_reviewed";
  return (
    <>
      <header className={styles.hero} id="top">
        <h1>Learn IntelliDrugs</h1>
        <p className={styles.lede}>How the Bangladesh drug knowledge base is built, checked and served. Every example on this page is a real record from pilot batch <span className="mono">{S.batchId}</span>, as the pipeline stored it.</p>
        <div className={styles.facts} role="list">
          <div role="listitem"><b className="num">{formatCount(st.registerProducts)}</b><span>products in the DGDA register</span></div>
          <div role="listitem"><b className="num">{formatCount(st.productsLoaded)}</b><span>pilot medicines loaded so far</span></div>
          <div role="listitem"><b className="num">{formatCount(st.substances)}</b><span>substances, each with a BDS id</span></div>
          <div role="listitem"><b className="num">{`${formatCount(st.approvedProducts)} of ${formatCount(st.productsLoaded)}`}</b><span>approved by a pharmacist</span></div>
        </div>
        <p className={styles.status}>
          <ReviewStatus status={batchPill(ctx.batch)} />
          <span>Pilot run {fmtUtc(S.runAt)}, which is {fmtDhakaClock(S.runAt)} in Dhaka.{nothingPublic ? " Nothing from the pilot is public yet." : ""}</span>
        </p>
      </header>

      <Chapter slug="start" level={2}>
        <Section id="start-what" h={H}>
          <div className={styles.prose}>
            {/* G3 (§1.2): this Board L sentence names Napa's substance and strength, so it shows only while Napa's example is usable (§6.8 Withdrawn examples); no replacement copy. */}
            {ctx.usable(P.napa) && <p>Start from a brand name a doctor writes, such as Napa. IntelliDrugs finds its DGDA registration, works out that it contains paracetamol 500 mg, and connects paracetamol to the same substance in RxNorm, ATC, DrugBank, SNOMED CT and DDInter 2.0. From there it can show which other substances it interacts with and how DDInter grades each interaction.</p>}
            <p>The website is <span className="mono">drugdb.eliooo.org</span>. Reviewers work on the batch pages. Doctors, pharmacists and partner systems read only what a pharmacist has approved.</p>
          </div>
        </Section>

        <Section id="start-who" h={H}>
          <div className={styles.grid3}>
            <div className={styles.card}><p className={styles.h4}>Doctors and prescribers</p><p className={styles.small}>Look up a brand, see what it contains, and check a list of medicines for DDInter interactions before you prescribe.</p></div>
            <div className={styles.card}><p className={styles.h4}>Pharmacists</p><p className={styles.small}>Check a dispensing list, read DDInter's management text, and review records before they go public. Your approval is what publishes a record.</p></div>
            <div className={styles.card}><p className={styles.h4}>Partner companies</p><p className={styles.small}>EMR, pharmacy and pharma systems call the API with DGDA products and get substances, codes and interaction alerts back.</p></div>
          </div>
        </Section>

        <Section id="start-not" h={H}>
          <div className={styles.grid2}>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not a prescribing system</p>
              <p className={styles.small}>It does not choose medicines, doses or durations. It is decision support: it shows what the sources say so a clinician can decide.</p>
            </div>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not proof that a combination is safe</p>
              <p className={styles.small}>An empty alert list only means DDInter recorded nothing for those pairs. A substance DDInter does not cover is shown as no data, never as safe.</p>
            </div>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not its own source of clinical text</p>
              <p className={styles.small}>Interaction and management text is DDInter 2.0's own wording. We shorten it on screen and link the full text. We never rewrite it.</p>
            </div>
            <div className={`${styles.card} ${styles.cardLine}`}>
              <p className={styles.h4}>Not public until a pharmacist approves</p>
              <p className={styles.small}>A loaded record stays hidden behind "{NOT_REVIEWED}" until a pharmacist approves it. Engineer checks are recorded but do not publish.</p>
            </div>
          </div>
        </Section>

        <Section id="start-read" h={H}>
          <p className={`${styles.prose} ${styles.prose2}`}>This is Napa as the review desk shows it. Each number matches a numbered note.{napaHidden ? " Public visitors see the smaller card below until a pharmacist approves the record." : ""}</p>
          <SnapshotBlock ctx={ctx} ids={[P.napa]} pills="inline">
            <div className={styles.annWrap}>
              <div className="window" role="img" aria-label="Annotated mockup of the Napa product page. The numbered notes beside it describe each part.">
                <div className="window-bar"><span className="window-dot" /><span className="window-dot" /><span className="window-dot" /><span className={styles.wbUrl}>drugdb.eliooo.org/products/{P.napa}</span></div>
                <div className={styles.np}>
                  <p className={`${styles.npCrumb} ${styles.row}`}><Ann n={1} />Products / {napa.tradeName}</p>
                  <div className={styles.npTitle}><Ann n={2} /><b>{napa.tradeName}</b><LivePill ctx={ctx} id={P.napa} /></div>
                  <p className={`${styles.npMeta} ${styles.row}`}><Ann n={3} />{napa.company}<span>{napa.dosageForm}</span><span>DAR <span className="mono">{napa.darNumber}</span></span></p>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={4} />Registered content, as DGDA wrote it</p>
                    <p><span className="raw">{napa.genericContentRaw}</span></p>
                  </div>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={5} />Clinical drug</p>
                    <p className={`${styles.npV} ${styles.row}`}><b>{napa.clinicalDrug}</b><span className="mono">{napa.bdcId}</span><span className={styles.small}>Route: {napa.route}</span></p>
                  </div>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={6} />Substance and codes</p>
                    <p className={styles.npIng}><b>{acet.name}</b><span className="mono">{acet.bdsId}</span><span className={styles.small}>DGDA calls it Paracetamol</span></p>
                    <div className="codes">
                      <CodeChip system="ICD11_XM" code={acet.codes.icd11} />
                      <CodeChip system="RXCUI" code={acet.codes.rxcui} />
                      <CodeChip system="ATC" code={acet.codes.atc[0]} />
                      <CodeChip system="DRUGBANK" code={acet.codes.drugbank} />
                      <CodeChip system="DDINTER" code={acet.entries[0].id} />
                    </div>
                  </div>
                  <div className={styles.npBlock}>
                    <p className={`${styles.npK} ${styles.row}`}><Ann n={7} />Interactions in DDInter 2.0</p>
                    <div className={styles.row}>
                      <Severity level="major" count={acet.drugDrug.major} />
                      <Severity level="moderate" count={acet.drugDrug.moderate} />
                      <Severity level="minor" count={acet.drugDrug.minor} />
                      <Severity level="unknown" count={acet.drugDrug.unknown} />
                    </div>
                    <p className={styles.small}>{acet.drugDrug.total} drug–drug records, {acet.disease} drug–disease, {acet.food} drug–food. <NeutralTag /></p>
                  </div>
                  <p className={styles.row}><Ann n={8} /><span className={buttonClass("tonal", "sm")}>Report a problem</span><span className={buttonClass("plain", "sm")}>DGDA source</span></p>
                </div>
              </div>
              <ol className={styles.legend} aria-label="What each numbered part means">
                <li><Ann n={1} /><div><b>Where you are</b><span className={styles.legendText}>Products, then the trade name. The address ends in the OCL concept id.</span></div></li>
                <li><Ann n={2} /><div><b>Trade name and review status</b><span className={styles.legendText}>The rounded pill is review status. "{NOT_REVIEWED}" means the record is hidden from the public.</span></div></li>
                <li><Ann n={3} /><div><b>Registration facts</b><span className={styles.legendText}>Company, dosage form and DAR number, copied from the DGDA register.</span></div></li>
                <li><Ann n={4} /><div><b>DGDA's own text</b><span className={styles.legendText}>Shown raw, so you can compare it with what we extracted.</span></div></li>
                <li><Ann n={5} /><div><b>Clinical drug</b><span className={styles.legendText}>Substance, strength, form and route. Every paracetamol 500 mg tablet brand shares <span className="mono">{napa.bdcId}</span>.</span></div></li>
                <li><Ann n={6} /><div><b>Substance and its codes</b><span className={styles.legendText}>Our permanent id <span className="mono">{acet.bdsId}</span> and the codes other systems use. Chapter 3 explains each.</span></div></li>
                <li><Ann n={7} /><div><b>Interaction summary</b><span className={styles.legendText}>Square chips are severity, each with its own shape. Unclassified pairs are counted on their own, never with Minor.</span></div></li>
                <li><Ann n={8} /><div><b>Actions</b><span className={styles.legendText}>Any signed-in visitor can report a problem. The source link opens the DGDA register entry.</span></div></li>
              </ol>
            </div>
          </SnapshotBlock>
          {napaHidden && (
            <figure className={styles.fig}>
              <div className={styles.pubMock} role="img" aria-label={`What a public visitor sees for Napa today: the name and ${NOT_REVIEWED}.`}>
                <div className={styles.npTitle}><b>{ctx.tradeName(P.napa)}</b><LivePill ctx={ctx} id={P.napa} /></div>
                <p className={styles.small}>A pharmacist checks every record before its contents appear here.</p>
              </div>
              <figcaption className={styles.figcap}>What a public visitor sees for Napa today.{ctx.apiStub && <> The API returns the same thing: the id, trade name, status <span className="mono">"not_reviewed"</span> and <span className="mono">hidden: true</span>.</>} It is never shown as "not found" or "no data".</figcaption>
            </figure>
          )}
        </Section>
      </Chapter>
    </>
  );
}
