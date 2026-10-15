/*
 * Shapes of the reviewer endpoints (spec §7.3) shared by the review pages (server) and the desk islands (client).
 * This module imports nothing, so an island may import it.
 */
export type ReviewerRole = "pharmacist" | "engineer" | "senior";
/**
 * §5.13: the one test for pharmacist powers (approval publishes, the promise's consequence, the "needs review" set).
 * A senior pharmacist is a pharmacist (PO D2, D49). Client-safe; lib/reviewers.ts re-exports it.
 */
export const actsAsPharmacist = (role: string | null | undefined): boolean => role === "pharmacist" || role === "senior";

/** §5.6.6: a source link, built only by the API (SourceLinks.java). `fetchedAt` is null when no fetch time is stored. */
export type Source = { url: string; label: string; fetchedAt: string | null };
/** §5.17, §7.3: a pair's senior-review state. Reviewer surfaces show all four. */
export type PairReviewStateName = "not_reviewed" | "reviewed" | "changed" | "issue";
export type PairReview = { state: PairReviewStateName; at: string | null; mine: boolean; note: string | null };
/** §5.5.3, §7.3: where a text-missing pair's partner entry is chosen. */
export type PartnerScope = "batch" | "same_product" | "other";
export type DisplayStatus = "pending" | "approved" | "engineer_checked" | "issue" | "back_in_review";
export type FilterKey = "all" | "needs" | "warn" | "issue" | "approved" | "nodata";
export const FILTER_KEYS: readonly FilterKey[] = ["all", "needs", "warn", "issue", "approved", "nodata"];
export type StageKey = "dgda" | "substances" | "clinical" | "ddinter";
export const STAGE_KEYS: readonly StageKey[] = ["dgda", "substances", "clinical", "ddinter"];

/** The stale-detection token (§5.11): the run stamp exactly as the API serialised it, and the newest decision id. */
export type Version = { extractedAt: string | null; lastDecisionId: number | null };
export const sameVersion = (a: Version, b: Version) => a.extractedAt === b.extractedAt && a.lastDecisionId === b.lastDecisionId;

export type ItemHint = { failed: number; warnings: number; pairsWithoutText: number; noData: boolean; notRun: boolean };
export type ReviewBatchSummary = {
  batchId: string; status: "in_review" | "approved" | "rejected"; runAt: string; itemCount: number;
  counts: { approved: number; issue: number; needsReview: number; engineerChecked: number; backInReview: number; noData: number; warnings: number };
};
export type ItemRow = {
  index: number; conceptId: string; tradeName: string; clinicalDisplayName: string | null; displayStatus: DisplayStatus;
  hint: ItemHint; version: Version;
};
export type ItemsPage = { batchId: string; total: number; filterCounts: Record<FilterKey, number>; items: ItemRow[] };
export type VersionRow = { conceptId: string; extractedAt: string | null; lastDecisionId: number | null; displayStatus: DisplayStatus };

export type StageNote = {
  kind: "text_missing" | "name_only" | "no_data" | "route_assumed" | "no_route_entry" | "other";
  text: string; ddinterId: string | null; route: string | null;
};
export type TextMissingPair = {
  ddinterA: string; nameA: string; ddinterB: string; nameB: string; severity: string | null; inBatch: boolean; partnerScope: PartnerScope;
};
export type ReviewStage = { stage: StageKey; status: "ok" | "warn" | "fail"; notes: StageNote[]; textMissing: TextMissingPair[]; evidence: unknown };

export type ChosenEntry = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type EntrySummary = {
  ddinterId: string; name: string | null; routeScope: string;
  counts: { major: number; moderate: number; minor: number; unknown: number; total: number }; diseaseCount: number; foodCount: number;
  source?: Source | null;
};
export type IngredientSummary = {
  bdsId: string | null; name: string; raw: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null;
  names: { name: string; type: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; method: string; confidence: number; source?: Source | null }[];
  coverage: { coverage: "full" | "none" | "not_run"; note: string };
  ddinter: { chosen: ChosenEntry[]; entries: EntrySummary[] };
};

export type PartnerRef = { conceptId: string; tradeName: string; index: number };
export type BatchPair = {
  ddinterA: string; ddinterB: string; nameA: string; nameB: string; substance: string; partnerSubstance: string;
  severity: string; actions: string[]; interaction: string | null; management: string | null; partners: PartnerRef[];
  source?: Source | null; pairReview?: PairReview;
};
export type NotCheckedReason = "no_data" | "not_run" | "no_route" | "unmapped" | "same_product";
export type NotCheckedPair = {
  substance: string; partnerSubstance: string; partners: PartnerRef[]; reason: NotCheckedReason; side: "this" | "partner";
  route: string | null;
};
export type BatchPairs = { totalBatchPairs: number; pairs: BatchPair[]; notChecked: NotCheckedPair[] };
/** §7.3 otherPairs: partners are the latest current items of products held in other batches (never a removed item). */
export type OtherPartner = { conceptId: string; tradeName: string; batchId: string; approved: boolean };
export type OtherPair = {
  ddinterA: string; ddinterB: string; nameA: string; nameB: string; substance: string; partnerSubstance: string;
  partnerBdsId: string | null; severity: string; actions: string[]; interaction: string | null; management: string | null;
  source: Source | null; pairReview: PairReview; partners: OtherPartner[]; partnerCount: number;
};
export type OtherNotChecked = {
  substance: string; partnerSubstance: string; partnerBdsId: string | null; partners: OtherPartner[]; partnerCount: number;
  reason: Exclude<NotCheckedReason, "same_product">; side: "this" | "partner"; route: string | null;
};
export type OtherPairs = { pairs: OtherPair[]; notChecked: OtherNotChecked[]; otherBatches: number };
/** §5.10a: the counted issues a dismissal would close, oldest first. Roles only, never an email. */
export type OpenIssue = { role: ReviewerRole; at: string; note: string; mine: boolean };

export type HistoryEntry = {
  kind: "run" | "extract" | "decision"; at: string; reason?: "run" | "rerun" | "shared_change"; role?: ReviewerRole;
  decision?: "ok" | "issue" | "dismiss"; note?: string; counts?: boolean; mine?: boolean;
  /** Why `counts` is false (§5.6.5 suffix): the re-run stamp, or a later dismissal. */
  uncountedBy?: "rerun" | "dismiss";
  /** The batch an approval was carried from (§8.3.1 item 8), on an `extract` entry. */
  carriedFrom?: string;
};
export type Reopen = { reason: "rerun" | "shared_change"; at: string; previousExtractedAt: string; diffAvailable: boolean };

export type ReviewBrand = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string; genericContentRaw: string;
  qualityFlag: string | null; parseStatus: string | null; parseNote: string | null;
  source?: Source | null;
};
export type ReviewClinical = { bdcId: string; displayName: string; doseForm: string; route: string | null; signature: string };
export type ReviewItem = {
  batchId: string; conceptId: string; index: number; total: number; displayStatus: DisplayStatus; review: "pending" | "ok" | "issue";
  version: Version; batch: { runAt: string; itemCount: number; status: string };
  brand: ReviewBrand | null; dgdaIngredients: { xmCode: string; name: string }[]; clinicalDrug: ReviewClinical | null;
  ingredients: IngredientSummary[]; stages: ReviewStage[]; batchPairs: BatchPairs; sourceJson: unknown; sourceUrl: string;
  history: HistoryEntry[]; reopen: Reopen | null; otherPairs: OtherPairs; openIssues: OpenIssue[];
};
export type DiffRow = { field: string; before: string | null; now: string | null };
export type ReviewDiff = { from: string; to: string; reason: "rerun" | "shared_change"; rows: DiffRow[] };

/** A flag as /review/flags shows it: never the reporter's or resolver's email (§2.2). */
export type FlagItem = { id: number; targetType: string; targetId: string; message: string; status: string; createdAt: string };
export type FlagPage = { items: FlagItem[]; page: number; size: number; hasMore: boolean };

/** What a saved (or replayed) decision returns (§7.2). */
export type DeskOutcome = { review: string; displayStatus: DisplayStatus; batchStatus: string; version: Version; replayed: boolean };
