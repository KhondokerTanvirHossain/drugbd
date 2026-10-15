/*
 * Shapes of the reviewer endpoints (spec §7.3) shared by the review pages (server) and the desk islands (client).
 * This module imports nothing, so an island may import it.
 */
export type ReviewerRole = "pharmacist" | "engineer";
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
export type TextMissingPair = { ddinterA: string; nameA: string; ddinterB: string; nameB: string; severity: string | null; inBatch: boolean };
export type ReviewStage = { stage: StageKey; status: "ok" | "warn" | "fail"; notes: StageNote[]; textMissing: TextMissingPair[]; evidence: unknown };

export type ChosenEntry = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type EntrySummary = {
  ddinterId: string; name: string | null; routeScope: string;
  counts: { major: number; moderate: number; minor: number; unknown: number; total: number }; diseaseCount: number; foodCount: number;
};
export type IngredientSummary = {
  bdsId: string | null; name: string; raw: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null;
  names: { name: string; type: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; method: string; confidence: number }[];
  coverage: { coverage: "full" | "none" | "not_run"; note: string };
  ddinter: { chosen: ChosenEntry[]; entries: EntrySummary[] };
};

export type PartnerRef = { conceptId: string; tradeName: string; index: number };
export type BatchPair = {
  ddinterA: string; ddinterB: string; nameA: string; nameB: string; substance: string; partnerSubstance: string;
  severity: string; actions: string[]; interaction: string | null; management: string | null; partners: PartnerRef[];
};
export type NotCheckedReason = "no_data" | "not_run" | "no_route" | "unmapped" | "same_product";
export type NotCheckedPair = {
  substance: string; partnerSubstance: string; partners: PartnerRef[]; reason: NotCheckedReason; side: "this" | "partner";
  route: string | null;
};
export type BatchPairs = { totalBatchPairs: number; pairs: BatchPair[]; notChecked: NotCheckedPair[] };

export type HistoryEntry = {
  kind: "run" | "extract" | "decision"; at: string; reason?: "run" | "rerun" | "shared_change"; role?: ReviewerRole;
  decision?: "ok" | "issue"; note?: string; counts?: boolean; mine?: boolean;
};
export type Reopen = { reason: "rerun" | "shared_change"; at: string; previousExtractedAt: string; diffAvailable: boolean };

export type ReviewBrand = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string; genericContentRaw: string;
  qualityFlag: string | null; parseStatus: string | null; parseNote: string | null;
};
export type ReviewClinical = { bdcId: string; displayName: string; doseForm: string; route: string | null; signature: string };
export type ReviewItem = {
  batchId: string; conceptId: string; index: number; total: number; displayStatus: DisplayStatus; review: "pending" | "ok" | "issue";
  version: Version; batch: { runAt: string; itemCount: number; status: string };
  brand: ReviewBrand | null; dgdaIngredients: { xmCode: string; name: string }[]; clinicalDrug: ReviewClinical | null;
  ingredients: IngredientSummary[]; stages: ReviewStage[]; batchPairs: BatchPairs; sourceJson: unknown; sourceUrl: string;
  history: HistoryEntry[]; reopen: Reopen | null;
};
export type DiffRow = { field: string; before: string | null; now: string | null };
export type ReviewDiff = { from: string; to: string; reason: "rerun" | "shared_change"; rows: DiffRow[] };

/** A flag as /review/flags shows it: never the reporter's or resolver's email (§2.2). */
export type FlagItem = { id: number; targetType: string; targetId: string; message: string; status: string; createdAt: string };
export type FlagPage = { items: FlagItem[]; page: number; size: number; hasMore: boolean };

/** What a saved (or replayed) decision returns (§7.2). */
export type DeskOutcome = { review: string; displayStatus: DisplayStatus; batchStatus: string; version: Version; replayed: boolean };
