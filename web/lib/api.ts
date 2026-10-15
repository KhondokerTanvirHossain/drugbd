import "server-only";
import type {
  DeskOutcome, FilterKey, FlagItem, FlagPage, ItemsPage, ReviewBatchSummary, ReviewDiff, ReviewItem, VersionRow,
} from "./review-types";
import { parseStats, type SiteStats } from "./stats";

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

/**
 * GET /v1/stats (§7.4): public, never with the token. Throws on any failure or malformed body, so a Learn chapter
 * never renders a frozen example without its live `exampleUsable` check (§6.8).
 */
export async function getStats(): Promise<SiteStats> {
  const res = await read(`${base()}/v1/stats`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const stats = parseStats((await res.json().catch(() => null))?.data);
  if (!stats) throw new Error("API error: malformed stats");
  return stats;
}

/** Batch evidence shows unreviewed records: reviewers only (A1). These reads carry the token and fail without one. */
async function reviewerRead(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const token = internalToken();
  if (!token) throw new Error("The internal API token is not configured");
  return read(`${base()}${path}`, { ...headers, [TOKEN_HEADER]: token });
}

// ---- Reviewer reads (spec §7.3). Every one needs the token; an unknown batch, record or snapshot is null. ----

const enc = encodeURIComponent;

async function reviewData<T>(path: string, headers: Record<string, string> = {}): Promise<T | null> {
  const res = await reviewerRead(path, headers);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as T;
}

/** The API refuses a longer record filter (400); the desk never sends one. */
export const REVIEW_Q_MAX = 100;

export async function listReviewBatches(): Promise<ReviewBatchSummary[]> {
  return (await reviewData<ReviewBatchSummary[]>("/v1/review/batches")) ?? [];
}

/** The API's largest items page (`SIZE_MAX`). */
export const REVIEW_PAGE_MAX = 500;

/**
 * One page when `page` or `size` is given; otherwise every record in the filter, read page by page, because the desk
 * lists the whole batch and a batch file may hold more than one page. `total` is always the whole batch's size.
 */
export async function getReviewItems(batchId: string, opts: { show?: FilterKey; q?: string; page?: number; size?: number } = {}):
    Promise<ItemsPage | null> {
  const params = new URLSearchParams();
  if (opts.show && opts.show !== "all") params.set("show", opts.show);
  const q = [...(opts.q ?? "").trim()].slice(0, REVIEW_Q_MAX).join("");
  if (q) params.set("q", q);
  const one = (page: number, size: number) => {
    const p = new URLSearchParams(params);
    if (page) p.set("page", String(page));
    p.set("size", String(size));
    return reviewData<ItemsPage>(`/v1/review/batches/${enc(batchId)}/items?${p}`);
  };
  if (opts.page !== undefined || opts.size !== undefined) return one(opts.page ?? 0, opts.size ?? REVIEW_PAGE_MAX);
  const first = await one(0, REVIEW_PAGE_MAX);
  if (!first) return null;
  const items = [...(first.items ?? [])];
  // A filtered list never holds more than the batch, so `total` bounds the loop; a short page is the last one.
  for (let page = 1, last = items.length; last === REVIEW_PAGE_MAX && items.length < first.total; page++) {
    const next = await one(page, REVIEW_PAGE_MAX);
    if (!next) return null;
    last = next.items?.length ?? 0;
    items.push(...(next.items ?? []));
  }
  return { ...first, items };
}

export async function getReviewVersions(batchId: string): Promise<VersionRow[] | null> {
  return reviewData<VersionRow[]>(`/v1/review/batches/${enc(batchId)}/versions`);
}

/** `viewerEmail` only marks the viewer's own decisions ("(you)"); the API never echoes it. */
export async function getReviewItem(batchId: string, conceptId: string, viewerEmail: string | null): Promise<ReviewItem | null> {
  return reviewData<ReviewItem>(`/v1/review/batches/${enc(batchId)}/items/${enc(conceptId)}`,
    viewerEmail ? { "X-Viewer-Email": viewerEmail } : {});
}

export async function getReviewDiff(batchId: string, conceptId: string, from: string): Promise<ReviewDiff | null> {
  return reviewData<ReviewDiff>(`/v1/review/batches/${enc(batchId)}/items/${enc(conceptId)}/diff?${new URLSearchParams({ from })}`);
}

/** The desk's decision write (spec §7.2), with the outcome's version (spec §5.8.2 "own saves"). */
export async function postDeskDecision(batchId: string, conceptId: string, d: DecisionRequest): Promise<WriteResult<DeskOutcome>> {
  const payload = { decision: d.decision, note: d.note, reviewerEmail: d.reviewerEmail, reviewerRole: d.reviewerRole,
    extractedAt: d.extractedAt, expectedLastDecisionId: d.expectedLastDecisionId, requestId: d.requestId };
  const r = await write<DeskOutcome>(`/v1/batches/${enc(batchId)}/items/${enc(conceptId)}/decisions`, payload);
  if (!r.ok) return r;
  return { ok: true, data: { review: r.data?.review, displayStatus: r.data?.displayStatus, batchStatus: r.data?.batchStatus,
    version: { extractedAt: r.data?.version?.extractedAt ?? null, lastDecisionId: r.data?.version?.lastDecisionId ?? null },
    replayed: r.data?.replayed === true } };
}

/** Problem reports are every flag but partner requests; partner requests are (other, partner-access) (§5.16, D17). */
const FLAG_FILTERS = {
  reports: { excludeTargetId: "partner-access" },
  partner: { targetType: "other", targetId: "partner-access" },
} as const;

export async function listFlagPage(kind: keyof typeof FLAG_FILTERS, page: number): Promise<FlagPage> {
  const params = new URLSearchParams({ status: "open", ...FLAG_FILTERS[kind], page: String(page), size: "50" });
  const res = await reviewerRead(`/v1/flags?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json())?.data;
  if (!data || !Array.isArray(data.items)) throw new Error("API error: no flag list");
  return {
    items: data.items.map((f: FlagItem) => ({ id: f.id, targetType: f.targetType, targetId: f.targetId, message: f.message,
      status: f.status, createdAt: f.createdAt })),
    page: data.page, size: data.size, hasMore: data.hasMore === true,
  };
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
export type FlagTarget = "product" | "substance" | "check";
export type FlagRequest = { targetType: FlagTarget; targetId: string; message: string; reporterEmail: string; requestId?: string };

export async function createFlag(f: FlagRequest): Promise<WriteResult<unknown>> {
  return write<unknown>("/v1/flags", f);
}

export async function resolveFlag(id: number, resolvedBy: string, requestId?: string): Promise<WriteResult<unknown>> {
  return write<unknown>(`/v1/flags/${encodeURIComponent(String(id))}/resolve`, requestId ? { resolvedBy, requestId } : { resolvedBy });
}

export type AuditEventRequest = {
  event: string; actorEmail: string | null; actorRole: string | null; targetType: string | null; targetId: string | null;
  outcome: string; requestId: string;
};
/** POST /v1/audit-events (§7.5). Never carries free text from forms. */
export async function postAuditEvent(e: AuditEventRequest): Promise<WriteResult<{ id: number }>> {
  return write<{ id: number }>("/v1/audit-events", e);
}
