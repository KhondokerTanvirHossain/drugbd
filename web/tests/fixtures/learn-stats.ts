import { PILOT_IDS, PILOT_SNAPSHOT } from "@/content/learn/pilot-snapshot";
import type { SiteStats, StatsItem } from "@/lib/stats";

/**
 * A /v1/stats answer for the pilot, as Learn reads it. By default all ten records are listed, usable and not reviewed.
 * `approved`, `withdrawn` and `missing` take concept ids; `batchId` renames the reported batch.
 */
export function pilotStats(o: { approved?: string[]; withdrawn?: string[]; missing?: string[]; batchId?: string;
    /** D74: the API's mode; in show mode every listed record is visible (labelled), `problem` and `hidden` take concept ids. */
    mode?: "approved_only" | "show_unreviewed"; problem?: string[]; hidden?: string[] } = {}): SiteStats {
  const show = o.mode === "show_unreviewed";
  const items: StatsItem[] = PILOT_IDS.filter((id) => !o.missing?.includes(id)).map((id) => {
    const approved = o.approved?.includes(id) ?? false;
    const hidden = show ? (o.hidden?.includes(id) ?? false) : !approved;
    return {
      conceptId: id, tradeName: PILOT_SNAPSHOT.records[id].tradeName,
      status: approved ? "approved" : "not_reviewed", exampleUsable: !o.withdrawn?.includes(id), hidden,
      review: hidden ? null : approved ? "approved" : o.problem?.includes(id) ? "problem" : "not_reviewed",
    };
  });
  const approved = items.filter((i) => i.status === "approved").length;
  return {
    publicMode: o.mode ?? "approved_only",
    registerProducts: 39196, productsLoaded: 10, substances: 11, approvedProducts: approved, inReviewProducts: 10 - approved,
    batches: [{ batchId: o.batchId ?? PILOT_SNAPSHOT.batchId, status: "in_review", itemCount: items.length, approved, items }],
  };
}
