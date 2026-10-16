import "server-only";
import type { CheckResult as PublicCheckResult, ClinicalDrugView, ProductInteractions, ProductStub, PublicProduct, PublicSubstance,
  SearchResult as PublicSearchResult, SeverityFilter, SubstanceInteractions, SubstanceStub, SuggestRow } from "./public-types";
import type {
  DeskOutcome, FilterKey, FlagItem, FlagPage, ItemsPage, ReviewBatchSummary, ReviewDiff, ReviewItem, ReviewerRole, VersionRow,
} from "./review-types";
import type { PairOutcome, PairQuery, PairsPage, SubstanceDetail, SubstancesPage } from "./senior-types";
import { SENIOR_PAGE_SIZE } from "./senior-types";
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

/** A DDInter entry chosen for the product's route; routeAssumed = the general entry stands in for the route. */
export type DdinterRef = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type ClinicalIngredient = {
  bdsId: string; name: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null; ddinter: DdinterRef[];
};

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

const enc = encodeURIComponent;

const read = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });

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

// ---- Public reads (§7.4). scope=public always (§2.2), never the token. ----

export type Read<T> = { ok: true; data: T } | { ok: false; status: number };

async function publicRead<T>(path: string, params: URLSearchParams = new URLSearchParams()): Promise<Read<T>> {
  params.set("scope", "public");
  let res: Response;
  try {
    res = await read(`${base()}${path}?${params}`);
  } catch {
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.json().catch(() => null);
  if (!body || body.data === undefined || body.data === null) return { ok: false, status: 502 };
  return { ok: true, data: body.data as T };
}

/** A §7.4 stub (product or substance): it carries hidden: true and nothing else of the record. */
export function isStub(x: unknown): x is ProductStub | SubstanceStub {
  return isHidden(x);
}

export const searchMedicines = (q: string, page: number) =>
  publicRead<PublicSearchResult>("/v1/search", new URLSearchParams({ q, page: String(page) }));
export const getPublicProduct = (id: string) => publicRead<PublicProduct | ProductStub>(`/v1/products/${enc(id)}`);
export const getProductInteractions = (id: string, page: number) =>
  publicRead<ProductInteractions | ProductStub>(`/v1/products/${enc(id)}/interactions`, new URLSearchParams({ page: String(page) }));
export const getClinicalDrug = (bdcId: string) => publicRead<ClinicalDrugView>(`/v1/clinical-drugs/${enc(bdcId)}`);
export const getPublicSubstance = (bdsId: string) => publicRead<PublicSubstance | SubstanceStub>(`/v1/substances/${enc(bdsId)}`);
export function getSubstanceInteractions(bdsId: string, severity: SeverityFilter | null, page: number) {
  const params = new URLSearchParams();
  if (severity) params.set("severity", severity);
  params.set("page", String(page));
  return publicRead<SubstanceInteractions | SubstanceStub>(`/v1/substances/${enc(bdsId)}/interactions`, params);
}
export function suggestProducts(q: string, exclude: string[]) {
  const params = new URLSearchParams({ q });
  for (const id of exclude) params.append("exclude", id);
  return publicRead<SuggestRow[]>("/v1/products/suggest", params);
}

export type CheckRead = { ok: true; data: PublicCheckResult } | { ok: false; status: number; unknownId: string | null };
const CHECK_LISTS = ["products", "alerts", "noInteraction", "notChecked", "duplicates", "noData", "notReviewed"] as const;
const NOT_FOUND = /^Product not found: (.+)$/;

/** POST /v1/interactions/check (§7.4). A 404 names the unknown id (the API's own message), so the page drops it (§6.7.3). */
export async function checkPublic(ids: string[]): Promise<CheckRead> {
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/interactions/check?scope=public`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptIds: ids }),
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 0, unknownId: null };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const m = res.status === 404 ? NOT_FOUND.exec(String(body?.errors?.[0]?.message ?? "")) : null;
    return { ok: false, status: res.status, unknownId: m && ids.includes(m[1]) ? m[1] : null };
  }
  const d = body?.data;
  if (!d || typeof d.summary !== "object" || !CHECK_LISTS.every((k) => Array.isArray(d[k]))) return { ok: false, status: 502, unknownId: null };
  return { ok: true, data: d as PublicCheckResult };
}

/**
 * §6.9 (D17): a partner access request is a flag on (other, partner-access); the API writes the partner_request audit row.
 * It goes through createFlag, the one flag write path (Ruling F17).
 */
export async function requestPartnerAccess(message: string, reporterEmail: string, requestId: string): Promise<WriteResult<unknown>> {
  return createFlag({ targetType: "other", targetId: "partner-access", message, reporterEmail, requestId });
}

/** Batch evidence shows unreviewed records: reviewers only (A1). These reads carry the token and fail without one. */
async function reviewerRead(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const token = internalToken();
  if (!token) throw new Error("The internal API token is not configured");
  return read(`${base()}${path}`, { ...headers, [TOKEN_HEADER]: token });
}

// ---- Reviewer reads (spec §7.3). Every one needs the token; an unknown batch, record or snapshot is null. ----

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

// ---- Senior review (spec §7.7): unreviewed data from every batch; the pages call these for a senior session only. ----

function seniorParams(q: Partial<PairQuery>, size = SENIOR_PAGE_SIZE): URLSearchParams {
  const p = new URLSearchParams();
  if (q.show) p.set("show", q.show);
  if (q.pairs) p.set("pairs", q.pairs);
  p.set("page", String(q.page ?? 0));
  p.set("size", String(size));
  if (q.severity) p.set("severity", q.severity);
  return p;
}

/**
 * The pair queue. Any failure throws: the page shows "Couldn't load senior review." (§5.17.5). `size` 1 reads only the
 * counts (the desk sidebar and /review/flags, Task 24).
 */
export async function getPairQueue(q: PairQuery, viewerEmail: string, size = SENIOR_PAGE_SIZE): Promise<PairsPage> {
  const data = await reviewData<PairsPage>(`/v1/review/pairs?${seniorParams(q, size)}`, { "X-Viewer-Email": viewerEmail });
  if (!data) throw new Error("API error 404");
  return data;
}

export async function listSeniorSubstances(q: string, page: number): Promise<SubstancesPage> {
  const p = new URLSearchParams({ page: String(page), size: String(SENIOR_PAGE_SIZE) });
  if (q) p.set("q", q);
  const data = await reviewData<SubstancesPage>(`/v1/review/substances?${p}`);
  if (!data) throw new Error("API error 404");
  return data;
}

/** One substance from every batch; null when it is not held (404, §7.7). */
export async function getSeniorSubstance(bdsId: string, q: Omit<PairQuery, "show">, viewerEmail: string): Promise<SubstanceDetail | null> {
  return reviewData<SubstanceDetail>(`/v1/review/substances/${enc(bdsId)}?${seniorParams(q)}`, { "X-Viewer-Email": viewerEmail });
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

export type PairDecisionRequest = {
  decision: "reviewed" | "issue"; note: string; reviewerEmail: string; reviewerRole: "senior"; expectedContentHash: string;
  expectedLastPairReviewId: number | null; requestId: string;
};

/** The pair decision write (§7.7): 201 or a 200 replay, with the pair's new state and version. */
export async function postPairDecision(a: string, b: string, d: PairDecisionRequest): Promise<WriteResult<PairOutcome>> {
  const r = await write<PairOutcome>(`/v1/review/pairs/${enc(a)}/${enc(b)}/decisions`, d);
  if (!r.ok) return r;
  return { ok: true, data: { ddinterA: r.data?.ddinterA, ddinterB: r.data?.ddinterB, review: r.data?.review,
    version: { contentHash: r.data?.version?.contentHash, lastPairReviewId: r.data?.version?.lastPairReviewId ?? null },
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
  decision: "ok" | "issue" | "dismiss"; note: string; reviewerEmail: string; reviewerRole: ReviewerRole;
  /** The version the page showed (spec §7.2): both required by the API, null when the item has none. */
  extractedAt: string | null;
  expectedLastDecisionId: number | null;
  /** A UUID rendered with the form and reused on every resend, so a retry is answered once (§7.2 step 1). */
  requestId: string;
};
export type FlagTarget = "product" | "substance" | "check" | "other";
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
