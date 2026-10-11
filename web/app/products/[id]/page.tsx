import { notFound } from "next/navigation";
import { Badge } from "@/components/badges";
import { getProduct, type DdinterRef } from "@/lib/api";
import { formatStrength } from "@/lib/format";
export const dynamic = "force-dynamic";

const ddinterLabel = (d: DdinterRef) =>
  `${d.ddinterId} ${d.name ?? ""}`.trim() + (d.routeAssumed ? " (route assumed: general entry)" : "");

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const p = await getProduct(decoded);
  if (!p) notFound();
  const cd = p.clinicalDrug;
  const parse = p.parseStatus ? (p.parseNote ? `${p.parseStatus}: ${p.parseNote}` : p.parseStatus) : "not parsed yet";
  return (
    <article>
      <h1>{p.tradeName}</h1>
      <dl>
        <dt>DAR number</dt><dd>{p.darNumber}</dd>
        <dt>Company</dt><dd>{p.company}</dd>
        <dt>Dosage form</dt><dd>{p.dosageForm}</dd>
        <dt>Generic content (as registered)</dt><dd>{p.genericContentRaw}</dd>
        <dt>Content parse</dt><dd>{parse}</dd>
        {p.qualityFlag && (<><dt>DGDA quality flag</dt><dd>{p.qualityFlag}</dd></>)}
      </dl>
      <h2>Active ingredients</h2>
      {(p.ingredients ?? []).length === 0
        ? <p>No ingredient mapping from DGDA.</p>
        : <ul>{p.ingredients.map((i) => <li key={i.xmCode}>{i.name} <code>ICD-11 {i.xmCode}</code></li>)}</ul>}
      <h2>Clinical drug</h2>
      {cd ? (<>
        <p>{cd.displayName} <code>{cd.bdcId}</code> <Badge>{cd.route}</Badge></p>
        <p><small>{`Dose form: ${cd.doseForm}`}</small></p>
        <ul>{cd.ingredients.map((i) => (
          <li key={i.bdsId}>
            <a href={`/substances/${encodeURIComponent(i.bdsId)}`}>{i.name}</a>{` ${formatStrength(i)}`.trimEnd()}
            <br /><small>{i.ddinter.length === 0
              ? "No DDInter entry for this route: no interaction data."
              : `DDInter: ${i.ddinter.map(ddinterLabel).join("; ")}`}</small>
          </li>))}</ul>
      </>) : <p>No clinical drug yet.</p>}
      <p><small>Source: DGDA register via national OCL terminology server. DDInter entries: DDInter 2.0.</small></p>
    </article>
  );
}
