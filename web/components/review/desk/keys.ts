/** §5.14 keyboard model as a pure mapping from a key event and its context to one desk action. */
export type KeyTarget = "note" | "dismissNote" | "approve" | "search" | "listbox" | "field" | "other";
export type KeyAction = "approve" | "undo" | "report" | "dismiss" | "next" | "prev" | "first" | "last" | "evidence" | "source" | "sheet"
  | "closeSheet" | "closeDrawer" | "closeReport" | "closeDismiss" | "clearSearch" | "sendReport" | "sendDismiss" | "enterBlocked";

export const IS_MAC_RE = /Mac|iPhone|iPad/;

const LETTERS: Record<string, KeyAction> = {
  a: "approve", u: "undo", r: "report", d: "dismiss", j: "next", k: "prev", e: "evidence", s: "source",
};
const LIST: Record<string, KeyAction> = { ArrowDown: "next", ArrowUp: "prev", Home: "first", End: "last" };

export function keyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
    ctx: { singleKeys: boolean; sheetOpen: boolean; target: KeyTarget; searchHasText: boolean; drawerOpen: boolean; reportOpen: boolean;
      dismissOpen?: boolean }): KeyAction | null {
  if (ctx.sheetOpen) {
    if (e.key === "Escape") return "closeSheet";
    if (e.key === "?" && ctx.singleKeys) return "closeSheet";
    return null;
  }
  if (e.key === "Enter" && ctx.target === "approve") return "enterBlocked";
  if (ctx.target === "note" || ctx.target === "dismissNote") {
    const dismiss = ctx.target === "dismissNote";
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return dismiss ? "sendDismiss" : "sendReport";
    if (e.key === "Escape") return dismiss ? "closeDismiss" : "closeReport";
    return null;
  }
  if (e.key === "Escape") {
    if (ctx.drawerOpen) return "closeDrawer";
    if (ctx.reportOpen) return "closeReport";
    if (ctx.dismissOpen) return "closeDismiss";
    if (ctx.target === "search" && ctx.searchHasText) return "clearSearch";
    return null;
  }
  if (ctx.target === "field" || ctx.target === "search" || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (ctx.target === "listbox" && e.key in LIST) return LIST[e.key];
  if (!ctx.singleKeys) return null;
  if (e.key === "?") return "sheet";
  return e.key.length === 1 ? LETTERS[e.key.toLowerCase()] ?? null : null;
}

/** What the key event's target is, for keyAction. */
export function targetKind(el: Element | null): KeyTarget {
  if (!el) return "other";
  const desk = el.getAttribute("data-desk");
  if (desk === "note") return "note";
  if (desk === "dismiss-note") return "dismissNote";
  if (desk === "approve") return "approve";
  if (desk === "search") return "search";
  if (el.getAttribute("role") === "listbox") return "listbox";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable) return "field";
  return "other";
}
