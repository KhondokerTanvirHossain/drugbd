import { DESK_NEW } from "@/lib/copy";
import { DESK, plural } from "@/lib/review-copy";
import type { ItemHint } from "@/lib/review-types";

/** §5.4 row hint: the first rule that applies wins. */
export function rowHint(h: ItemHint, s: { netErr: "no" | "unknown" | null; stale: boolean }):
    { text: string; tone: "warn" | "nodata" | null } {
  if (s.netErr === "no") return { text: DESK.hintNotSaved, tone: "warn" };
  if (s.netErr === "unknown") return { text: DESK_NEW.decisionUnconfirmed.rowHint, tone: "warn" };
  if (s.stale) return { text: DESK.hintChanged, tone: "warn" };
  if (h.noData) return { text: DESK.hintNoData, tone: "nodata" };
  if (h.notRun) return { text: DESK_NEW.notRun.rowHint, tone: "warn" };
  if (h.failed > 0) return { text: `${h.failed} ${plural(h.failed, "check failed", "checks failed")}`, tone: "warn" };
  if (h.warnings > 0) {
    const pairs = h.pairsWithoutText > 0 ? `, ${h.pairsWithoutText} ${plural(h.pairsWithoutText, "pair", "pairs")} without text` : "";
    return { text: `${h.warnings} ${plural(h.warnings, "check warning", "check warnings")}${pairs}`, tone: "warn" };
  }
  return { text: DESK.hintAllOk, tone: null };
}
