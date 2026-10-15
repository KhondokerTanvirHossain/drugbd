import { Fragment } from "react";
import Severity from "@/components/ui/Severity";
import StageCheck from "@/components/ui/StageCheck";
import { NO_DATA_SENTENCE, P1C_COPY, fill } from "@/lib/copy";
import { fmtUtc } from "@/lib/format";
import { DESK, STAGE_NAME, plural } from "@/lib/review-copy";
import { STAGE_KEYS, type PartnerScope, type ReviewItem, type ReviewStage } from "@/lib/review-types";
import StagePairs from "../desk/StagePairs";
import s from "./detail.module.css";

type Shown = { name: string; status: "ok" | "warn" | "fail"; stage: ReviewStage | null };

/** §5.5.3 "Automated checks". Notes come structured from the API (D13); the web never parses them. */
export default function AutomatedChecks({ item }: { item: ReviewItem }) {
  const noData = item.ingredients.some((g) => g.coverage.coverage === "none");
  const shown: Shown[] = STAGE_KEYS.map((k) => {
    const st = item.stages.find((x) => x.stage === k) ?? null;
    return { name: STAGE_NAME[k], status: st ? st.status : "fail", stage: st };
  });
  const ok = shown.filter((x) => x.status === "ok").length, w = shown.filter((x) => x.status === "warn").length;
  const f = shown.filter((x) => x.status === "fail").length;
  const summary = [ok ? `${ok} OK` : "", w ? `${w} ${plural(w, "warning", "warnings")}` : "", f ? `${f} failed` : ""].filter(Boolean).join(", ");
  const quiet = shown.filter((x) => x.status === "ok" && x.stage !== null && x.stage.notes.length === 0
    && !(x.stage.stage === "ddinter" && noData));
  const loud = shown.filter((x) => !quiet.includes(x));
  return (
    <section className={s.sec} aria-labelledby="sec-checks">
      <div className={s.secT}><h2 id="sec-checks">{DESK.checksTitle}</h2>
        <span>{summary}. {fill(DESK.checksRun, { date: fmtUtc(item.batch.runAt) })}</span></div>
      <div className={s.stages}>
        {loud.map((x) => <StageCheck key={x.name} name={x.name} status={x.status}>{body(x, item, noData)}</StageCheck>)}
        {quiet.length > 0 && <StageCheck name={quiet.map((x) => x.name).join(", ")} status="ok" />}
      </div>
    </section>
  );
}

/** §5.5.3 (P1C, PO D6): the notes in this order; the web reads partnerScope only, never inBatch. */
const SCOPES: [PartnerScope, string][] = [
  ["batch", DESK.textMissing], ["same_product", P1C_COPY.other.textMissingSame], ["other", P1C_COPY.other.textMissingOther],
];

function body(x: Shown, item: ReviewItem, noData: boolean) {
  if (x.stage === null) return <p className="stage-note">{DESK.noNote}</p>;
  const st = x.stage, ddinter = st.stage === "ddinter";
  const lines = st.notes.filter((n) => !(ddinter && (n.kind === "text_missing" || (noData && n.kind === "no_data"))));
  const groups = ddinter ? SCOPES.map(([scope, note]) => ({ scope, note, pairs: st.textMissing.filter((p) => p.partnerScope === scope) }))
    .filter((g) => g.pairs.length > 0) : [];
  return (
    <>
      {ddinter && noData && <p className="stage-note">{NO_DATA_SENTENCE}</p>}
      {groups.map(({ scope, note, pairs }) => {
        const listId = scope === "batch" ? `stage-pairs-${item.conceptId}` : `stage-pairs-${item.conceptId}-${scope}`;
        return (
          <Fragment key={scope}>
            <p className="stage-note">{fill(note, { n: pairs.length, pairs: plural(pairs.length, "pair", "pairs") })}</p>
            <StagePairs targetId={listId} count={pairs.length} fk={`pairs-${scope}`} />
            <ul className="stage-pairs" id={listId}>
              {pairs.map((p) => (
                <li className="stage-pair" key={`${p.ddinterA}/${p.ddinterB}`}>
                  {p.nameA} + {p.nameB} <span className="mono">{p.ddinterA}/{p.ddinterB}</span>{p.severity !== null && <Severity level={p.severity} />}
                </li>
              ))}
            </ul>
          </Fragment>
        );
      })}
      {lines.map((n, i) => <p className="stage-note" key={i}>{n.text}</p>)}
    </>
  );
}
