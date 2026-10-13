import { notFound } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import { StatusPill } from "@/components/badges";
import { ISSUE_NOTE_MIN, NOTE_MAX } from "@/lib/actions-core";
import {
  getBatch, getBatchReport, getDecisions, type BatchReport, type PublicDecision, type StageCounts, type StageResult,
} from "@/lib/api";
import { summariseSource } from "@/lib/evidence";
import { formatUtc } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { ROLE_LABEL, isReviewer, type Role } from "@/lib/reviewers";
import { reviewAction } from "@/lib/review-actions";
import { getSession } from "@/lib/session";
export const dynamic = "force-dynamic";

const cell = { verticalAlign: "top", border: "1px solid #ccc", padding: 8, width: "50%" } as const;
const stageCell = { verticalAlign: "top", border: "1px solid #ccc", padding: 6 } as const;
const STAGES = ["dgda", "substances", "clinical", "ddinter"] as const;

/** Fixed messages for the review action's outcome codes; anything else in the URL is ignored. */
const REVIEW_OUTCOME: Record<string, { text: string; ok: boolean }> = {
  saved: { text: "Your decision was recorded.", ok: true },
  forbidden: { text: "Only pharmacists and engineers can review. Sign in with a reviewer account.", ok: false },
  captcha: { text: "The verification check failed. Please try again.", ok: false },
  invalid: { text: `An issue needs a note of ${ISSUE_NOTE_MIN} to ${NOTE_MAX} characters.`, ok: false },
  stale: { text: "This record was re-run after you opened the page, so your decision was not recorded. Review the new result.", ok: false },
  failed: { text: "The decision could not be saved. Please try again.", ok: false },
};

const approvalLabel = (status: string) => status === "approved" ? "approved" : status === "in_review" ? "in review" : status;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : "0");
const deltaText = (d: StageCounts | undefined) => d ? `${signed(d.ok)} / ${signed(d.warn)} / ${signed(d.fail)}` : "\u2014";
const roleLabel = (role: string) => ROLE_LABEL[role as Role] ?? "Reviewer";
/** Pipeline stages first, in order, then any other stage by name. */
const stageOrder = (names: string[]) => [...new Set(names)].sort((a, b) => {
  const ia = (STAGES as readonly string[]).indexOf(a), ib = (STAGES as readonly string[]).indexOf(b);
  return (ia < 0 ? STAGES.length : ia) - (ib < 0 ? STAGES.length : ib) || a.localeCompare(b);
});

function Report({ report }: { report: BatchReport | null }) {
  if (!report) return <p role="alert">The batch report is temporarily unavailable.</p>;
  const delta = report.deltaVsPrevious ?? {};
  const hasDelta = Object.keys(delta).length > 0;
  const stages = stageOrder([...Object.keys(report.counts ?? {}), ...Object.keys(delta)]);
  const notes = (title: string, list: BatchReport["warnings"]) => (<>
    <h3>{`${title} (${list.length})`}</h3>
    {list.length === 0 ? <p>None.</p> : <ul>{list.map((w, n) => (
      <li key={`${w.conceptId}|${w.stage}|${n}`}><a href={`#${w.conceptId}`}>{w.conceptId}</a>{` · ${w.stage}: ${w.note}`}</li>))}</ul>}
  </>);
  return (
    <section>
      <h2>Batch report</h2>
      <p>{`Review: ${report.review.ok} OK · ${report.review.issue} issue · ${report.review.pending} pending`}</p>
      <table style={{ borderCollapse: "collapse" }}>
        <thead><tr><th>Stage</th><th>OK</th><th>Warn</th><th>Fail</th><th>Change vs previous full run (ok / warn / fail)</th></tr></thead>
        <tbody>{stages.map((name) => {
          const c = report.counts?.[name] ?? { ok: 0, warn: 0, fail: 0 };
          return <tr key={name}><td>{name}</td><td>{c.ok}</td><td>{c.warn}</td><td>{c.fail}</td><td>{deltaText(delta[name])}</td></tr>;
        })}</tbody>
      </table>
      {!hasDelta && <p><small>No previous full run to compare with.</small></p>}
      {notes("Warnings", report.warnings ?? [])}
      {notes("Fails", report.fails ?? [])}
      {(report.runs ?? []).length > 0 && (
        <details><summary>Recent runs</summary><ul>{report.runs.map((r, n) => (
          <li key={n}>{`${formatUtc(r.runAt)}: ${r.stages.join(", ")} · ${r.conceptIds.length === 0
            ? "full run" : `records ${r.conceptIds.join(", ")}`}`}</li>))}</ul></details>)}
    </section>
  );
}

/** Decision, role and time; never the reviewer's email (the API is read without the token, so it sends none). */
function History({ decisions }: { decisions: PublicDecision[] | null }) {
  return (<>
    <h3>Review history</h3>
    {decisions === null ? <p>The review history is temporarily unavailable.</p>
      : decisions.length === 0 ? <p>No decisions yet.</p>
      : <ul>{decisions.map((d, n) => (
        <li key={n}>{`${d.decision === "ok" ? "OK" : "Issue"} · ${roleLabel(d.role)} · ${formatUtc(d.decidedAt)}${d.note ? `: ${d.note}` : ""}`}</li>))}</ul>}
  </>);
}

function ItemFields({ batchId, conceptId, extractedAt, decision }:
    { batchId: string; conceptId: string; extractedAt: string | null | undefined; decision: "ok" | "issue" }) {
  return (<>
    <input type="hidden" name="batchId" value={batchId} />
    <input type="hidden" name="conceptId" value={conceptId} />
    {/* Always present: "" stands for an item with no extractedAt (sent to the API as null). */}
    <input type="hidden" name="extractedAt" value={extractedAt ?? ""} />
    <input type="hidden" name="decision" value={decision} />
  </>);
}

/** Reviewer controls. The server action re-checks the session, the role and Turnstile before calling the API. */
function ReviewForms({ batchId, conceptId, extractedAt, role }:
    { batchId: string; conceptId: string; extractedAt: string | null | undefined; role: Role }) {
  return (
    <div>
      <form action={reviewAction}>
        <ItemFields batchId={batchId} conceptId={conceptId} extractedAt={extractedAt} decision="ok" />
        <Turnstile />
        <button type="submit">Mark OK</button>
      </form>
      <form action={reviewAction}>
        <ItemFields batchId={batchId} conceptId={conceptId} extractedAt={extractedAt} decision="issue" />
        <label>
          {`What is wrong? (${ISSUE_NOTE_MIN} to ${NOTE_MAX} characters)`}
          <br />
          <textarea name="note" required minLength={ISSUE_NOTE_MIN} maxLength={NOTE_MAX} rows={3} cols={60} />
        </label>
        <Turnstile />
        <button type="submit">Report issue</button>
      </form>
      {role === "engineer" && <p><small>An engineer&apos;s OK is recorded, but only a pharmacist&apos;s OK approves a record.</small></p>}
    </div>
  );
}

function Outcome({ code }: { code: string }) {
  const o = REVIEW_OUTCOME[code];
  return o ? <p role={o.ok ? "status" : "alert"}>{o.text}</p> : null;
}

function StageTable({ stages }: { stages: StageResult[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead><tr><th style={stageCell}>Stage</th><th style={stageCell}>Status</th><th style={stageCell}>Note</th></tr></thead>
      <tbody>{STAGES.map((name) => {
        const r = stages.find((x) => x.stage === name);
        return (
          <tr key={name}>
            <td style={stageCell}>{name}</td>
            <td style={stageCell}><StatusPill status={r?.status ?? null} /></td>
            <td style={stageCell}>{r ? (<>
              {r.note}
              <details><summary>Evidence</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(r.evidence ?? {}, null, 2)}</pre></details>
            </>) : "This stage has not run for this item."}</td>
          </tr>);
      })}</tbody>
    </table>
  );
}

export default async function BatchPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams?: Promise<{ review?: string | string[]; item?: string | string[] }> }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const batch = await getBatch(decoded);
  if (!batch) notFound();
  const session = await getSession();
  const reviewer = isReviewer(session) ? session : null;
  const [report, histories] = await Promise.all([
    getBatchReport(batch.batchId).catch(() => null),
    Promise.all(batch.items.map((i) => getDecisions(batch.batchId, i.conceptId).catch(() => null))),
  ]);
  const outcome = firstParam(sp.review), outcomeItem = firstParam(sp.item);
  const itemIds = new Set(batch.items.map((i) => i.conceptId));
  return (
    <>
      <h1>Batch {batch.batchId}</h1>
      <p>{`Approval: ${approvalLabel(batch.status)} · ${batch.itemCount} requested · run ${batch.runAt} UTC`}</p>
      <p><small>Left: exactly what the DGDA register returned. Right: what we extracted. Pharmacists and engineers mark
        each record OK or report an issue with it. A record is public once a pharmacist marks it OK.</small></p>
      {!itemIds.has(outcomeItem) && <Outcome code={outcome} />}
      <Report report={report} />
      {batch.items.map((item, n) => {
        const src = summariseSource(item.sourceJson);
        const p = item.extracted;
        return (
          <section key={item.conceptId} id={item.conceptId}>
            <h2>{item.conceptId} <small>[{item.review}{item.note ? `: ${item.note}` : ""}]</small></h2>
            {outcomeItem === item.conceptId && <Outcome code={outcome} />}
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
              <td style={cell}>
                <strong>Source (DGDA via OCL)</strong>
                {src ? (<>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(src.extras, null, 2)}</pre>
                  <ul>{src.ingredients.map((i, n) => <li key={`${i.code}-${n}`}>{i.name} <code>{i.code}</code>{i.retired ? " (retired)" : ""}</li>)}</ul>
                  <a href={src.oclUrl} rel="noopener noreferrer" target="_blank">Open original record</a>
                  <details><summary>Full raw JSON</summary><pre style={{ whiteSpace: "pre-wrap" }}>{item.sourceJson}</pre></details>
                </>) : <p>No source snapshot (not found at source).</p>}
              </td>
              <td style={cell}>
                <strong>Extracted</strong>
                {p ? (<dl>
                  <dt>Trade name</dt><dd>{p.tradeName}</dd>
                  <dt>DAR number</dt><dd>{p.darNumber}</dd>
                  <dt>Company</dt><dd>{p.company}</dd>
                  <dt>Dosage form</dt><dd>{p.dosageForm}</dd>
                  <dt>Generic content</dt><dd>{p.genericContentRaw}</dd>
                  <dt>Ingredients</dt><dd>{p.ingredients.length ? p.ingredients.map((i) => `${i.name} (${i.xmCode})`).join(", ") : "none mapped"}</dd>
                </dl>) : <p>Nothing extracted.</p>}
              </td>
            </tr></tbody></table>
            <StageTable stages={item.stages ?? []} />
            <History decisions={histories[n]} />
            {reviewer && <ReviewForms batchId={batch.batchId} conceptId={item.conceptId} extractedAt={item.extractedAt}
              role={reviewer.role} />}
          </section>
        );
      })}
    </>
  );
}
