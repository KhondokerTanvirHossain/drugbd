import { FILTER_KEYS, STAGE_KEYS, type FilterKey, type ReviewItem } from "@/lib/review-types";

/** §7.2 step 5 as the page shows it: a failed or missing check, or no run stamp, blocks "Looks correct". */
export function stagesBlocked(item: ReviewItem): boolean {
  if (item.version.extractedAt === null) return true;
  return STAGE_KEYS.some((k) => {
    const st = item.stages.find((s) => s.stage === k);
    return !st || st.status === "fail";
  });
}

export function parseShow(v: unknown): FilterKey {
  return typeof v === "string" && (FILTER_KEYS as readonly string[]).includes(v) ? (v as FilterKey) : "all";
}
