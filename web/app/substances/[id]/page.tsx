import legacy from "@/app/legacy.module.css";
import { notFound } from "next/navigation";
import FlagForm from "@/components/FlagForm";
import { Badge } from "@/components/badges";
import { getSubstance, isHidden } from "@/lib/api";
import { NO_DATA_SENTENCE, NO_INTERACTION_TEXT, NO_MANAGEMENT, NOT_REVIEWED } from "@/lib/copy";
import { ddinterText } from "@/lib/ddinter-text";
import { firstParam } from "@/lib/params";
import { getSession } from "@/lib/session";
import { groupBySeverity, severityLabel, severityText } from "@/lib/severity";
export const dynamic = "force-dynamic";


export default async function SubstancePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams?: Promise<{ flag?: string | string[] }> }) {
  const { id } = await params;
  const flag = firstParam((await searchParams)?.flag);
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const session = await getSession();
  const s = await getSubstance(decoded);   // public scope for every session (spec §2.2)
  if (!s) notFound();
  const flagForm = <FlagForm session={session} targetType="substance" targetId={decoded} outcome={flag} />;
  // None of its products is approved (public scope): the API sent no data, and the page shows nothing but this.
  if (isHidden(s)) return <article><h1>{NOT_REVIEWED}</h1>{flagForm}</article>;
  const none = s.coverage.coverage !== "full";
  // For "none" the lists are empty because there is no data, not because nothing interacts.
  const empty = none ? "No data from DDInter for this substance." : "None listed in DDInter 2.0.";
  return (
    <article>
      <h1>{s.preferredName} <code>{s.bdsId}</code></h1>

      <section role="status" className={none ? legacy.bannerWarn : legacy.bannerInfo}>
        {none
          ? <p><strong>{NO_DATA_SENTENCE}</strong></p>
          : <p><strong>Interaction data: DDInter 2.0.</strong></p>}
        {s.coverage.note && !NO_DATA_SENTENCE.startsWith(s.coverage.note) && <p><small>{`Mapping note: ${s.coverage.note}`}</small></p>}
      </section>

      <h2>Names</h2>
      <table className={legacy.table}>
        <thead><tr><th>Name</th><th>Type</th><th>Source</th></tr></thead>
        <tbody>{s.names.map((n) => (
          <tr key={`${n.name}|${n.nameType}`}><td>{n.name}</td><td>{n.nameType}</td><td>{n.source}</td></tr>))}</tbody>
      </table>

      <h2>Codes</h2>
      <table className={legacy.table}>
        <thead><tr><th>System</th><th>Code</th><th>Route</th><th>Source</th><th>Method</th><th>Confidence</th></tr></thead>
        <tbody>{s.codes.map((c) => (
          <tr key={`${c.system}|${c.code}`}><td>{c.system}</td><td>{c.code}</td><td>{c.routeScope}</td><td>{c.source}</td>
            <td>{c.method}</td><td>{Number(c.confidence).toFixed(2)}</td></tr>))}</tbody>
      </table>

      <h2>Drug interactions</h2>
      {s.interactions.length === 0 ? <p>{empty}</p> : groupBySeverity(s.interactions).map(([sev, xs]) => (
        <section key={sev}>
          <h3>{`${severityLabel(sev)} (${xs.length})`}</h3>
          <table className={legacy.table}>
            <thead><tr><th>With</th><th>Actions</th><th>Entry route</th></tr></thead>
            <tbody>{xs.map((x, n) => (
              <tr key={`${x.partnerName}|${x.routeScope}|${n}`}>
                <td>{x.partnerBdsId
                  ? <a href={`/substances/${encodeURIComponent(x.partnerBdsId)}`}>{x.partnerName}</a>
                  : x.partnerName}</td>
                <td>{x.actions.join(", ")}</td>
                <td><Badge>{x.routeScope}</Badge></td>
              </tr>))}</tbody>
          </table>
        </section>))}

      <h2>Diseases</h2>
      {s.diseases.length === 0 ? <p>{empty}</p> : (
        <table className={legacy.table}>
          <thead><tr><th>Disease</th><th>Severity</th><th>Text</th></tr></thead>
          <tbody>{s.diseases.map((d) => (
            <tr key={`${d.interactionId}|${d.routeScope}`}><td>{d.diseaseName}</td><td>{severityText(d.severity)}</td>
              <td>{ddinterText(d.text) || NO_INTERACTION_TEXT}</td></tr>))}</tbody>
        </table>)}

      <h2>Foods</h2>
      {s.foods.length === 0 ? <p>{empty}</p> : (
        <table className={legacy.table}>
          <thead><tr><th>Food</th><th>Severity</th><th>Description</th><th>Management</th></tr></thead>
          <tbody>{s.foods.map((f) => (
            <tr key={`${f.interactionId}|${f.routeScope}`}><td>{f.food}</td><td>{severityText(f.severity)}</td>
              <td>{ddinterText(f.description) || NO_INTERACTION_TEXT}</td>
              <td>{ddinterText(f.management) || NO_MANAGEMENT}</td></tr>))}</tbody>
        </table>)}

      <h2>Products using it</h2>
      {s.products.length === 0 ? <p>No loaded product uses this substance.</p> : (
        <ul>{s.products.map((p) => (
          <li key={p.conceptId}><a href={`/products/${encodeURIComponent(p.conceptId)}`}>{p.tradeName}</a>{` (${p.company})`}</li>))}</ul>)}

      <p><small>Sources: DGDA register via OCL, RxNav, DDInter 2.0.</small></p>
      {flagForm}
    </article>
  );
}
