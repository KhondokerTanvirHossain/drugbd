import { PILOT_SNAPSHOT, type PilotId } from "@/content/learn/pilot-snapshot";
import { exampleUsable, findBatch, findItem, pillStatus, type SiteStats, type StatsBatch, type StatsItem } from "@/lib/stats";

/**
 * True: GET /v1/products/{id} serves the §7.4 hidden stub ({conceptId, tradeName, status, batchId, hidden}, no
 * reviewStatus) (P2 Task 1). While false, Learn leaves out the sentences that describe it (§6.8 "Before P2").
 * learn-parts.test.tsx pins this constant to HiddenRecord.java.
 */
export const API_STUB_SHAPE = true;

/**
 * What every Learn chapter renders from: the live /v1/stats answer and the one rule that decides whether a frozen pilot
 * example may show (§6.8). The pilot batch is the snapshot's; a record that batch does not report is not usable.
 */
export type LearnContext = {
  stats: SiteStats;
  /** The snapshot's batch as /v1/stats reports it, or null when it is not reported. */
  batch: StatsBatch | null;
  usable: (id: PilotId) => boolean;
  item: (id: PilotId) => StatsItem | null;
  /** The live trade name, else the snapshot's. */
  tradeName: (id: PilotId) => string;
  /** True while the record's live pill is not "approved" (§6.8 "Approval-state sentences"). */
  pending: (id: PilotId) => boolean;
  /** API_STUB_SHAPE, overridable in tests. */
  apiStub: boolean;
};

export function learnContext(stats: SiteStats, apiStub: boolean = API_STUB_SHAPE): LearnContext {
  const batch = findBatch(stats, PILOT_SNAPSHOT.batchId);
  return {
    stats,
    batch,
    usable: (id) => exampleUsable(batch, id),
    item: (id) => findItem(batch, id),
    tradeName: (id) => findItem(batch, id)?.tradeName ?? PILOT_SNAPSHOT.records[id].tradeName,
    pending: (id) => pillStatus(findItem(batch, id)) !== "approved",
    apiStub,
  };
}
