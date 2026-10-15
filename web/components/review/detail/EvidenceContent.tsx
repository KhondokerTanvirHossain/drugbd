import { Fragment } from "react";
import { SourceOf } from "@/components/ui/SourceLink";
import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, SHARED_WORDS, STAGE_NAME } from "@/lib/review-copy";
import { STAGE_KEYS, type ReviewItem, type Source } from "@/lib/review-types";

const WORD = { ok: "OK", warn: "Warning", fail: "Failed" } as const;
const json = (v: unknown) => JSON.stringify(v, null, 2);

/** §5.6.3 item 6: the source rows, in this order, by the code systems each source gives. */
const SOURCE_ROWS: [string, string[]][] = [
  [P1C_COPY.sources.rxnav, ["RXCUI", "SNOMEDCT"]], [P1C_COPY.sources.who, ["ATC"]], [SHARED_WORDS.drugbank, ["DRUGBANK"]],
  [SHARED_WORDS.icd11, ["ICD11_XM"]], [SHARED_WORDS.ddinter, ["DDINTER"]],
];
type SourceRow = { label: string; links: { code: string; source: Source }[] };

function sourceRows(item: ReviewItem): SourceRow[] {
  const rows: SourceRow[] = [];
  if (item.brand?.source) rows.push({ label: P1C_COPY.sources.dgda, links: [{ code: item.conceptId, source: item.brand.source }] });
  for (const [label, systems] of SOURCE_ROWS) {
    const seen = new Set<string>();
    const links: SourceRow["links"] = [];
    for (const g of item.ingredients)
      for (const c of g.codes)
        if (systems.includes(c.system) && c.source && !seen.has(`${c.system}:${c.code}`)) {
          seen.add(`${c.system}:${c.code}`);
          links.push({ code: c.code, source: c.source });
        }
    if (links.length > 0) rows.push({ label, links });
  }
  return rows;
}

/** §5.6.3 drawer body, rendered by the server (the desk only shows or hides it). */
export default function EvidenceContent({ item }: { item: ReviewItem }) {
  const at = item.version.extractedAt;
  return (
    <>
      <h5>{DESK.rawBrandRow}</h5>
      <p className="dr-note">{DESK.rawBrandNote}</p>
      <pre>{json(item.brand)}</pre>
      <h5>{DESK.dgdaCodes}</h5>
      <pre>{json(item.dgdaIngredients)}</pre>
      <details><summary>{DESK_NEW.deskMisc.rawDgdaRecord}</summary><pre>{json(item.sourceJson)}</pre></details>
      <h5>{DESK.pipelineNotes}</h5>
      <dl className="dr-dl">
        {STAGE_KEYS.map((k) => {
          const st = item.stages.find((x) => x.stage === k);
          const note = st?.notes.map((n) => n.text).join("; ") ?? "";
          return [
            <dt key={`t${k}`}>{STAGE_NAME[k]}</dt>,
            <dd key={`d${k}`}><span>{st ? WORD[st.status] : WORD.fail}</span>{note ? <span className="raw">{note}</span> : <span className="dr-note">{DESK.noNote}</span>}</dd>,
          ];
        })}
      </dl>
      <h5>{DESK.pipeline}</h5>
      <dl className="dr-dl">
        <dt>{DESK.conceptId}</dt><dd><span className="mono">{item.conceptId}</span></dd>
        {item.clinicalDrug && <><dt>{DESK.signature}</dt><dd><span className="mono">{item.clinicalDrug.signature}</span></dd></>}
        <dt>{DESK.extractedAt}</dt><dd>{at ? <>{fmtUtc(at)}<span className="dr-note">{fmtDhaka(at)}</span></> : DESK.noNote}</dd>
        <dt>{DESK.batchRun}</dt><dd>{fmtUtc(item.batch.runAt)}<span className="dr-note">{fill(DESK.batchRunSub, { id: item.batchId, n: item.batch.itemCount })}</span></dd>
      </dl>
      {sourceRows(item).length > 0 && (
        <>
          <h5>{SHARED_WORDS.sources}</h5>
          <p className="dr-note">{P1C_COPY.sources.sourcesNote}</p>
          <dl className="dr-dl">
            {sourceRows(item).map((row) => [
              <dt key={`t${row.label}`}>{row.label}</dt>,
              <dd key={`d${row.label}`}>{row.links.map((l, i) => (
                <Fragment key={`${l.code}${l.source.url}`}>{i > 0 && <br />}<span className="mono">{l.code}</span> <SourceOf source={l.source} /></Fragment>
              ))}</dd>,
            ])}
          </dl>
        </>
      )}
    </>
  );
}
