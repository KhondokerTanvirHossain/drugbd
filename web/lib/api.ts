import "server-only";

/**
 * The BDDrug API client. Server-only: it reads INTERNAL_API_TOKEN, which must never reach a client bundle
 * (scripts/check-client-bundle.mjs fails the build if it does).
 *
 * Visibility: anonymous visitors (and signed-in users with role `user`) read with `scope=public`, which returns approved
 * records only. Pharmacists and engineers read with `scope=all`, which the API grants only with the internal token.
 */

export type Scope = "public" | "all";
export type ReviewStatus = "pending" | "ok" | "issue";

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
  /** The product's current review; served under scope=all so reviewers can see what is not approved yet. */
  reviewStatus?: ReviewStatus | null;
};
/** What the API returns under public scope for a record no pharmacist has approved: no data fields. */
export type HiddenProduct = { conceptId: string; tradeName?: string; reviewStatus: "pending" | "issue"; hidden: true };
export type HiddenSubstance = { bdsId: string; preferredName?: string; reviewStatus?: string; hidden: true };
export type SearchResult = { items: Product[]; error: string | null };

export function isHidden(x: unknown): x is { hidden: true } {
  return typeof x === "object" && x !== null && (x as { hidden?: unknown }).hidden === true;
}

/** Reviewers (pharmacist, engineer) read everything; everyone else reads approved records only. */
export function scopeFor(session: { role: string } | null): Scope {
  return session?.role === "pharmacist" || session?.role === "engineer" ? "all" : "public";
}

const base = () => process.env.API_URL ?? "http://api:8080";
const MIN_TOKEN_LENGTH = 32;
const TOKEN_HEADER = "X-Internal-Token";

/** The internal API token, or null when it is not configured (the API refuses tokens under 32 characters). */
function internalToken(): string | null {
  const token = process.env.INTERNAL_API_TOKEN ?? "";
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

/**
 * The scope actually requested and its headers. `all` without a configured token falls back to `public`:
 * a misconfigured server shows reviewers less, never anonymous visitors more.
 */
function scoped(scope: Scope): { scope: Scope; headers: Record<string, string> } {
  const token = scope === "all" ? internalToken() : null;
  return token ? { scope: "all", headers: { [TOKEN_HEADER]: token } } : { scope: "public", headers: {} };
}

const read = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });

export async function searchProducts(q: string, page: number, scope: Scope = "public"): Promise<SearchResult> {
  const term = q.trim();
  if (term.length < 2) return { items: [], error: null };
  const s = scoped(scope);
  const params = new URLSearchParams({ q: term, page: String(page), scope: s.scope });
  let res: Response;
  try {
    res = await read(`${base()}/v1/products?${params}`, s.headers);
  } catch {
    return { items: [], error: "Search is temporarily unavailable. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { items: [], error: body?.errors?.[0]?.message ?? "Search failed" };
  if (!Array.isArray(body?.data)) return { items: [], error: "Search failed" };
  return { items: body.data, error: null };
}

export async function getProduct(id: string, scope: Scope = "public"): Promise<Product | HiddenProduct | null> {
  const s = scoped(scope);
  const res = await read(`${base()}/v1/products/${encodeURIComponent(id)}?scope=${s.scope}`, s.headers);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Product | HiddenProduct;
}

export type LoadedProduct = { conceptId: string; tradeName: string; dosageForm: string };

/** The light product list for the checker's picker, sorted by trade name. Public scope: approved products only. */
export async function listLoadedProducts(scope: Scope = "public"): Promise<LoadedProduct[]> {
  const s = scoped(scope);
  const res = await read(`${base()}/v1/products/loaded?scope=${s.scope}`, s.headers);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no product list");
  return data as LoadedProduct[];
}

export type StageResult = { stage: string; status: "ok" | "warn" | "fail"; note: string; evidence: unknown };
export type BatchItem = { conceptId: string; review: ReviewStatus; note: string | null;
  extracted: Product | null; sourceJson: string | null; stages: StageResult[];
  /** The record's latest pipeline run; the review form echoes it so the API can refuse a decision on stale data. */
  extractedAt?: string | null };
export type Batch = { batchId: string; status: string; runAt: string; itemCount: number; items: BatchItem[] };

export async function listBatches(): Promise<Batch[]> {
  const res = await read(`${base()}/v1/batches`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch[];
}

export async function getBatch(id: string): Promise<Batch | null> {
  const res = await read(`${base()}/v1/batches/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch;
}

export type StageCounts = { ok: number; warn: number; fail: number };
export type ItemNote = { conceptId: string; stage: string; note: string };
export type BatchRun = { id?: number; runAt: string; stages: string[]; counts: Record<string, StageCounts>; conceptIds: string[] };
export type BatchReport = {
  counts: Record<string, StageCounts>;
  review: { pending: number; ok: number; issue: number };
  warnings: ItemNote[];
  fails: ItemNote[];
  /** The last 5 pipeline runs; conceptIds is empty for a full run. */
  runs: BatchRun[];
  /** Latest full run minus the one before, per stage; null when there are fewer than two full runs. */
  deltaVsPrevious: Record<string, StageCounts> | null;
};

/** Public evidence: read without the token. null for an unknown batch. */
export async function getBatchReport(id: string): Promise<BatchReport | null> {
  const res = await read(`${base()}/v1/batches/${encodeURIComponent(id)}/report`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as BatchReport;
}

/** One decision as shown on the batch page: the role, never the reviewer's email. */
export type PublicDecision = { decision: "ok" | "issue"; note: string; role: string; decidedAt: string };

/**
 * The decision history, newest first. Always read WITHOUT the token, so the API never sends emails here; the
 * mapping below keeps only the public fields even if a future API version sent more.
 */
export async function getDecisions(batchId: string, conceptId: string): Promise<PublicDecision[]> {
  const res = await read(`${base()}/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no decision list");
  return data.map((d: PublicDecision) => ({ decision: d.decision, note: d.note ?? "", role: d.role, decidedAt: d.decidedAt }));
}

export type Substance = {
  bdsId: string; preferredName: string;
  names: { name: string; nameType: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; source: string; method: string; confidence: number }[];
  coverage: { coverage: "full" | "none"; note: string };
  products: { conceptId: string; tradeName: string; company: string; reviewStatus?: ReviewStatus | null }[];
  interactions: { partnerName: string; partnerBdsId: string | null; severity: string; actions: string[];
    interactionId: string | null; routeScope: string }[];
  diseases: { diseaseName: string; severity: string; text: string; refs: string[]; interactionId: string;
    routeScope: string }[];
  foods: { food: string; severity: string; mechanism: string | null; description: string; management: string;
    refs: string[]; interactionId: string; routeScope: string }[];
};

export async function getSubstance(id: string, scope: Scope = "public"): Promise<Substance | HiddenSubstance | null> {
  const s = scoped(scope);
  const res = await read(`${base()}/v1/substances/${encodeURIComponent(id)}?scope=${s.scope}`, s.headers);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Substance | HiddenSubstance;
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
  /** Products left out because no pharmacist has approved them yet (public scope): never to be read as "no interactions". */
  notReviewed: { conceptId: string }[];
};
export type CheckOutcome = { result: CheckResult | null; error: string | null };

export async function checkInteractions(conceptIds: string[], scope: Scope = "public"): Promise<CheckOutcome> {
  const s = scoped(scope);
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/interactions/check?scope=${s.scope}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...s.headers }, body: JSON.stringify({ conceptIds }),
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { result: null, error: "The interaction checker is temporarily unavailable. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { result: null, error: body?.errors?.[0]?.message ?? "Interaction check failed" };
  const d = body?.data;
  if (!d || !["products", "alerts", "duplicates", "noData", "notReviewed"].every((k) => Array.isArray(d[k])))
    return { result: null, error: "Interaction check failed" };
  return { result: d as CheckResult, error: null };
}

// ---- Writes: every one carries the internal token; the web server makes them only from checked server actions. ----

export type WriteResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function write<T>(path: string, payload: unknown): Promise<WriteResult<T>> {
  const token = internalToken();
  if (!token) return { ok: false, status: 0, error: "The internal API token is not configured" };
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 0, error: "The API is unavailable" };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: body?.errors?.[0]?.message ?? `API error ${res.status}` };
  return { ok: true, data: body?.data as T };
}

export type DecisionRequest = {
  decision: "ok" | "issue"; note: string; reviewerEmail: string; reviewerRole: "pharmacist" | "engineer";
  /**
   * The item's extractedAt as shown on the page (null when it has none). Required by the API: it refuses (409) a
   * decision when the record was re-run since, and (400) a body without the field.
   */
  extractedAt: string | null;
};

export async function postDecision(batchId: string, conceptId: string, d: DecisionRequest):
    Promise<WriteResult<{ review: string; batchStatus: string }>> {
  const payload = { decision: d.decision, note: d.note, reviewerEmail: d.reviewerEmail, reviewerRole: d.reviewerRole,
    extractedAt: d.extractedAt };
  const r = await write<{ review: string; batchStatus: string }>(
    `/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`, payload);
  return r.ok ? { ok: true, data: { review: r.data?.review, batchStatus: r.data?.batchStatus } } : r;
}

export type FlagTarget = "product" | "substance" | "check";
export type FlagRequest = { targetType: FlagTarget; targetId: string; message: string; reporterEmail: string };
/** A flag as the /flags page shows it: no reporter or resolver email. */
export type Flag = { id: number; targetType: string; targetId: string; message: string; status: string; createdAt: string };

export async function createFlag(f: FlagRequest): Promise<WriteResult<unknown>> {
  return write<unknown>("/v1/flags", f);
}

/** Open (or resolved) flags; needs the token. Emails are dropped here so no page can render them. */
export async function listFlags(status: "open" | "resolved" = "open"): Promise<Flag[]> {
  const token = internalToken();
  if (!token) throw new Error("The internal API token is not configured");
  const res = await read(`${base()}/v1/flags?status=${status}`, { [TOKEN_HEADER]: token });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no flag list");
  return data.map((f: Flag) => ({ id: f.id, targetType: f.targetType, targetId: f.targetId, message: f.message,
    status: f.status, createdAt: f.createdAt }));
}

export async function resolveFlag(id: number, resolvedBy: string): Promise<WriteResult<unknown>> {
  return write<unknown>(`/v1/flags/${encodeURIComponent(String(id))}/resolve`, { resolvedBy });
}
