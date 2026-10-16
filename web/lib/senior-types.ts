/*
 * Shapes of the senior review endpoints (spec §7.7) and of the pair decision action, shared by the senior pages (server)
 * and the SeniorDesk island (client). Type imports only, so an island may import it.
 */
import type { DisplayStatus, EntrySummary, IngredientSummary, PairReview, Source } from "./review-types";

export type PairShow = "todo" | "changed" | "issue" | "reviewed" | "all";
export const PAIR_SHOWS: readonly PairShow[] = ["todo", "changed", "issue", "reviewed", "all"];
export type PairScope = "all" | "applies";
export const PAIR_SCOPES: readonly PairScope[] = ["all", "applies"];
export type SeverityFilter = "major" | "moderate" | "minor" | "unknown";
export const SEVERITY_FILTERS: readonly SeverityFilter[] = ["major", "moderate", "minor", "unknown"];
export type PairQuery = { show: PairShow; pairs: PairScope; severity: SeverityFilter | null; page: number };
export const SENIOR_PAGE_SIZE = 50;

export type PairVersion = { contentHash: string; lastPairReviewId: number | null };
export type PairChange = { field: string; atReview: string | null; now: string | null };
export type PairHistoryEntry = { decision: "reviewed" | "issue"; at: string; note: string | null; mine: boolean; changedAfter: boolean };
export type PairBrand = { conceptId: string; tradeName: string; batchId: string; displayStatus: DisplayStatus; side: "a" | "b" };
export type PairView = {
  ddinterA: string; ddinterB: string; substanceA: { bdsId: string; name: string }; substanceB: { bdsId: string; name: string };
  entryA: { name: string | null; routeScope: string; source: Source | null }; entryB: { name: string | null; routeScope: string; source: Source | null };
  severity: string; actions: string[]; interaction: string | null; management: string | null; source: Source | null; applies: boolean;
  brands: PairBrand[]; brandCounts: { a: number; b: number; batches: number }; review: PairReview; changes: PairChange[];
  history: PairHistoryEntry[]; version: PairVersion;
};
export type PairsPage = { total: number; counts: Record<PairShow, number>; items: PairView[] };
export type SubstanceRow = { bdsId: string; name: string; brands: number; batches: number; pairsToReview: number; majorPairsToReview: number };
export type SubstancesPage = { total: number; items: SubstanceRow[] };
export type SubstanceBrand = {
  conceptId: string; tradeName: string; batchId: string; displayStatus: DisplayStatus;
  clinicalDrug: { bdcId: string; displayName: string; route: string | null } | null; strengthText: string;
  chosen: { ddinterId: string; routeScope: string; routeAssumed: boolean }[]; reason: "no_data" | "not_run" | "no_route" | null;
};
export type SubstanceDetail = {
  bdsId: string; name: string; names: { name: string; type: string; source: string }[]; codes: IngredientSummary["codes"];
  coverage: "full" | "none" | "not_run"; entries: EntrySummary[]; brands: SubstanceBrand[]; pairs: { total: number; items: PairView[] };
};
export type PairOutcome = { ddinterA: string; ddinterB: string; review: PairReview; version: PairVersion; replayed: boolean };

/** What SeniorDesk receives per row (§4.2): ids, substance names for announcements, version and state. Never text or emails. */
export type PairRef = { ddinterA: string; ddinterB: string; nameA: string; nameB: string; version: PairVersion; state: PairReview["state"] };
export const pairKey = (ddinterA: string, ddinterB: string) => `${ddinterA}|${ddinterB}`;

export type PairDecideInput = {
  ddinterA: string; ddinterB: string; decision: "reviewed" | "issue"; note: string; expectedContentHash: string;
  expectedLastPairReviewId: number | null; requestId: string; turnstileToken: string;
};
export type PairCode = "content_changed" | "other_senior" | "already_reviewed" | "not_found" | "captcha" | "forbidden"
  | "unauthenticated" | "rate_limited" | "invalid" | "failed";
export type PairDecideResult = { ok: true; outcome: PairOutcome } | { ok: false; code: PairCode };
