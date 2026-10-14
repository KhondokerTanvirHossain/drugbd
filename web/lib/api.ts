import "server-only";

/**
 * The BDDrug API client. Server-only: it reads INTERNAL_API_TOKEN, which must never reach a client bundle
 * (scripts/check-client-bundle.mjs fails the build if it does).
 *
 * Visibility (spec §2.2, Decision): every public page reads with `scope=public`, whatever the session, so a reviewer
 * sees exactly what a reader sees there. Public reads never send the internal token. Unapproved data is read only by
 * the reviewer pages, through token-gated endpoints.
 */

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
};
/** What the API returns under public scope for a record no pharmacist has approved: no data fields. */
export type HiddenProduct = { conceptId: string; tradeName?: string; reviewStatus: "pending" | "issue"; hidden: true };
export type HiddenSubstance = { bdsId: string; preferredName?: string; reviewStatus?: string; hidden: true };
export type SearchResult = { items: Product[]; error: string | null };

export function isHidden(x: unknown): x is { hidden: true } {
  return typeof x === "object" && x !== null && (x as { hidden?: unknown }).hidden === true;
}

const base = () => process.env.API_URL ?? "http://api:8080";
const MIN_TOKEN_LENGTH = 32;
const TOKEN_HEADER = "X-Internal-Token";

/** The internal API token, or null when it is not configured (the API refuses tokens under 32 characters). */
function internalToken(): string | null {
  const token = process.env.INTERNAL_API_TOKEN ?? "";
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

const read = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });

export async function searchProducts(q: string, page: number): Promise<SearchResult> {
  const term = q.trim();
  if (term.length < 2) return { items: [], error: null };
  const params = new URLSearchParams({ q: term, page: String(page), scope: "public" });
  let res: Response;
  try {
    res = await read(`${base()}/v1/products?${params}`);
  } catch {
    return { items: [], error: "Search is temporarily unavailable. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { items: [], error: body?.errors?.[0]?.message ?? "Search failed" };
  if (!Array.isArray(body?.data)) return { items: [], error: "Search failed" };
  return { items: body.data, error: null };
}

export async function getProduct(id: string): Promise<Product | HiddenProduct | null> {
  const res = await read(`${base()}/v1/products/${encodeURIComponent(id)}?scope=public`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Product | HiddenProduct;
}

export type LoadedProduct = { conceptId: string; tradeName: string; dosageForm: string };

/** The light product list for the checker's picker (approved products only), sorted by trade name. */
export async function listLoadedProducts(): Promise<LoadedProduct[]> {
  const res = await read(`${base()}/v1/products/loaded?scope=public`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!Array.isArray(data)) throw new Error("API error: no product list");
  return data as LoadedProduct[];
}

export type StageResult = { stage: string; status: "ok" | "warn" | "fail"; note: string; evidence: unknown };
export type BatchItem = { conceptId: string; review: ReviewStatus; note: string | null;
  extracted: Product | null; sourceJson: string | null; stages: StageResult[];
  /** The record's latest pipeline run; the review form echoes it so the API can refuse a decision on stale data. */
  extractedAt?: string | null;
  /** The newest decision's id (null when none); the review form echoes it as expectedLastDecisionId (§7.2 step 3). */
  lastDecisionId?: number | null };
export type Batch = { batchId: string; status: string; runAt: string; itemCount: number; items: BatchItem[] };

/** Batch evidence shows unreviewed records: reviewers only (A1). These reads carry the token and fail without one. */
async function reviewerRead(path: string): Promise<Response> {
  const token = internalToken();
  if (!token) throw new Error("The internal API token is not configured");
  return read(`${base()}${path}`, { [TOKEN_HEADER]: token });
}

export async function listBatches(): Promise<Batch[]> {
  const res = await reviewerRead("/v1/batches");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch[];
}

export async function getBatch(id: string): Promise<Batch | null> {
  const res = await reviewerRead(`/v1/batches/${encodeURIComponent(id)}`);
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

/** Reviewers only, with the token (A1). null for an unknown batch. */
export async function getBatchReport(id: string): Promise<BatchReport | null> {
  const res = await reviewerRead(`/v1/batches/${encodeURIComponent(id)}/report`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as BatchReport;
}

/** One decision as shown on the batch page: the role, never the reviewer's email. */
export type PublicDecision = { decision: "ok" | "issue"; note: string; role: string; decidedAt: string };

/**
 * The decision history, newest first. The API serves it only with the token (A2), and then includes emails; the
 * mapping keeps only the fields a page may show, so no email can reach a page.
 */
export async function getDecisions(batchId: string, conceptId: string): Promise<PublicDecision[]> {
  const res = await reviewerRead(`/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`);
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
  products: { conceptId: string; tradeName: string; company: string }[];
  interactions: { partnerName: string; partnerBdsId: string | null; severity: string; actions: string[];
    interactionId: string | null; routeScope: string }[];
  diseases: { diseaseName: string; severity: string; text: string | null; refs: string[]; interactionId: string;
    routeScope: string }[];
  foods: { food: string; severity: string; mechanism: string | null; description: string | null; management: string | null;
    refs: string[]; interactionId: string; routeScope: string }[];
};

export async function getSubstance(id: string): Promise<Substance | HiddenSubstance | null> {
  const res = await read(`${base()}/v1/substances/${encodeURIComponent(id)}?scope=public`);
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
  /** Products left out because no pharmacist has approved them yet: never to be read as "no interactions". */
  notReviewed: { conceptId: string }[];
};
export type CheckOutcome = { result: CheckResult | null; error: string | null };

export async function checkInteractions(conceptIds: string[]): Promise<CheckOutcome> {
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/interactions/check?scope=public`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptIds }),
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

export type WriteResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; field: string | null };

async function write<T>(path: string, payload: unknown): Promise<WriteResult<T>> {
  const token = internalToken();
  if (!token) return { ok: false, status: 0, error: "The internal API token is not configured", field: null };
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 0, error: "The API is unavailable", field: null };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: body?.errors?.[0]?.message ?? `API error ${res.status}`,
    field: body?.errors?.[0]?.field ?? null };
  return { ok: true, data: body?.data as T };
}

export type DecisionRequest = {
  decision: "ok" | "issue"; note: string; reviewerEmail: string; reviewerRole: "pharmacist" | "engineer";
  /** The version the page showed (spec §7.2): both required by the API, null when the item has none. */
  extractedAt: string | null;
  expectedLastDecisionId: number | null;
  /** A UUID rendered with the form and reused on every resend, so a retry is answered once (§7.2 step 1). */
  requestId: string;
};
export type DecisionOutcome = { review: string; displayStatus: string; batchStatus: string; replayed: boolean };

export async function postDecision(batchId: string, conceptId: string, d: DecisionRequest):
    Promise<WriteResult<DecisionOutcome>> {
  const payload = { decision: d.decision, note: d.note, reviewerEmail: d.reviewerEmail, reviewerRole: d.reviewerRole,
    extractedAt: d.extractedAt, expectedLastDecisionId: d.expectedLastDecisionId, requestId: d.requestId };
  const r = await write<DecisionOutcome>(
    `/v1/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(conceptId)}/decisions`, payload);
  return r.ok ? { ok: true, data: { review: r.data?.review, displayStatus: r.data?.displayStatus,
    batchStatus: r.data?.batchStatus, replayed: r.data?.replayed === true } } : r;
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

export type AuditEventRequest = {
  event: string; actorEmail: string | null; actorRole: string | null; targetType: string | null; targetId: string | null;
  outcome: string; requestId: string;
};
/** POST /v1/audit-events (§7.5). Never carries free text from forms. */
export async function postAuditEvent(e: AuditEventRequest): Promise<WriteResult<{ id: number }>> {
  return write<{ id: number }>("/v1/audit-events", e);
}
