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
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockClear();
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

describe("Dismiss issue on the desk (§5.7, §5.10a, §5.14)", () => {
  const ISSUE = { role: "pharmacist" as const, at: "2026-10-15T03:00:00Z", note: "strength should read 5 mg", mine: false };
  const PENDING = { review: "pending", displayStatus: "pending", batchStatus: "in_review",
    version: { extractedAt: "2026-10-11T21:28:09.250Z", lastDecisionId: 50 }, replayed: false };
  async function mountIssue(role: "senior" | "pharmacist" | "engineer" = "senior") {
    const reg = makeReg("napa", { displayStatus: "issue", openIssues: [ISSUE] });
    render(<Desk reg={reg} role={role}><DetailTools reg={reg} /><p>napa detail</p></Desk>);
    await act(async () => {});
    act(() => turnstile.props!.onToken!("tok-1"));
  }
  const panel = () => document.getElementById("bar-dismiss");
  const field = () => document.getElementById("dismiss-note") as HTMLTextAreaElement;
  const button = () => document.querySelector<HTMLButtonElement>('[data-fk="dismiss"]');
  const live = () => document.querySelector('[data-desk="live"]')!.textContent;
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

  it("a senior on an issue: the button, the D key row entry, and D opens the panel quoting the report", async () => {
    await mountIssue();
    expect(button()!.textContent).toBe("Dismiss issue D");
    expect(button()!.getAttribute("aria-keyshortcuts")).toBe("D");
    expect(button()!.getAttribute("aria-controls")).toBe("bar-dismiss");
    expect(document.querySelector(".decision-keys")!.textContent).toContain("R reportD dismiss issueE evidence");
    key("d");
    expect(button()!.getAttribute("aria-expanded")).toBe("true");
    expect(panel()!.getAttribute("role")).toBe("group");
    expect(document.activeElement).toBe(field());
    expect(panel()!.textContent).toContain("Dismiss this issue");
    expect(panel()!.textContent).toContain("Reported by a pharmacist on 15/10/2026 09:00 Dhaka: strength should read 5 mg");
    expect(panel()!.textContent).toContain("Dismissing records that the report was a mistake.");
    expect(panel()!.textContent).toContain("5 to 1000 characters. Don't include patient names or other personal health details.");
    desk().focus();
    key("d");
    expect(document.activeElement).toBe(field());
  });

  it("a pharmacist or an engineer sees the issue but no Dismiss control; D does nothing and shows no hint", async () => {
    for (const role of ["pharmacist", "engineer"] as const) {
      await mountIssue(role);
      expect(button()).toBeNull();
      key("d");
      expect(panel()).toBeNull();
      expect(hint()).toBe("");
      expect(document.querySelector(".decision-keys")!.textContent).not.toContain("dismiss issue");
      cleanup();
    }
  });

  it("Esc keeps the draft and Cancel discards it; focus returns to Dismiss issue each time", async () => {
    await mountIssue();
    key("d");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    key("Escape", field());
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(sessionStorage.getItem("intellidrugs-dismiss-draft:0001-pilot:186-0030-006--napa")).toBe("the register says 500 mg");
    key("d");
    expect(field().value).toBe("the register says 500 mg");
    fireEvent.click(within(panel()!).getByRole("button", { name: /^Cancel/ }));
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
    key("d");
    expect(field().value).toBe("");
  });

  it("opening Dismiss closes Report and keeps its draft; a click on Dismiss while open closes it, focus staying on it", async () => {
    await mountIssue();
    key("r");
    fireEvent.change(document.getElementById("note")!, { target: { value: "another report" } });
    fireEvent.click(button()!);
    expect(document.getElementById("bar-report")).toBeNull();
    expect(panel()).not.toBeNull();
    expect(sessionStorage.getItem("intellidrugs-draft:0001-pilot:186-0030-006--napa")).toBe("another report");
    button()!.focus();
    fireEvent.click(button()!);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("Ctrl or Cmd Enter sends, Enter alone never does, and under 5 characters shows the error", async () => {
    await mountIssue();
    actions.decide.mockResolvedValue({ ok: true, outcome: PENDING });
    key("d");
    fireEvent.change(field(), { target: { value: "abcd" } });
    key("Enter", field());
    expect(actions.decide).not.toHaveBeenCalled();
    key("Enter", field(), { ctrlKey: true });
    expect(panel()!.querySelector(".field-error")?.textContent).toBe("Add at least 5 characters so the team knows why the report was dismissed.");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    expect(panel()!.querySelector(".field-error")).toBeNull();
    await act(async () => { key("Enter", field(), { metaKey: true }); });
    expect(actions.decide).toHaveBeenCalledTimes(1);
    expect(actions.decide.mock.calls[0][0]).toMatchObject({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", decision: "dismiss",
      note: "the register says 500 mg", extractedAt: "2026-10-11T21:28:09.250Z", expectedLastDecisionId: null, turnstileToken: "tok-1" });
  });

  it("the dismissal note is counted in code points (Review Focus 4)", async () => {
    await mountIssue();
    actions.decide.mockResolvedValue({ ok: true, outcome: PENDING });
    key("d");
    fireEvent.change(field(), { target: { value: "😀😀😀😀" } });
    expect(panel()!.textContent).toContain("4 / 1000");
    key("Enter", field(), { ctrlKey: true });
    expect(panel()!.querySelector(".field-error")?.textContent).toBe("Add at least 5 characters so the team knows why the report was dismissed.");
    expect(actions.decide).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "অবৈধ রিপোর্ট" } });
    expect(panel()!.textContent).toContain("12 / 1000");
    await act(async () => { key("Enter", field(), { ctrlKey: true }); });
    expect(actions.decide).toHaveBeenCalledTimes(1);
    expect(actions.decide.mock.calls[0][0].note).toBe("অবৈধ রিপোর্ট");
  });

  it("on success: the panel closes, the button goes, focus is on Looks correct, it is announced and nothing advances", async () => {
    await mountIssue();
    actions.decide.mockResolvedValue({ ok: true, outcome: PENDING });
    key("d");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    await act(async () => { key("Enter", field(), { ctrlKey: true }); });
    expect(panel()).toBeNull();
    expect(button()).toBeNull();
    expect(document.activeElement?.getAttribute("data-fk")).toBe("approve");
    expect(router.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("intellidrugs-dismiss-draft:0001-pilot:186-0030-006--napa")).toBeNull();
    await settle();
    expect(live()).toBe("Issue dismissed for Napa. The record is back in review for a pharmacist.");
  });

  it("a lost answer: the report channel's banner with the dismissal copy, never the approval banner; Try again resends the same op", async () => {
    await mountIssue();
    actions.decide.mockRejectedValueOnce(new Error("network"));
    key("d");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    await act(async () => { key("Enter", field(), { ctrlKey: true }); });
    const bar = document.getElementById("decision-bar")!;
    expect(within(bar).getByText("Couldn't confirm your dismissal.")).toBeTruthy();
    expect(within(bar).getByText("We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice.")).toBeTruthy();
    expect(bar.textContent).not.toContain("Decision: Looks correct on");
    expect(bar.querySelector(".decision-promise")!.textContent)
      .toBe("An issue is open on this record. If the report was a mistake, dismiss it. Otherwise it returns to review after the fix and re-run.");
    expect(panel()).not.toBeNull();
    actions.decide.mockResolvedValueOnce({ ok: true, outcome: PENDING });
    act(() => turnstile.props!.onToken!("tok-2"));
    await act(async () => { fireEvent.click(within(bar).getByRole("button", { name: "Try again" })); });
    const [first, second] = actions.decide.mock.calls.map((c) => c[0]);
    expect(second).toMatchObject({ decision: "dismiss", note: first.note, requestId: first.requestId, extractedAt: first.extractedAt,
      expectedLastDecisionId: first.expectedLastDecisionId, turnstileToken: "tok-2" });
  });

  it("a 409 no_issue: the hint and a refresh; when the record comes back pending the panel closes, its draft stays, nothing resends", async () => {
    const reg = makeReg("napa", { displayStatus: "issue", openIssues: [ISSUE] });
    const view = render(<Desk reg={reg} role="senior"><DetailTools reg={reg} /><p>napa detail</p></Desk>);
    await act(async () => {});
    act(() => turnstile.props!.onToken!("tok-1"));
    actions.decide.mockResolvedValueOnce({ ok: false, code: "no_issue" });
    key("d");
    fireEvent.change(field(), { target: { value: "the register says 500 mg" } });
    await act(async () => { key("Enter", field(), { ctrlKey: true }); });
    expect(actions.decide).toHaveBeenCalledTimes(1);
    expect(hint()).toBe("No issue is open on this record any more. Nothing was saved.");
    expect(router.refresh).toHaveBeenCalled();
    // the refresh: another senior dismissed it, so the same record registers again as pending
    const pending = makeReg("napa", { displayStatus: "pending", openIssues: [] });
    view.rerender(<Desk reg={pending} role="senior"><DetailTools reg={pending} /><p>napa detail</p></Desk>);
    await act(async () => {});
    expect(panel()).toBeNull();
    expect(button()).toBeNull();
    expect(sessionStorage.getItem("intellidrugs-dismiss-draft:0001-pilot:186-0030-006--napa")).toBe("the register says 500 mg");
    expect(document.querySelector('[data-fk="approve"]')!.getAttribute("aria-disabled")).not.toBe("true");
    actions.decide.mockClear();
    key("Enter", desk(), { ctrlKey: true });
    key("d");
    expect(panel()).toBeNull();
    expect(hint()).toBe("No issue is open on this record.");
    expect(actions.decide).not.toHaveBeenCalled();
  });

  it("the shortcuts sheet lists D for a senior only", async () => {
    await mountIssue();
    key("?");
    expect(within(screen.getByRole("dialog")).getByText("Dismiss an open issue")).toBeTruthy();
    cleanup();
    await mountIssue("pharmacist");
    key("?");
    expect(within(screen.getByRole("dialog")).queryByText("Dismiss an open issue")).toBeNull();
  });
});
