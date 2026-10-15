// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions, router, turnstile } from "./desk-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/review/0001-pilot/x" }));
vi.mock("@/lib/desk-actions", () => ({
  decide: (i: unknown) => actions.decide(i), decideFormAction: vi.fn(),
  logRecordOpen: (...a: unknown[]) => actions.logRecordOpen(...(a as [])), logEvidence: (...a: unknown[]) => actions.logEvidence(...(a as [])),
  loadDiff: (...a: unknown[]) => actions.loadDiff(...(a as [])),
}));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: never) => { turnstile.props = p; return null; } }));

import DetailTools from "@/components/review/desk/DetailTools";
import { Desk, makeReg } from "./desk-harness";

const desk = () => document.getElementById("desk")!;
const key = (k: string, target: Element = desk(), mods = {}) => fireEvent.keyDown(target, { key: k, ...mods });
const hint = () => document.querySelector(".decision-hint")?.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
  for (const f of Object.values(actions)) f.mockClear();
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mount(singleKeys = true) {
  // The record page puts DetailTools (Evidence E, data-fk="ev") in the detail, which the drawer returns focus to (§5.5.1).
  const reg = makeReg("napa");
  render(<Desk reg={reg} singleKeys={singleKeys}><DetailTools reg={reg} /><p>napa detail</p></Desk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok-1"));
}

describe("keyboard model (§5.14)", () => {
  it("A arms the window and shows the toast; letters are ignored while typing and with Ctrl, Cmd or Alt", async () => {
    await mount();
    const search = document.querySelector<HTMLInputElement>('[data-desk="search"]')!;
    key("a", search);
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) key("a", desk(), mods);
    expect(document.querySelector(".toast")).toBeNull();
    key("A");
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
    key("u");
    expect(document.querySelector(".toast")).toBeNull();
  });

  it("Enter on Looks correct never approves, with or without modifiers", async () => {
    await mount();
    const approve = document.querySelector<HTMLButtonElement>('[data-fk="approve"]')!;
    for (const mods of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) key("Enter", approve, mods);
    expect(document.querySelector(".toast")).toBeNull();
    expect(hint()).toBe("Enter does not approve. Press A, or Space on this button.");
  });

  it("A and R with the evidence drawer open only say to close it first", async () => {
    await mount();
    key("e");
    expect(document.getElementById("drawer")!.hidden).toBe(false);
    expect(document.activeElement?.getAttribute("data-fk")).toBe("drawer-close");
    key("a", document.activeElement!);
    expect(document.querySelector(".toast")).toBeNull();
    expect(hint()).toBe("Close the evidence first (Esc).");
    key("r", document.activeElement!);
    expect(document.getElementById("bar-report")).toBeNull();
    expect(actions.logEvidence).toHaveBeenCalledTimes(1);
  });

  it("Esc closes the sheet, then the drawer, then the note (keeping it)", async () => {
    await mount();
    key("e");
    key("?", document.activeElement!);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    key("Escape", document.activeElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("drawer")!.hidden).toBe(false);
    key("Escape", document.activeElement!);
    expect(document.getElementById("drawer")!.hidden).toBe(true);
    expect(document.activeElement?.getAttribute("data-fk")).toBe("ev");
    key("r");
    const note = document.getElementById("note") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(note);
    fireEvent.change(note, { target: { value: "strength should read 5 mg" } });
    key("Escape", note);
    expect(document.getElementById("bar-report")).toBeNull();
    expect(document.activeElement?.getAttribute("data-fk")).toBe("report");
    key("r");
    expect((document.getElementById("note") as HTMLTextAreaElement).value).toBe("strength should read 5 mg");
  });

  it("the sheet traps focus and Tab cycles through its settings", async () => {
    await mount();
    key("?");
    const sheet = screen.getByRole("dialog");
    const focusable = [...sheet.querySelectorAll<HTMLElement>("button")];
    expect(focusable.map((b) => b.textContent)).toEqual(["Close Esc", "8 seconds", "20 seconds", "60 seconds", "On", "Off"]);
    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(focusable[focusable.length - 1], { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(focusable[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    expect(within(sheet).getByText("Looks correct, then an 8-second undo window")).toBeTruthy();
    expect(document.querySelector(".chrome-toolbar")!.hasAttribute("inert")).toBe(true);
  });

  it("single-key shortcuts Off: letters do nothing, no key row and no aria-keyshortcuts; Esc and Ctrl Enter still work", async () => {
    await mount(false);
    for (const k of ["a", "u", "r", "j", "k", "e", "s", "?"]) key(k);
    expect(document.querySelector(".toast")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("drawer")!.hidden).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    expect(document.querySelector(".decision-keys")).toBeNull();
    expect(document.querySelector('[data-fk="approve"]')!.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(desk().getAttribute("aria-label")).toBe("IntelliDrugs review workspace.");
    fireEvent.click(document.querySelector('[data-fk="report"]')!);
    const note = document.getElementById("note") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "abc" } });
    key("Enter", note, { ctrlKey: true });
    expect(document.querySelector(".field-error")?.textContent).toBe("Add at least 5 characters so the engineer knows what to fix.");
    key("Escape", note);
    expect(document.getElementById("bar-report")).toBeNull();
    fireEvent.click(document.querySelector('[data-fk="approve"]')!);
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
  });

  it("A while the next record is loading does nothing and shows no hint (§5.8.4)", async () => {
    await mount();
    key("j");
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    key("a");
    expect(document.querySelector(".toast")).toBeNull();
    expect(document.querySelector(".decision-hint")!.hasAttribute("hidden")).toBe(true);
  });

  it("the listbox has options with no focusable link inside, and J moves in the visible order", async () => {
    await mount();
    const list = screen.getByRole("listbox", { name: "Records in 0001-pilot" });
    expect(list.getAttribute("tabindex")).toBe("0");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(10);
    for (const a of list.querySelectorAll("a")) {
      expect(a.getAttribute("tabindex")).toBe("-1");
      expect(a.getAttribute("role")).toBe("presentation");
    }
    expect(options[7].getAttribute("aria-selected")).toBe("true");
    expect(list.getAttribute("aria-activedescendant")).toBe(options[7].id);
    key("j");
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    key("ArrowUp", list);
    expect(router.push).toHaveBeenLastCalledWith("/review/0001-pilot/185-0241-015--g-metformin", { scroll: false });
  });
});
