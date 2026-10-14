/** §5.14 keyboard model as a pure mapping from a key event and its context to one desk action. */
export type KeyTarget = "note" | "approve" | "search" | "listbox" | "field" | "other";
export type KeyAction = "approve" | "undo" | "report" | "next" | "prev" | "first" | "last" | "evidence" | "source" | "sheet"
  | "closeSheet" | "closeDrawer" | "closeReport" | "clearSearch" | "sendReport" | "enterBlocked";

export const IS_MAC_RE = /Mac|iPhone|iPad/;

const LETTERS: Record<string, KeyAction> = { a: "approve", u: "undo", r: "report", j: "next", k: "prev", e: "evidence", s: "source" };
const LIST: Record<string, KeyAction> = { ArrowDown: "next", ArrowUp: "prev", Home: "first", End: "last" };

export function keyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
    ctx: { singleKeys: boolean; sheetOpen: boolean; target: KeyTarget; searchHasText: boolean; drawerOpen: boolean; reportOpen: boolean }):
    KeyAction | null {
  if (ctx.sheetOpen) {
    if (e.key === "Escape") return "closeSheet";
    if (e.key === "?" && ctx.singleKeys) return "closeSheet";
    return null;
  }
  if (e.key === "Enter" && ctx.target === "approve") return "enterBlocked";
  if (ctx.target === "note") {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return "sendReport";
    if (e.key === "Escape") return "closeReport";
    return null;
  }
  if (e.key === "Escape") {
    if (ctx.drawerOpen) return "closeDrawer";
    if (ctx.reportOpen) return "closeReport";
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
  if (el.getAttribute("data-desk") === "note") return "note";
  if (el.getAttribute("data-desk") === "approve") return "approve";
  if (el.getAttribute("data-desk") === "search") return "search";
  if (el.getAttribute("role") === "listbox") return "listbox";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable) return "field";
  return "other";
}
