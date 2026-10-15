/**
 * GET /v1/stats (spec §7.4): public counts and each batch's records by trade name and public status. Client-safe types
 * and pure helpers; the fetch is `getStats()` in lib/api.ts (server-only). Learn withdraws a frozen example unless the
 * API reports its record as usable (§6.8): anything the API does not report counts as not usable.
 */
export type StatsItem = { conceptId: string; tradeName: string; status: "approved" | "not_reviewed"; exampleUsable: boolean };
export type BatchStatus = "in_review" | "approved" | "rejected";
export type StatsBatch = { batchId: string; status: BatchStatus; itemCount: number; approved: number; items: StatsItem[] };
export type SiteStats = {
  registerProducts: number; productsLoaded: number; substances: number; approvedProducts: number; inReviewProducts: number;
  batches: StatsBatch[];
};

const COUNTS = ["registerProducts", "productsLoaded", "substances", "approvedProducts", "inReviewProducts"] as const;
const ITEM_STATUSES: readonly string[] = ["approved", "not_reviewed"];
const BATCH_STATUSES: readonly string[] = ["in_review", "approved", "rejected"];
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseItem(v: unknown): StatsItem | null {
  if (!isObject(v) || !isText(v.conceptId) || !isText(v.tradeName) || typeof v.status !== "string"
      || !ITEM_STATUSES.includes(v.status) || typeof v.exampleUsable !== "boolean") return null;
  return { conceptId: v.conceptId, tradeName: v.tradeName, status: v.status as StatsItem["status"], exampleUsable: v.exampleUsable };
}

function parseBatch(v: unknown): StatsBatch | null {
  if (!isObject(v) || !isText(v.batchId) || typeof v.status !== "string" || !BATCH_STATUSES.includes(v.status)
      || !isCount(v.itemCount) || !isCount(v.approved) || !Array.isArray(v.items)) return null;
  const items = v.items.map(parseItem);
  if (items.some((i) => i === null)) return null;
  return { batchId: v.batchId, status: v.status as BatchStatus, itemCount: v.itemCount, approved: v.approved, items: items as StatsItem[] };
}

/** The `data` of GET /v1/stats with only its §7.4 fields, or null when any field is missing or of the wrong type. */
export function parseStats(v: unknown): SiteStats | null {
  if (!isObject(v) || !COUNTS.every((k) => isCount(v[k])) || !Array.isArray(v.batches)) return null;
  const batches = v.batches.map(parseBatch);
  if (batches.some((b) => b === null)) return null;
  return {
    registerProducts: v.registerProducts as number, productsLoaded: v.productsLoaded as number, substances: v.substances as number,
    approvedProducts: v.approvedProducts as number, inReviewProducts: v.inReviewProducts as number, batches: batches as StatsBatch[],
  };
}

export const findBatch = (s: SiteStats, batchId: string): StatsBatch | null => s.batches.find((b) => b.batchId === batchId) ?? null;
export const findItem = (b: StatsBatch | null, conceptId: string): StatsItem | null =>
  b?.items.find((i) => i.conceptId === conceptId) ?? null;
/** A frozen example may show only when the API reports its record in that batch as usable (§6.8; fail closed). */
export const exampleUsable = (b: StatsBatch | null, conceptId: string): boolean => findItem(b, conceptId)?.exampleUsable === true;
/** Public pills only (§3.4): approved, or "Not yet reviewed by a pharmacist" for anything else, unreported included. */
export const pillStatus = (i: StatsItem | null): "approved" | "pending" => (i?.status === "approved" ? "approved" : "pending");
/** A batch reads approved only when every record still in its file is approved. */
export const batchPill = (b: StatsBatch | null): "approved" | "pending" =>
  (b !== null && b.itemCount > 0 && b.approved === b.itemCount ? "approved" : "pending");
/** Some, but not all, of the batch's records are approved: then neither pill is true of the whole batch (§6.8, Review Focus 5). */
export const partlyApproved = (b: StatsBatch): boolean => b.approved > 0 && b.approved < b.itemCount;
export const BATCH_STATUS_WORD: Record<BatchStatus, string> = { in_review: "in review", approved: "approved", rejected: "rejected" };
/** "39,196": counts as the boards print them. */
export const formatCount = (n: number): string => n.toLocaleString("en-US");
