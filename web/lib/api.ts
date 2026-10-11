import "server-only";

export type Ingredient = { xmCode: string; name: string };
/** A DDInter entry chosen for the product's route; routeAssumed = the general entry stands in for the route. */
export type DdinterRef = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type ClinicalIngredient = {
  bdsId: string; name: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null; ddinter: DdinterRef[];
};
export type ClinicalDrug = { bdcId: string; displayName: string; doseForm: string; route: string; ingredients: ClinicalIngredient[] };
export type Product = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string;
  genericContentRaw: string; qualityFlag: string | null; ingredients: Ingredient[];
  parseStatus: "parsed" | "partial" | "failed" | null; parseNote: string | null; clinicalDrug: ClinicalDrug | null;
};
export type SearchResult = { items: Product[]; error: string | null };

const base = () => process.env.API_URL ?? "http://api:8080";

export async function searchProducts(q: string, page: number): Promise<SearchResult> {
  const term = q.trim();
  if (term.length < 2) return { items: [], error: null };
  const params = new URLSearchParams({ q: term, page: String(page) });
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/products?${params}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  } catch {
    return { items: [], error: "Search is temporarily unavailable. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { items: [], error: body?.errors?.[0]?.message ?? "Search failed" };
  if (!Array.isArray(body?.data)) return { items: [], error: "Search failed" };
  return { items: body.data, error: null };
}

export async function getProduct(id: string): Promise<Product | null> {
  const res = await fetch(`${base()}/v1/products/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Product;
}

export type StageResult = { stage: string; status: "ok" | "warn" | "fail"; note: string; evidence: unknown };
export type BatchItem = { conceptId: string; review: "pending" | "ok" | "issue"; note: string | null;
  extracted: Product | null; sourceJson: string | null; stages: StageResult[] };
export type Batch = { batchId: string; status: string; runAt: string; itemCount: number; items: BatchItem[] };

export async function listBatches(): Promise<Batch[]> {
  const res = await fetch(`${base()}/v1/batches`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch[];
}

export async function getBatch(id: string): Promise<Batch | null> {
  const res = await fetch(`${base()}/v1/batches/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch;
}

export type Substance = {
  bdsId: string; preferredName: string;
  names: { name: string; nameType: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; source: string; method: string; confidence: number }[];
  coverage: { coverage: "full" | "none"; note: string };
  products: { conceptId: string; tradeName: string; company: string }[];
  interactions: { partnerName: string; partnerBdsId: string | null; severity: string; actions: string[];
    interactionId: string | null; routeScope: string }[];
  diseases: { diseaseName: string; severity: string; text: string; refs: string[]; interactionId: string;
    routeScope: string }[];
  foods: { food: string; severity: string; mechanism: string | null; description: string; management: string;
    refs: string[]; interactionId: string; routeScope: string }[];
};

export async function getSubstance(id: string): Promise<Substance | null> {
  const res = await fetch(`${base()}/v1/substances/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Substance;
}

export type AlertSide = { conceptId: string; bdsId: string; name: string };
export type Alert = {
  severity: string; a: AlertSide; b: AlertSide; actions: string[]; interaction: string | null;
  management: string | null; routeAssumed: boolean; source: string;
};
export type CheckResult = {
  products: { conceptId: string; tradeName: string; substances: { bdsId: string | null; name: string; coverage: string }[] }[];
  alerts: Alert[];
  duplicates: { bdsId: string; name: string; conceptIds: string[] }[];
  /** Substances the checker has no interaction data for: never to be read as "no interactions". */
  noData: { conceptId: string; bdsId: string | null; name: string }[];
};
export type CheckOutcome = { result: CheckResult | null; error: string | null };

export async function checkInteractions(conceptIds: string[]): Promise<CheckOutcome> {
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/interactions/check`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptIds }),
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { result: null, error: "The interaction checker is temporarily unavailable. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { result: null, error: body?.errors?.[0]?.message ?? "Interaction check failed" };
  const d = body?.data;
  if (!d || !["products", "alerts", "duplicates", "noData"].every((k) => Array.isArray(d[k])))
    return { result: null, error: "Interaction check failed" };
  return { result: d as CheckResult, error: null };
}
