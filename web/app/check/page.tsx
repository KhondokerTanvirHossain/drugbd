import FlagForm from "@/components/FlagForm";
import { Badge } from "@/components/badges";
import { checkInteractions, listLoadedProducts, scopeFor, type AlertSide, type CheckOutcome, type CheckResult } from "@/lib/api";
import { firstParam, listParam } from "@/lib/params";
import { getSession } from "@/lib/session";
import { groupBySeverity, severityLabel } from "@/lib/severity";
export const dynamic = "force-dynamic";

const MIN_SELECTED = 2, MAX_SELECTED = 20;   // the API accepts 2-20 unique product IDs
const FLAG_TARGET_MAX = 200;                 // the API's limit for a flag's targetId
const box = { border: "1px solid #ccc", borderRadius: 4, padding: 12, margin: "8px 0" } as const;

type Option = { conceptId: string; label: string };

/** The light product list (approved products only under public scope), sorted by the API. null when unavailable. */
async function loadOptions(scope: "public" | "all"): Promise<Option[] | null> {
  try {
    return (await listLoadedProducts(scope)).map((p) => ({ conceptId: p.conceptId, label: `${p.tradeName} (${p.dosageForm})` }));
  } catch {
    return null;
  }
}

/** The flag target for this check: the selected IDs, as many as fit the API's limit; "check" when none is selected. */
function flagTarget(ids: string[]): string {
  let target = "";
  for (const id of ids) {
    const next = target ? `${target},${id}` : id;
    if (next.length > FLAG_TARGET_MAX) break;
    target = next;
  }
  return target || "check";
}

export default async function CheckPage({ searchParams }: {
  searchParams: Promise<{ ids?: string | string[]; flag?: string | string[] }> }) {
  const sp = await searchParams;
  const ids = listParam(sp.ids);
  const session = await getSession();
  const scope = scopeFor(session);
  const checkable = ids.length >= MIN_SELECTED && ids.length <= MAX_SELECTED;
  const [options, outcome] = await Promise.all([
    loadOptions(scope),
    checkable ? checkInteractions(ids, scope) : Promise.resolve<CheckOutcome | null>(null),
  ]);
  const selected = new Set(ids);
  const known = new Set((options ?? []).map((o) => o.conceptId));
  // Selected IDs that are not in the list (e.g. from a shared link) stay in the form so the selection round-trips.
  const shown = [...(options ?? []), ...ids.filter((id) => !known.has(id)).map((id) => ({ conceptId: id, label: id }))];

  return (
    <>
      <h1>Interaction checker</h1>
      <form method="get" action="/check">
        <fieldset>
          <legend>{scope === "all" ? "Loaded products (reviewer view: includes unreviewed products)" : "Products reviewed by a pharmacist"}</legend>
          {options === null && <p role="alert">The product list is temporarily unavailable.</p>}
          {options !== null && shown.length === 0 && <p>No reviewed products yet.</p>}
          {shown.map((o) => (
            <div key={o.conceptId}>
              <label>
                <input type="checkbox" name="ids" value={o.conceptId} defaultChecked={selected.has(o.conceptId)} />
                {` ${o.label}`}
              </label>
            </div>))}
        </fieldset>
        <button type="submit">Check interactions</button>
      </form>

      {ids.length < MIN_SELECTED && <p>Select at least two products to check.</p>}
      {ids.length > MAX_SELECTED && <p>Select at most 20 products to check.</p>}
      {outcome?.error && <p role="alert">{outcome.error}</p>}
      {outcome?.result && <Results r={outcome.result} />}
      <FlagForm session={session} targetType="check" targetId={flagTarget(ids)} outcome={firstParam(sp.flag)} />
    </>
  );
}

function Results({ r }: { r: CheckResult }) {
  const tradeName = new Map(r.products.map((p) => [p.conceptId, p.tradeName]));
  const product = (conceptId: string) => tradeName.get(conceptId) ?? conceptId;
  const side = (s: AlertSide) => `${s.name} (${product(s.conceptId)})`;
  const substance = (bdsId: string | null, name: string) =>
    bdsId ? <a href={`/substances/${encodeURIComponent(bdsId)}`}>{name}</a> : <>{name}</>;
  return (
    <>
      <p>{`Checked: ${r.products.map((p) => p.tradeName).join(", ")}`}</p>

      <h2>Interactions</h2>
      {r.alerts.length === 0 && (r.noData.length > 0 || r.notReviewed.length > 0
        ? <p>No alerts for the substances DDInter 2.0 covers. Substances without data and products not yet reviewed are
            listed below.</p>
        : <p>DDInter 2.0 lists no interactions between the selected products.</p>)}
      {groupBySeverity(r.alerts).map(([sev, alerts]) => (
        <section key={sev}>
          <h3>{`${severityLabel(sev)} (${alerts.length})`}</h3>
          {alerts.map((a, n) => (
            <div key={n} style={box}>
              <p><strong>{`${side(a.a)} + ${side(a.b)}`}</strong> <Badge>{a.severity}</Badge></p>
              {a.actions.length > 0 && <p>{`Actions: ${a.actions.join(", ")}`}</p>}
              <p>{a.interaction ?? "Interaction text not available from DDInter."}</p>
              {a.management && <p>{`Management: ${a.management}`}</p>}
              {a.routeAssumed && <p><small>Route assumed: the general DDInter entry was used for at least one of these products.</small></p>}
              <p><small>{`Source: ${a.source}`}</small></p>
            </div>))}
        </section>))}

      {r.duplicates.length > 0 && (<>
        <h2>Same substance in more than one product</h2>
        <ul>{r.duplicates.map((d) => (
          <li key={d.bdsId}>{substance(d.bdsId, d.name)}{`: ${d.conceptIds.map(product).join(", ")}`}</li>))}</ul>
      </>)}

      {r.notReviewed.length > 0 && (<>
        <h2>Not yet reviewed</h2>
        <p>These products are not yet reviewed by a pharmacist, so they were not checked. This does not mean it is safe to
          combine them.</p>
        <ul>{r.notReviewed.map((n) => <li key={n.conceptId}>{n.conceptId}</li>)}</ul>
      </>)}

      {r.noData.length > 0 && (<>
        <h2>No interaction data</h2>
        <p>No interaction data in DDInter for the substances below. This does not mean it is safe to combine.</p>
        <ul>{r.noData.map((d, n) => (
          <li key={`${d.conceptId}|${d.bdsId ?? d.name}|${n}`}>
            {substance(d.bdsId, d.name)}{` in ${product(d.conceptId)}`}{d.bdsId ? "" : " (no substance mapping)"}
          </li>))}</ul>
      </>)}
    </>
  );
}
