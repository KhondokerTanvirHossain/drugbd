import { DESK_NEW, fill } from "@/lib/copy";
import { fmtDhaka, fmtUtc } from "@/lib/format";
import { DESK, STAGE_NAME } from "@/lib/review-copy";
import { STAGE_KEYS, type ReviewItem } from "@/lib/review-types";

const WORD = { ok: "OK", warn: "Warning", fail: "Failed" } as const;
const json = (v: unknown) => JSON.stringify(v, null, 2);

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
    </>
  );
}
