import { PILOT_IDS, PILOT_SNAPSHOT } from "@/content/learn/pilot-snapshot";
import type { SiteStats, StatsItem } from "@/lib/stats";

/**
 * A /v1/stats answer for the pilot, as Learn reads it. By default all ten records are listed, usable and not reviewed.
 * `approved`, `withdrawn` and `missing` take concept ids; `batchId` renames the reported batch.
 */
export function pilotStats(o: { approved?: string[]; withdrawn?: string[]; missing?: string[]; batchId?: string } = {}): SiteStats {
  const items: StatsItem[] = PILOT_IDS.filter((id) => !o.missing?.includes(id)).map((id) => ({
    conceptId: id, tradeName: PILOT_SNAPSHOT.records[id].tradeName,
    status: o.approved?.includes(id) ? "approved" : "not_reviewed", exampleUsable: !o.withdrawn?.includes(id),
  }));
  const approved = items.filter((i) => i.status === "approved").length;
  return {
    registerProducts: 39196, productsLoaded: 10, substances: 11, approvedProducts: approved, inReviewProducts: 10 - approved,
    batches: [{ batchId: o.batchId ?? PILOT_SNAPSHOT.batchId, status: "in_review", itemCount: items.length, approved, items }],
  };
}
