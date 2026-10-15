import { P, PILOT_SNAPSHOT as S, substancesOf } from "@/content/learn/pilot-snapshot";
import s from "./learn.module.css";

/**
 * Board L's SVG diagrams as inline React components (§6.8): `role="img"`, `<title>` and `<desc>` verbatim. Pilot
 * values come from the snapshot, so a chapter wraps the diagrams that show them in a SnapshotBlock.
 */

function Arrowhead({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" className={s.svgAh} />
      </marker>
    </defs>
  );
}

/** Chapter 2: brand product, clinical drug, substance (Board L `#dg-entity`). */
export function EntityDiagram() {
  const napa = S.records[P.napa];
  const [acet] = substancesOf(P.napa);
  const [domp] = substancesOf(P.domperidone);
  return (
    <svg className={s.dgEntity} viewBox="0 0 960 424" role="img" aria-labelledby="dg-entity-t dg-entity-d">
      <title id="dg-entity-t">IntelliDrugs entity diagram</title>
      <desc id="dg-entity-d">Brand product is a clinical drug, many to one. A clinical drug contains one or more substances. A substance has many crosswalk codes, zero or more DDInter entries, and exactly one coverage value. A DDInter entry lists many interactions. A brand product is reviewed in batch records.</desc>
      <Arrowhead id="ah-e" />
      <rect x="0" y="0" width="960" height="424" className={s.svgBg} />
      <rect x="10" y="30" width="180" height="162" rx="12" className={s.svgKey} />
      <text x="24" y="56" className={s.svgT}>Brand product</text>
      <text x="24" y="78" className={s.svgS}>One DGDA-registered</text>
      <text x="24" y="96" className={s.svgS}>product: DAR number,</text>
      <text x="24" y="114" className={s.svgS}>trade name, company,</text>
      <text x="24" y="132" className={s.svgS}>form, content text</text>
      <text x="24" y="178" className={s.svgM}>{napa.tradeName}, {napa.darNumber}</text>
      <rect x="280" y="30" width="180" height="162" rx="12" className={s.svgKey} />
      <text x="294" y="56" className={s.svgT}>Clinical drug</text>
      <text x="294" y="78" className={s.svgS}>Substances with</text>
      <text x="294" y="96" className={s.svgS}>strengths, dose form</text>
      <text x="294" y="114" className={s.svgS}>and route. Shared by</text>
      <text x="294" y="132" className={s.svgS}>brands that match</text>
      <text x="294" y="178" className={s.svgM}>{napa.bdcId}</text>
      <rect x="550" y="30" width="180" height="162" rx="12" className={s.svgKey} />
      <text x="564" y="56" className={s.svgT}>Substance</text>
      <text x="564" y="78" className={s.svgS}>One active ingredient,</text>
      <text x="564" y="96" className={s.svgS}>one per ICD-11 XM</text>
      <text x="564" y="114" className={s.svgS}>code. Names: INN,</text>
      <text x="564" y="132" className={s.svgS}>local, RxNorm, DDInter</text>
      <text x="564" y="178" className={s.svgM}>{acet.bdsId}</text>
      <rect x="810" y="30" width="140" height="162" rx="12" className={s.svgBox} />
      <text x="824" y="56" className={s.svgT}>Crosswalk codes</text>
      <text x="824" y="78" className={s.svgS}>ICD-11 XM, RxCUI,</text>
      <text x="824" y="96" className={s.svgS}>ATC, DrugBank,</text>
      <text x="824" y="114" className={s.svgS}>SNOMED CT</text>
      <text x="824" y="178" className={s.svgM}>{acet.codes.atc[0]}</text>
      <rect x="10" y="284" width="180" height="124" rx="12" className={s.svgBox} />
      <text x="24" y="310" className={s.svgT}>Batch record</text>
      <text x="24" y="332" className={s.svgS}>Stage results,</text>
      <text x="24" y="350" className={s.svgS}>evidence and review</text>
      <text x="24" y="368" className={s.svgS}>decisions</text>
      <text x="24" y="394" className={s.svgM}>{S.batchId}</text>
      <rect x="280" y="284" width="180" height="124" rx="12" className={s.svgBox} />
      <text x="294" y="310" className={s.svgT}>Coverage</text>
      <text x="294" y="332" className={s.svgS}>full: DDInter has data</text>
      <text x="294" y="350" className={s.svgS}>none: no data, never</text>
      <text x="294" y="368" className={s.svgS}>read as safe</text>
      <text x="294" y="394" className={s.svgM}>none: {domp.name}</text>
      <rect x="550" y="284" width="180" height="124" rx="12" className={s.svgBox} />
      <text x="564" y="310" className={s.svgT}>DDInter entry</text>
      <text x="564" y="332" className={s.svgS}>One per route the</text>
      <text x="564" y="350" className={s.svgS}>substance appears in</text>
      <text x="564" y="394" className={s.svgM}>{acet.entries[0].id}, {acet.entries[0].route}</text>
      <rect x="810" y="284" width="140" height="124" rx="12" className={s.svgBox} />
      <text x="824" y="310" className={s.svgT}>Interactions</text>
      <text x="824" y="332" className={s.svgS}>drug–drug pairs,</text>
      <text x="824" y="350" className={s.svgS}>drug–disease,</text>
      <text x="824" y="368" className={s.svgS}>drug–food</text>
      <text x="824" y="394" className={s.svgM}>DDInter 2.0</text>
      <path d="M190 111H280" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="235" y="103" className={s.svgV} textAnchor="middle">is a</text>
      <text x="194" y="128" className={s.svgC}>many</text>
      <text x="276" y="128" className={s.svgC} textAnchor="end">1</text>
      <path d="M460 111H550" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="505" y="103" className={s.svgV} textAnchor="middle">contains</text>
      <text x="464" y="128" className={s.svgC}>1</text>
      <text x="546" y="128" className={s.svgC} textAnchor="end">1 or more</text>
      <path d="M730 111H810" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="770" y="103" className={s.svgV} textAnchor="middle">is coded as</text>
      <text x="734" y="128" className={s.svgC}>1</text>
      <text x="806" y="128" className={s.svgC} textAnchor="end">many</text>
      <path d="M100 192V284" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="108" y="242" className={s.svgV}>is reviewed in</text>
      <text x="108" y="210" className={s.svgC}>1</text>
      <text x="108" y="276" className={s.svgC}>many</text>
      <path d="M640 192V284" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="648" y="242" className={s.svgV}>is found in</text>
      <text x="648" y="210" className={s.svgC}>1</text>
      <text x="648" y="276" className={s.svgC}>0 or more</text>
      <path d="M730 346H810" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="770" y="338" className={s.svgV} textAnchor="middle">lists</text>
      <text x="734" y="362" className={s.svgC}>1</text>
      <text x="806" y="362" className={s.svgC} textAnchor="end">many</text>
      <path d="M590 192V242H370V284" className={s.svgE} markerEnd="url(#ah-e)" />
      <text x="480" y="234" className={s.svgV} textAnchor="middle">has</text>
      <text x="598" y="210" className={s.svgC}>1</text>
      <text x="378" y="276" className={s.svgC}>exactly 1</text>
    </svg>
  );
}

/** Chapter 3: how Napa's codes were matched (Board L `#dg-match`). */
export function MatchDiagram() {
  const [acet] = substancesOf(P.napa);
  return (
    <svg className={s.dgMatch} viewBox="0 0 900 200" role="img" aria-labelledby="dg-match-t dg-match-d">
      <title id="dg-match-t">How Napa's codes were matched</title>
      <desc id="dg-match-d">DGDA maps Napa to ICD-11 XM5DJ7 Acetaminophen, method xm. That gives substance BDS-000001. An exact name match in RxNav gives RxCUI 161, method rxnav-exact. The RxCUI gives ATC N02BE01, DrugBank DB00316 and SNOMED CT codes. The DDInter entry DDInter14 is confirmed because its DrugBank id is DB00316, method drugbank. Every step has confidence 1.00.</desc>
      <Arrowhead id="ah-m" />
      <rect x="0" y="0" width="900" height="200" className={s.svgBg} />
      <rect x="10" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="22" y="66" className={s.svgT}>DGDA register</text>
      <text x="22" y="94" className={s.svgM}>{acet.codes.icd11}</text>
      <text x="22" y="120" className={s.svgS}>{acet.name}</text>
      <rect x="195" y="40" width="140" height="104" rx="12" className={s.svgKey} />
      <text x="207" y="66" className={s.svgT}>Substance</text>
      <text x="207" y="94" className={s.svgM}>{acet.bdsId}</text>
      <text x="207" y="120" className={s.svgS}>minted once, kept</text>
      <rect x="380" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="392" y="66" className={s.svgT}>NLM RxNorm</text>
      <text x="392" y="94" className={s.svgM}>RxCUI {acet.codes.rxcui}</text>
      <text x="392" y="120" className={s.svgS}>exact name match</text>
      <rect x="565" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="577" y="66" className={s.svgT}>Codes from RxCUI</text>
      <text x="577" y="94" className={s.svgM}>{acet.codes.atc[0]}</text>
      <text x="577" y="120" className={s.svgS}>{acet.codes.drugbank}, SNOMED CT</text>
      <rect x="750" y="40" width="140" height="104" rx="12" className={s.svgBox} />
      <text x="762" y="66" className={s.svgT}>DDInter 2.0</text>
      <text x="762" y="94" className={s.svgM}>{acet.entries[0].id}</text>
      <text x="762" y="120" className={s.svgS}>DrugBank {acet.codes.drugbank}</text>
      <path d="M150 92H195" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="172.5" y="172" className={s.svgM} textAnchor="middle">xm</text>
      <path d="M335 92H380" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="357.5" y="172" className={s.svgM} textAnchor="middle">rxnav-exact</text>
      <path d="M520 92H565" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="542.5" y="172" className={s.svgM} textAnchor="middle">rxnav-exact</text>
      <path d="M705 92H750" className={s.svgE} markerEnd="url(#ah-m)" />
      <text x="727.5" y="172" className={s.svgM} textAnchor="middle">drugbank</text>
      <text x="10" y="24" className={s.svgLt}>Napa, step by step</text>
      <text x="890" y="196" className={s.svgS} textAnchor="end">method of each step, confidence 1.00</text>
    </svg>
  );
}

/** One box of the swimlane: a title line and a sub line, 9 px in from the left edge (Board L `#dg-swim`). */
function Lane({ x, y, w, title, sub, keyBox = false }: { x: number; y: number; w: number; title: string; sub: string; keyBox?: boolean }) {
  return (
    <>
      <rect x={x} y={y} width={w} height="46" rx="10" className={keyBox ? s.svgKey : s.svgBox} />
      <text x={x + 9} y={y + 19} className={s.svgC}>{title}</text>
      <text x={x + 9} y={y + 36} className={s.svgS}>{sub}</text>
    </>
  );
}

/**
 * Chapter 4: from batch file to public record (Board L `#dg-swim`). §1.6 item 14 changes the description's
 * "8-second undo window"; the "A, 8 s undo" box is a picture of the desk default and keeps it.
 */
export function SwimlaneDiagram({ notReviewed, undoWindow }: { notReviewed: string; undoWindow: string }) {
  return (
    <svg className={s.dgSwim} viewBox="0 0 840 520" role="img" aria-labelledby="dg-swim-t dg-swim-d">
      <title id="dg-swim-t">From batch file to public record</title>
      <desc id="dg-swim-d">{`A batch file of 10 concept ids enters the pipeline. Four stages run in order: DGDA load reads the DGDA register, Substances reads NLM RxNav, Clinical drug parses, DDInter reads DDInter 2.0. Every stage keeps its evidence, which signed-in reviewers see on the batch page. An engineer check is recorded but leaves the record hidden as ${notReviewed}. A pharmacist presses A and after the ${undoWindow} the record becomes public on the site, checker and API. An issue or a re-run sends the record back to the pipeline and back to review.`}</desc>
      <Arrowhead id="ah-s" />
      <rect x="0" y="0" width="840" height="520" className={s.svgBg} />
      <rect x="0" y="0" width="840" height="90" className={s.svgBand} />
      <path d="M0 90H840" className={s.svgSep} />
      <text x="14" y="43" className={s.svgLt}>Sources</text>
      <text x="14" y="60" className={s.svgS}>read only</text>
      <path d="M0 190H840" className={s.svgSep} />
      <text x="14" y="138" className={s.svgLt}>Pipeline</text>
      <text x="14" y="155" className={s.svgS}>runs in order</text>
      <rect x="0" y="190" width="840" height="90" className={s.svgBand} />
      <path d="M0 280H840" className={s.svgSep} />
      <text x="14" y="233" className={s.svgLt}>Evidence</text>
      <text x="14" y="250" className={s.svgS}>kept, reviewers only</text>
      <path d="M0 380H840" className={s.svgSep} />
      <text x="14" y="328" className={s.svgLt}>Review</text>
      <text x="14" y="345" className={s.svgS}>invited people</text>
      <rect x="0" y="380" width="840" height="90" className={s.svgBand} />
      <path d="M0 470H840" className={s.svgSep} />
      <text x="14" y="423" className={s.svgLt}>Public</text>
      <text x="14" y="440" className={s.svgS}>approved only</text>
      <path d="M106 0V470" className={s.svgSep} />
      <Lane x={222} y={22} w={96} title="DGDA register" sub="via OCL" />
      <Lane x={332} y={22} w={96} title="NLM RxNav" sub="RxCUI, codes" />
      <Lane x={552} y={22} w={96} title="DDInter 2.0" sub="interactions" />
      <Lane x={112} y={117} w={96} title="Batch file" sub="10 concept ids" keyBox />
      <Lane x={222} y={117} w={96} title="DGDA load" sub="stage 1" keyBox />
      <Lane x={332} y={117} w={96} title="Substances" sub="stage 2" keyBox />
      <Lane x={442} y={117} w={96} title="Clinical drug" sub="stage 3" keyBox />
      <Lane x={552} y={117} w={96} title="DDInter" sub="stage 4" keyBox />
      {["M208 140H222", "M318 140H332", "M428 140H442", "M538 140H552", "M270 68V117", "M380 68V117", "M600 68V117"].map((d) =>
        <path key={d} d={d} className={s.svgE} markerEnd="url(#ah-s)" />)}
      <rect x="222" y="212" width="426" height="46" rx="10" className={s.svgBox} />
      <text x="232" y="231" className={s.svgC}>Evidence for every record</text>
      <text x="232" y="248" className={s.svgS}>Raw DGDA JSON, every RxNav and DDInter response, stage results</text>
      {["M270 163V212", "M380 163V212", "M490 163V212", "M600 163V212"].map((d) => <path key={d} d={d} className={s.svgE} markerEnd="url(#ah-s)" />)}
      <Lane x={661} y={212} w={118} title="Batch page" sub="source + extraction" />
      <path d="M648 235H661" className={s.svgE} markerEnd="url(#ah-s)" />
      <Lane x={544} y={307} w={104} title="Engineer" sub="check recorded" />
      <Lane x={661} y={307} w={118} title="Pharmacist" sub="A, 8 s undo" keyBox />
      <path d="M720 258V307" className={s.svgE} markerEnd="url(#ah-s)" />
      <path d="M690 258V284H596V307" className={s.svgE} markerEnd="url(#ah-s)" />
      <Lane x={270} y={402} w={220} title="Hidden from public" sub={notReviewed} />
      <Lane x={661} y={402} w={118} title="Public record" sub="site, checker, API" keyBox />
      <path d="M596 353V425H490" className={s.svgE} markerEnd="url(#ah-s)" />
      <text x="588" y="398" className={s.svgS} textAnchor="end">engineer OK alone</text>
      <path d="M720 353V402" className={s.svgE} markerEnd="url(#ah-s)" />
      <text x="728" y="384" className={s.svgS}>approved</text>
      <path d="M720 448V500H160V163" className={s.svgLoop} markerEnd="url(#ah-s)" />
      <text x="440" y="492" className={s.svgS} textAnchor="middle">Issue reported, or the record is re-run: fix, test, run again. It goes back to review.</text>
    </svg>
  );
}
