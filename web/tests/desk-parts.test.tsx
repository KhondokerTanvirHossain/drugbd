// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import CompleteView from "@/components/review/desk/CompleteView";
import DetailTools from "@/components/review/desk/DetailTools";
import ListSearch from "@/components/review/desk/ListSearch";
import RecordListbox from "@/components/review/desk/RecordListbox";
import ShortcutsSheet from "@/components/review/desk/ShortcutsSheet";
import StaleBanner from "@/components/review/desk/StaleBanner";
import Toast from "@/components/review/desk/Toast";
import { DRAFT_PREFIX, clearAllDrafts, clearDraft, draftKey, loadDraft, saveDraft } from "@/components/review/desk/drafts";
import type { Op } from "@/components/review/desk/commit-machine";
import { makeReg } from "./desk-reg";
import { WithDesk, stubDesk } from "./desk-stub";

const NAPA = makeReg("napa");
const OP: Op = { conceptId: NAPA.conceptId, name: "Napa", role: "pharmacist", decision: "ok", note: "", viewedVersion: NAPA.version,
  requestId: "11111111-2222-4333-8444-555555555555" };

beforeEach(() => { sessionStorage.clear(); clearAllDrafts(); for (const f of Object.values(router)) f.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("note drafts (§5.10)", () => {
  it("are kept per record in sessionStorage and cleared on send or sign-out", () => {
    saveDraft("0001-pilot", "a", "strength should read 5 mg");
    saveDraft("0001-pilot", "b", "company is wrong");
    sessionStorage.setItem("other-key", "kept");
    expect(draftKey("0001-pilot", "a")).toBe(`${DRAFT_PREFIX}0001-pilot:a`);
    expect(sessionStorage.getItem("intellidrugs-draft:0001-pilot:a")).toBe("strength should read 5 mg");
    expect(loadDraft("0001-pilot", "a")).toBe("strength should read 5 mg");
    clearDraft("0001-pilot", "a");
    expect(loadDraft("0001-pilot", "a")).toBe("");
    clearAllDrafts();
    expect(loadDraft("0001-pilot", "b")).toBe("");
    expect(sessionStorage.getItem("other-key")).toBe("kept");
  });

  it("fall back to memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    saveDraft("0001-pilot", "a", "kept in memory");
    expect(loadDraft("0001-pilot", "a")).toBe("kept in memory");
  });
});

describe("toast (§5.8.4)", () => {
  it("running: name, the reviewer's window, Undo, and the countdown as the one allowed custom property", () => {
    const onUndo = vi.fn();
    render(<Toast view={{ mode: "running", op: OP }} seconds={20} singleKeys onUndo={onUndo} />);
    const toast = document.querySelector<HTMLElement>(".toast.is-running")!;
    expect(toast.style.getPropertyValue("--dur-commit")).toBe("20000ms");
    expect(toast.querySelector(".toast-msg")!.textContent).toContain("Napa marked correct.");
    expect(toast.querySelector(".toast-sub")!.textContent).toContain("Publishes in 20 seconds.");
    const undo = screen.getByRole("button", { name: /Undo/ });
    expect(undo.getAttribute("aria-keyshortcuts")).toBe("U");
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("saving: no Undo and no bar; nothing at all when idle", () => {
    const { rerender } = render(<Toast view={{ mode: "saving", op: OP }} seconds={8} singleKeys onUndo={vi.fn()} />);
    expect(document.querySelector(".toast-msg")!.textContent).toBe("Napa saving.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector(".toast-bar")).toBeNull();
    rerender(<Toast view={null} seconds={8} singleKeys onUndo={vi.fn()} />);
    expect(document.querySelector(".toast")).toBeNull();
  });
});

describe("shortcuts sheet (§5.14)", () => {
  it("is a modal dialog that focuses Close, traps Tab, closes on the scrim and reports setting choices", () => {
    const onClose = vi.fn(), onUndo = vi.fn(), onKeys = vi.fn();
    render(<ShortcutsSheet open onClose={onClose} undoSeconds={8} singleKeys sendKeys="Ctrl Enter" onUndo={onUndo} onKeys={onKeys} />);
    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    const buttons = [...sheet.querySelectorAll<HTMLElement>("button")];
    expect(document.activeElement).toBe(buttons[0]);
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(buttons[buttons.length - 1], { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.click(within(sheet).getByRole("button", { name: "60 seconds" }));
    expect(onUndo).toHaveBeenCalledWith(60);
    fireEvent.click(within(sheet).getByRole("button", { name: "Off" }));
    expect(onKeys).toHaveBeenCalledWith(false);
    fireEvent.mouseDown(document.querySelector(".sheet-scrim")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed", () => {
    render(<ShortcutsSheet open={false} onClose={vi.fn()} undoSeconds={8} singleKeys sendKeys="Ctrl Enter" onUndo={vi.fn()} onKeys={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("record list (§5.4)", () => {
  it("without the desk: plain links, the open one aria-current", () => {
    render(<WithDesk desk={stubDesk(NAPA, { ready: false })}><RecordListbox reg={NAPA} /></WithDesk>);
    expect(screen.queryByRole("listbox")).toBeNull();
    const current = document.querySelector('a[aria-current="page"]')!;
    expect(current.getAttribute("href")).toBe(NAPA.all[7].href);
  });

  it("with the desk: a listbox whose links leave the tab order; a click navigates through the desk; hints follow the desk", () => {
    const desk = stubDesk(NAPA, { netErrFor: (id) => (id === NAPA.all[2].conceptId ? "unknown" : null) });
    render(<WithDesk desk={desk}><RecordListbox reg={NAPA} /></WithDesk>);
    const list = screen.getByRole("listbox", { name: "Records in 0001-pilot" });
    const options = within(list).getAllByRole("option");
    expect(options[7].getAttribute("aria-selected")).toBe("true");
    for (const a of list.querySelectorAll("a")) {
      expect(a.getAttribute("tabindex")).toBe("-1");
      expect(a.getAttribute("role")).toBe("presentation");
    }
    expect(options[2].querySelector(".rec-hint")!.textContent).toBe("Decision not confirmed");
    fireEvent.click(options[3]);
    expect(desk.navigate).toHaveBeenCalledWith(NAPA.all[3].href);
  });
});

describe("list search (§5.3)", () => {
  it("debounces 250 ms and replaces the URL, keeping the filter", () => {
    vi.useFakeTimers();
    const reg = makeReg("napa", { show: "warn" });
    render(<WithDesk desk={stubDesk(reg)}><ListSearch batchId="0001-pilot" conceptId={reg.conceptId} show="warn" q="" /></WithDesk>);
    fireEvent.change(document.querySelector('[data-desk="search"]')!, { target: { value: "para" } });
    act(() => { vi.advanceTimersByTime(249); });
    expect(router.replace).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(router.replace).toHaveBeenCalledWith(`/review/0001-pilot/${reg.conceptId}?show=warn&q=para`, { scroll: false });
  });

  const box = () => document.querySelector('[data-desk="search"]') as HTMLInputElement;
  const type = (v: string) => fireEvent.change(box(), { target: { value: v } });

  it("keeps what was typed while the server echoes an older q, and follows an external change", () => {
    vi.useFakeTimers();
    const reg = makeReg("napa", { show: "warn" });
    const ui = (q: string) => <WithDesk desk={stubDesk(reg)}><ListSearch batchId="0001-pilot" conceptId={reg.conceptId} show="warn" q={q} /></WithDesk>;
    const { rerender } = render(ui(""));
    type("par");
    act(() => { vi.advanceTimersByTime(250); });
    rerender(ui("pa"));                       // a stale echo of an earlier keystroke
    expect(box().value).toBe("par");
    rerender(ui("par"));                      // the echo of what was sent
    expect(box().value).toBe("par");
    rerender(ui(""));                         // external: Show all, a filter link, back/forward
    expect(box().value).toBe("");
  });

  it("does not overwrite text being typed with an external q while a send is pending", () => {
    vi.useFakeTimers();
    const reg = makeReg("napa", { show: "warn" });
    const ui = (q: string) => <WithDesk desk={stubDesk(reg)}><ListSearch batchId="0001-pilot" conceptId={reg.conceptId} show="warn" q={q} /></WithDesk>;
    const { rerender } = render(ui("a"));
    box().focus();
    type("ab");
    rerender(ui(""));
    expect(box().value).toBe("ab");
  });

  it("clears its timer on unmount and when the record or filter changes, so an old q never replays", () => {
    vi.useFakeTimers();
    const reg = makeReg("napa", { show: "warn" });
    const ui = (conceptId: string, show: "warn" | "all") => <WithDesk desk={stubDesk(reg)}><ListSearch batchId="0001-pilot" conceptId={conceptId} show={show} q="" /></WithDesk>;
    const { rerender, unmount } = render(ui(reg.conceptId, "warn"));
    type("par");
    rerender(ui("other-record", "warn"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).not.toHaveBeenCalled();
    expect(box().value).toBe("");
    type("par");
    rerender(ui("other-record", "all"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).not.toHaveBeenCalled();
    type("par");
    unmount();
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("the registered Esc clear cancels a pending timer, empties the field and replaces with scroll: false", () => {
    vi.useFakeTimers();
    const reg = makeReg("napa", { show: "warn" });
    const desk = stubDesk(reg);
    render(<WithDesk desk={desk}><ListSearch batchId="0001-pilot" conceptId={reg.conceptId} show="warn" q="" /></WithDesk>);
    const clear = (desk.registerSearchClear as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]).filter(Boolean).at(-1) as () => void;
    type("par");
    act(() => { clear(); });
    expect(box().value).toBe("");
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(`/review/0001-pilot/${reg.conceptId}?show=warn`, { scroll: false });
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});

describe("record row focus ring without JavaScript (§10.1)", () => {
  const css = readFileSync(join(process.cwd(), "components/review/desk.module.css"), "utf8");
  it("rings the .rec row, and the selected row with --on-accent and an accent halo, when its link has keyboard focus", () => {
    expect(css).toMatch(/:global\(\.rec\):has\(> \.recLink:focus-visible\)\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
    expect(css).toMatch(/:global\(\.rec\.is-selected\):has\(> \.recLink:focus-visible\)\s*\{[^}]*outline-color:\s*var\(--on-accent\)[^}]*box-shadow:\s*0 0 0 2px var\(--accent\)/);
  });
});

describe("detail tools (§5.5.1)", () => {
  it("links without the desk; buttons with key labels with it, and none when single keys are off", () => {
    const { unmount } = render(<WithDesk desk={stubDesk(NAPA, { ready: false })}><DetailTools reg={NAPA} /></WithDesk>);
    const src = screen.getByRole("link", { name: "DGDA source" });
    expect(src.getAttribute("target")).toBe("_blank");
    expect(src.getAttribute("rel")).toBe("noopener noreferrer");
    unmount();
    const desk = stubDesk(NAPA);
    const r = render(<WithDesk desk={desk}><DetailTools reg={NAPA} /></WithDesk>);
    const ev = document.querySelector('[data-fk="ev"]')!;
    expect(ev.getAttribute("aria-keyshortcuts")).toBe("E");
    expect(ev.getAttribute("aria-controls")).toBe("drawer");
    fireEvent.click(document.querySelector('[data-fk="next"]')!);
    expect(desk.move).toHaveBeenCalledWith(1);
    r.unmount();
    render(<WithDesk desk={stubDesk(NAPA, { singleKeys: false })}><DetailTools reg={NAPA} /></WithDesk>);
    expect(document.querySelectorAll("[aria-keyshortcuts]")).toHaveLength(0);
  });
});

describe("stale banner and complete view (§5.11, §5.12)", () => {
  it("re-run: the re-run body, See what changed when a diff exists, and Reload record", () => {
    const desk = stubDesk(NAPA, { diff: [{ field: "Trade name", before: "Napa", now: "Napa Extra" }] });
    render(<WithDesk desk={desk}><StaleBanner name="Napa" reason="rerun" /></WithDesk>);
    expect(screen.getByText("This record changed — reload to review the latest data")).toBeTruthy();
    expect(screen.getByText(/The pipeline re-ran Napa after you opened it/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See what changed" }));
    expect(desk.toggleDiff).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload record" }));
    expect(desk.reloadOpen).toHaveBeenCalled();
  });

  it("another reviewer: its own body and no diff button", () => {
    render(<WithDesk desk={stubDesk(NAPA, { diff: [{ field: "Trade name", before: "a", now: "b" }] })}><StaleBanner name="Napa" reason="other" /></WithDesk>);
    expect(screen.getByText(/Another reviewer decided on Napa after you opened it/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See what changed" })).toBeNull();
  });

  it("complete: the approved title and Open record 1", () => {
    const desk = stubDesk(NAPA);
    render(<WithDesk desk={desk}><CompleteView /></WithDesk>);
    expect(screen.getByRole("heading", { name: "Batch 0001-pilot approved. 10 records are now public." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open record 1" }));
    expect(desk.openFirst).toHaveBeenCalled();
  });
});
