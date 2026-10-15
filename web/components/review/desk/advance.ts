import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { actsAsPharmacist, type DisplayStatus, type ReviewerRole } from "@/lib/review-types";

export type AdvanceRow = { conceptId: string; name: string; index: number; status: DisplayStatus };

/** §5.9: what still needs this role's review. An engineer's own check is done for engineers. */
export function needsFor(role: ReviewerRole, status: DisplayStatus): boolean {
  return status === "pending" || status === "back_in_review" || (actsAsPharmacist(role) && status === "engineer_checked");
}

export type Advance =
  | { kind: "complete"; switchView: boolean; announce: string }
  | { kind: "stay"; announce: string }
  | { kind: "open"; target: AdvanceRow; clearFilter: boolean; announce: string };

/** §5.9 after a successful commit. `all` is every current record by index; statuses already include the save. */
export function advance(a: { role: ReviewerRole; committedId: string; openId: string | null; reportOpen: boolean;
    visible: AdvanceRow[]; all: AdvanceRow[]; batchId: string; saved: string }): Advance {
  if (a.all.length > 0 && a.all.every((r) => r.status === "approved"))
    return { kind: "complete", switchView: a.openId === a.committedId, announce: `${a.saved} ${fill(DESK.allApproved, { id: a.batchId })}` };
  if (a.openId !== a.committedId || a.reportOpen) return { kind: "stay", announce: a.saved };
  const after = (list: AdvanceRow[]) => {
    const k = list.findIndex((r) => r.conceptId === a.committedId);
    for (let j = 1; j <= list.length; j++) {
      const r = list[((k < 0 ? -1 : k) + j) % list.length];
      if (r.conceptId !== a.committedId && needsFor(a.role, r.status)) return r;
    }
    return null;
  };
  const inView = after(a.visible);
  const target = inView ?? after(a.all);
  if (!target) return { kind: "stay", announce: `${a.saved} ${DESK.noneLeft}` };
  return { kind: "open", target, clearFilter: inView === null,
    announce: `${a.saved} ${fill(DESK.opened, { name: target.name, k: target.index, n: a.all.length })}` };
}
