import { describe, expect, it } from "vitest";
import { keyAction, type KeyTarget } from "@/components/review/desk/keys";

const ctx = (over: Partial<Parameters<typeof keyAction>[1]> = {}) => ({ singleKeys: true, sheetOpen: false, target: "other" as KeyTarget,
  searchHasText: false, drawerOpen: false, reportOpen: false, ...over });
const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("keyboard model (§5.14)", () => {
  it("letters, case-insensitive; ? by key", () => {
    expect(["a", "A", "u", "r", "j", "k", "e", "s", "?"].map((k) => keyAction(key(k), ctx())))
      .toEqual(["approve", "approve", "undo", "report", "next", "prev", "evidence", "source", "sheet"]);
  });

  it("ignored while typing and with Ctrl, Cmd or Alt", () => {
    for (const target of ["field", "search", "note"] as KeyTarget[]) expect(keyAction(key("a"), ctx({ target }))).toBeNull();
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) expect(keyAction(key("a", mods), ctx())).toBeNull();
  });

  it("Enter never approves, with or without modifiers", () => {
    for (const mods of [{}, { ctrlKey: true }, { metaKey: true }]) expect(keyAction(key("Enter", mods), ctx({ target: "approve" }))).toBe("enterBlocked");
  });

  it("Esc closes the sheet, then the drawer, then the note (keeping it), then the search text", () => {
    expect(keyAction(key("Escape"), ctx({ sheetOpen: true, drawerOpen: true }))).toBe("closeSheet");
    expect(keyAction(key("Escape"), ctx({ drawerOpen: true, reportOpen: true }))).toBe("closeDrawer");
    expect(keyAction(key("Escape"), ctx({ reportOpen: true, target: "note" }))).toBe("closeReport");
    expect(keyAction(key("Escape"), ctx({ reportOpen: true }))).toBe("closeReport");
    expect(keyAction(key("Escape"), ctx({ target: "search", searchHasText: true }))).toBe("clearSearch");
    expect(keyAction(key("Escape"), ctx({ target: "search" }))).toBeNull();
  });

  it("Ctrl or Cmd Enter sends, only in the note field", () => {
    expect(keyAction(key("Enter", { ctrlKey: true }), ctx({ target: "note" }))).toBe("sendReport");
    expect(keyAction(key("Enter", { metaKey: true }), ctx({ target: "note" }))).toBe("sendReport");
    expect(keyAction(key("Enter"), ctx({ target: "note" }))).toBeNull();
    expect(keyAction(key("Enter", { ctrlKey: true }), ctx())).toBeNull();
  });

  it("list keys only on the listbox", () => {
    expect(["ArrowDown", "ArrowUp", "Home", "End"].map((k) => keyAction(key(k), ctx({ target: "listbox" }))))
      .toEqual(["next", "prev", "first", "last"]);
    expect(keyAction(key("ArrowDown"), ctx())).toBeNull();
  });

  it("with the sheet open only Esc and ? act", () => {
    expect(keyAction(key("a"), ctx({ sheetOpen: true }))).toBeNull();
    expect(keyAction(key("?"), ctx({ sheetOpen: true }))).toBe("closeSheet");
  });

  it("single-key shortcuts Off: letters and ? do nothing; Esc, Ctrl Enter and list arrows still work", () => {
    const off = (over: Partial<Parameters<typeof keyAction>[1]> = {}) => ctx({ singleKeys: false, ...over });
    for (const k of ["a", "u", "r", "j", "k", "e", "s", "?"]) expect(keyAction(key(k), off())).toBeNull();
    expect(keyAction(key("?"), off({ sheetOpen: true }))).toBeNull();
    expect(keyAction(key("Escape"), off({ drawerOpen: true }))).toBe("closeDrawer");
    expect(keyAction(key("Enter", { ctrlKey: true }), off({ target: "note" }))).toBe("sendReport");
    expect(keyAction(key("ArrowDown"), off({ target: "listbox" }))).toBe("next");
    expect(keyAction(key("Enter"), off({ target: "approve" }))).toBe("enterBlocked");
  });
});
