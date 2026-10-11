import { notFound } from "next/navigation";
import { StatusPill } from "@/components/badges";
import { getBatch, type StageResult } from "@/lib/api";
import { summariseSource } from "@/lib/evidence";
export const dynamic = "force-dynamic";

const cell = { verticalAlign: "top", border: "1px solid #ccc", padding: 8, width: "50%" } as const;
const stageCell = { verticalAlign: "top", border: "1px solid #ccc", padding: 6 } as const;
const STAGES = ["dgda", "substances", "clinical", "ddinter"] as const;

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

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const batch = await getBatch(decoded);
  if (!batch) notFound();
  const issues = batch.items.filter((i) => i.review === "issue").length;
  return (
    <>
      <h1>Batch {batch.batchId}</h1>
      <p>Status: {batch.status} · {batch.itemCount} requested · {issues} issue(s) · run {batch.runAt} UTC</p>
      <p><small>Left: exactly what the DGDA register returned. Right: what we extracted. Report mismatches in the review sheet.</small></p>
      {batch.items.map((item) => {
        const src = summariseSource(item.sourceJson);
        const p = item.extracted;
        return (
          <section key={item.conceptId} id={item.conceptId}>
            <h2>{item.conceptId} <small>[{item.review}{item.note ? `: ${item.note}` : ""}]</small></h2>
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
          </section>
        );
      })}
    </>
  );
}
