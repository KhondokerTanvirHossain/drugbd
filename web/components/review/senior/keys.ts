/** §5.17.5 keyboard model of the senior pages, as a pure mapping (the §5.14 rules on fields, modifiers and case apply). */
export type SeniorTarget = "note" | "mark" | "field" | "other";
export type SeniorAction = "next" | "prev" | "mark" | "report" | "sheet" | "closeSheet" | "closeNote" | "sendNote" | "enterBlocked";

const LETTERS: Record<string, SeniorAction> = { j: "next", k: "prev", m: "mark", r: "report" };

export function seniorKeyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
    ctx: { singleKeys: boolean; sheetOpen: boolean; target: SeniorTarget; noteOpen: boolean }): SeniorAction | null {
  if (ctx.sheetOpen) {
    if (e.key === "Escape") return "closeSheet";
    if (e.key === "?" && ctx.singleKeys) return "closeSheet";
    return null;
  }
  if (e.key === "Enter" && ctx.target === "mark") return "enterBlocked";
  if (ctx.target === "note") {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return "sendNote";
    if (e.key === "Escape") return "closeNote";
    return null;
  }
  if (e.key === "Escape") return ctx.noteOpen ? "closeNote" : null;
  if (ctx.target === "field" || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (!ctx.singleKeys) return null;
  if (e.key === "?") return "sheet";
  return e.key.length === 1 ? LETTERS[e.key.toLowerCase()] ?? null : null;
}

export function seniorTarget(el: Element | null): SeniorTarget {
  if (!el) return "other";
  const k = el.getAttribute("data-senior");
  if (k === "note") return "note";
  if (k === "mark") return "mark";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable) return "field";
  return "other";
}
