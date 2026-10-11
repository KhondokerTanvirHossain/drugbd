import { notFound } from "next/navigation";
import { getProduct } from "@/lib/api";
export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProduct(decodeURIComponent(id));
  if (!p) notFound();
  return (
    <article>
      <h1>{p.tradeName}</h1>
      <dl>
        <dt>DAR number</dt><dd>{p.darNumber}</dd>
        <dt>Company</dt><dd>{p.company}</dd>
        <dt>Dosage form</dt><dd>{p.dosageForm}</dd>
        <dt>Generic content (as registered)</dt><dd>{p.genericContentRaw}</dd>
        {p.qualityFlag && (<><dt>DGDA quality flag</dt><dd>{p.qualityFlag}</dd></>)}
      </dl>
      <h2>Active ingredients</h2>
      {p.ingredients.length === 0
        ? <p>No ingredient mapping from DGDA.</p>
        : <ul>{p.ingredients.map((i) => <li key={i.xmCode}>{i.name} <code>ICD-11 {i.xmCode}</code></li>)}</ul>}
      <p><small>Source: DGDA register via national OCL terminology server.</small></p>
    </article>
  );
}
