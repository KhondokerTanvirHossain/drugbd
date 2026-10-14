// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions, router, turnstile, versionsAnswer } from "./desk-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/review/0001-pilot/x" }));
vi.mock("@/lib/desk-actions", () => ({
  decide: (i: unknown) => actions.decide(i), decideFormAction: vi.fn(),
  logRecordOpen: (...a: unknown[]) => actions.logRecordOpen(...(a as [])), logEvidence: (...a: unknown[]) => actions.logEvidence(...(a as [])),
  loadDiff: (...a: unknown[]) => actions.loadDiff(...(a as [])),
}));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: never) => { turnstile.props = p; return null; } }));

import type { RowRef } from "@/components/review/desk/context";
import { Desk, makeReg } from "./desk-harness";

const NAPA = makeReg("napa");
const V0 = NAPA.version;
const OUTCOME = { review: "ok", displayStatus: "approved", batchStatus: "in_review", version: { extractedAt: V0.extractedAt, lastDecisionId: 42 }, replayed: false };
const STALE = "This record changed — reload to review the latest data";
const desk = () => document.getElementById("desk")!;
const hintText = () => (document.querySelector(".decision-hint")?.hasAttribute("hidden") ? "" : document.querySelector(".decision-hint")?.textContent ?? "");
const live = () => document.querySelector('[data-desk="live"]')!.textContent;
const rowsWith = (napa: { extractedAt: string | null; lastDecisionId: number | null }) => NAPA.all.map((r) => ({
  conceptId: r.conceptId, displayStatus: r.displayStatus, ...(r.conceptId === NAPA.conceptId ? napa : r.version) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "requestAnimationFrame"] });
  vi.stubGlobal("fetch", versionsAnswer(rowsWith(V0)));
  for (const f of [...Object.values(actions), ...Object.values(router)]) f.mockClear();
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function mount(reg = NAPA, children: React.ReactNode = <p>napa as opened</p>) {
  const view = render(<Desk reg={reg}>{children}</Desk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok-1"));
  return view;
}
const settle = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("the undo window commits what the reviewer saw (§5.8)", () => {
  it("after 8 s: one decide with the viewed version and a requestId, then saved and the advance", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    expect(live()).toBe("");
    await settle(100);
    expect(live()).toBe("Napa marked correct. Publishes in 8 seconds. Press U to undo.");
    await settle(7_000);
    expect(actions.decide).not.toHaveBeenCalled();
    await settle(1_000);
    expect(actions.decide).toHaveBeenCalledTimes(1);
    const sent = actions.decide.mock.calls[0][0];
    expect(sent).toMatchObject({ batchId: "0001-pilot", conceptId: NAPA.conceptId, decision: "ok", note: "",
      extractedAt: V0.extractedAt, expectedLastDecisionId: null, turnstileToken: "tok-1" });
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    await settle(100);
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    expect(live()).toBe("Saved. Napa is approved by a pharmacist and published. Opened Clarith, record 9 of 10.");
  });

  it("U before the deadline: nothing is sent, ever", async () => {
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(3_000);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await settle(10_000);
    expect(actions.decide).not.toHaveBeenCalled();
    expect(live()).toBe("Undone. Napa was not saved.");
  });

  it("one polite live region (§10.2): written through lib/live-region, and a newer message cancels a pending one", async () => {
    await mount();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(30);                                   // "marked correct" is still pending (ANNOUNCE_DELAY_MS is 60)
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(live()).toBe("");                            // cleared at once
    await settle(100);
    expect(live()).toBe("Undone. Napa was not saved."); // the cancelled write never lands after it
  });

  it("leaving the desk or closing the tab while armed is blocked; unload discards without sending", async () => {
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const leave = screen.getByText("elsewhere");
    expect(fireEvent.click(leave)).toBe(false);
    expect(document.querySelector(".decision-hint")?.textContent).toBe("Napa is still in its undo window. Press U to undo it, or wait until it saves.");
    window.dispatchEvent(new Event("pagehide"));
    await settle(10_000);
    expect(actions.decide).not.toHaveBeenCalled();
  });

  it("in-batch links (a Show filter, the current batch) navigate in place and never cancel the window (§5.8.1)", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount(NAPA, <p>napa as opened <a href={`/review/0001-pilot/${NAPA.conceptId}?show=warn`} data-fk="f-warn">Warnings</a>{" "}
      <a href="/review/0001-pilot">this batch</a></p>);
    fireEvent.keyDown(desk(), { key: "a" });
    expect(fireEvent.click(screen.getByText("Warnings"))).toBe(false);
    expect(router.push).toHaveBeenLastCalledWith(`/review/0001-pilot/${NAPA.conceptId}?show=warn`, { scroll: false });
    expect(fireEvent.click(screen.getByText("this batch"))).toBe(false);
    expect(router.push).toHaveBeenLastCalledWith("/review/0001-pilot", { scroll: false });
    expect(hintText()).toBe("");
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
    await settle(8_200);
    expect(actions.decide).toHaveBeenCalledTimes(1);
  });

  it("the 1 s guard starts when the next record arrives, and A does nothing while it loads (§5.9, §5.8.4)", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    const view = await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    expect(router.push).toHaveBeenCalledWith("/review/0001-pilot/239-0407-023--clarith", { scroll: false });
    await settle(1_500);                                   // a slow server: Clarith has not arrived yet
    fireEvent.keyDown(desk(), { key: "a" });
    expect(document.querySelector(".toast")).toBeNull();
    expect(hintText()).toBe("");
    view.rerender(<Desk reg={makeReg("clarith")}><p>clarith detail</p></Desk>);
    await settle(10);
    fireEvent.keyDown(desk(), { key: "a" });
    expect(hintText()).toBe("Record changed to Clarith. Press A again to approve it.");
    expect(document.querySelector(".toast")).toBeNull();
    act(() => turnstile.props!.onToken!("tok-2"));          // the first token was used by the commit (single-use)
    await settle(1_000);
    fireEvent.keyDown(desk(), { key: "a" });
    expect(document.querySelector(".toast.is-running")).not.toBeNull();
  });

  it("after the last approval the complete view shows; opening a record from the list reads it (§5.7, §5.9)", async () => {
    const others = (rows: RowRef[]) => rows.map((r) => (r.conceptId === NAPA.conceptId ? r : { ...r, displayStatus: "approved" as const }));
    const last = { ...NAPA, rows: others(NAPA.rows), all: others(NAPA.all) };
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount(last);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_200);
    expect(screen.getByRole("button", { name: "Open record 1" })).toBeTruthy();
    expect(live()).toMatch(/Every record in batch 0001-pilot is approved\.$/);
    fireEvent.click(screen.getAllByRole("option")[2]);
    expect(router.push).toHaveBeenLastCalledWith(last.rows[2].href, { scroll: false });
    expect(screen.queryByRole("button", { name: "Open record 1" })).toBeNull();
  });

  it("a batch that is already approved opens in the complete view (§5.12)", async () => {
    await mount({ ...NAPA, complete: true });
    expect(screen.getByRole("button", { name: "Open record 1" })).toBeTruthy();
    expect(screen.queryByText("napa as opened")).toBeNull();
  });
});

describe("stale detection and held subtrees (§5.11, D45)", () => {
  it("a re-stamp found by the 20 s poll shows the banner, cancels the window and pauses the bar", async () => {
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    vi.stubGlobal("fetch", versionsAnswer(rowsWith({ extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: null })));
    await settle(20_000);
    expect(screen.getByText("This record changed — reload to review the latest data")).toBeTruthy();
    expect(document.querySelector(".toast")).toBeNull();
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("paused");
    expect(actions.decide).not.toHaveBeenCalled();
  });

  it("a refresh never swaps the open record: new props keep the opened subtree until Reload record", async () => {
    const view = await mount();
    const restamped = { extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: null };
    view.rerender(<Desk reg={makeReg("napa", {}, restamped)}><p>napa after the re-run</p></Desk>);
    await settle(100);
    expect(screen.getByText("napa as opened")).toBeTruthy();
    expect(screen.queryByText("napa after the re-run")).toBeNull();
    expect(screen.getByText(/The pipeline re-ran Napa after you opened it/)).toBeTruthy();
    fireEvent.keyDown(desk(), { key: "a" });
    expect(document.querySelector(".decision-hint")?.textContent).toBe("Decisions are paused. Reload the record first.");
    fireEvent.click(screen.getByRole("button", { name: "Reload record" }));
    await settle(100);
    expect(screen.getByText("napa after the re-run")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
    expect(live()).toBe("Record reloaded. Decisions are available again.");
  });

  it("a re-run keeps the evidence drawer on the evidence as opened until Reload record (§5.11, HeldRecord)", async () => {
    const view = await mount();
    const restamped = { extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: null };
    view.rerender(<Desk reg={makeReg("napa", {}, restamped)} evidence={<p>evidence after the re-run</p>}><p>napa after the re-run</p></Desk>);
    await settle(100);
    fireEvent.keyDown(desk(), { key: "e" });
    const drawer = document.getElementById("drawer")!;
    expect(drawer.hidden).toBe(false);
    expect(drawer.textContent).toContain("evidence body");
    expect(drawer.textContent).not.toContain("evidence after the re-run");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Reload record" }));
    await settle(100);
    expect(document.getElementById("drawer")!.textContent).toContain("evidence after the re-run");
    expect(document.getElementById("drawer")!.textContent).not.toContain("evidence body");
  });

  it("Reload record after the poll found a re-run waits for the refreshed record, then stays reloaded (§5.11)", async () => {
    const view = await mount();
    const restamped = { extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: null };
    vi.stubGlobal("fetch", versionsAnswer(rowsWith(restamped)));
    await settle(20_000);
    expect(screen.getByText(STALE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload record" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByText(STALE)).toBeTruthy();             // paused until the refreshed record arrives
    view.rerender(<Desk reg={makeReg("napa", {}, restamped)}><p>napa after the re-run</p></Desk>);
    await settle(100);
    expect(screen.queryByText(STALE)).toBeNull();
    expect(screen.getByText("napa after the re-run")).toBeTruthy();
    expect(live()).toBe("Record reloaded. Decisions are available again.");
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("ready");
    await settle(20_000);                                      // the next poll agrees with what is shown
    expect(screen.queryByText(STALE)).toBeNull();
  });

  it("a poll that lands while the decision is saving is the reviewer's own save, never another reviewer (D45)", async () => {
    let resolve: (v: unknown) => void = () => {};
    actions.decide.mockImplementation(() => new Promise((r) => { resolve = r; }));
    await mount();
    await settle(10_000);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);                                       // t = 18.1 s: committing, the decide call is in flight
    expect(actions.decide).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", versionsAnswer(rowsWith(OUTCOME.version)));   // the server already saved it as decision 42
    await settle(2_000);                                       // t = 20.1 s: the poll sees lastDecisionId 42
    expect(screen.queryByText(STALE)).toBeNull();
    await act(async () => { resolve({ ok: true, outcome: OUTCOME }); });
    await settle(100);
    expect(screen.queryByText(STALE)).toBeNull();
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("ready");
    expect(live()).toMatch(/^Saved\. Napa is approved by a pharmacist and published\./);
  });

  it("the reviewer's own save never makes the record stale", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: { ...OUTCOME, displayStatus: "issue" } });
    const view = await mount();
    fireEvent.keyDown(desk(), { key: "r" });
    fireEvent.change(document.getElementById("note")!, { target: { value: "strength should read 5 mg" } });
    expect(sessionStorage.getItem(`intellidrugs-draft:0001-pilot:${NAPA.conceptId}`)).toBe("strength should read 5 mg");
    fireEvent.keyDown(document.getElementById("note")!, { key: "Enter", ctrlKey: true });
    await settle(100);
    expect(actions.decide.mock.calls[0][0]).toMatchObject({ decision: "issue", note: "strength should read 5 mg" });
    expect(live()).toBe("Issue reported for Napa. An engineer will see your note.");
    expect(sessionStorage.getItem(`intellidrugs-draft:0001-pilot:${NAPA.conceptId}`)).toBeNull();
    view.rerender(<Desk reg={makeReg("napa", { displayStatus: "issue" }, OUTCOME.version)}><p>napa with the issue</p></Desk>);
    vi.stubGlobal("fetch", versionsAnswer(rowsWith(OUTCOME.version)));
    await settle(25_000);
    expect(screen.queryByText("This record changed — reload to review the latest data")).toBeNull();
    expect(screen.getByText("napa with the issue")).toBeTruthy();
  });

  it("an unconfirmed commit is not another reviewer; Try again resends the same requestId", async () => {
    actions.decide.mockRejectedValueOnce(new Error("network"));
    await mount();
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    expect(screen.getByText("Couldn't confirm your decision.")).toBeTruthy();
    const first = actions.decide.mock.calls[0][0];
    vi.stubGlobal("fetch", versionsAnswer(rowsWith({ extractedAt: V0.extractedAt, lastDecisionId: 42 })));
    await settle(20_000);
    expect(screen.queryByText("This record changed — reload to review the latest data")).toBeNull();
    actions.decide.mockResolvedValueOnce({ ok: true, outcome: { ...OUTCOME, replayed: true } });
    act(() => turnstile.props!.onToken!("tok-2"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle(100);
    expect(actions.decide.mock.calls[1][0].requestId).toBe(first.requestId);
    expect(actions.decide.mock.calls[1][0].extractedAt).toBe(first.extractedAt);
    expect(live()).toMatch(/^Saved\. Napa is approved by a pharmacist and published\./);
  });

  it("a failed poll (502, network) changes nothing (Review Focus 3)", async () => {
    await mount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    await settle(20_000);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    await settle(20_000);
    expect(screen.queryByText("This record changed — reload to review the latest data")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Your sign-in expired/)).toBeNull();
  });

  it("a 401 from the poll is the signed-out block, never the no-auth block", async () => {
    await mount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await settle(20_000);
    expect(screen.getByText("Sign in again")).toBeTruthy();
    expect(screen.queryByText("Your account can't review this batch.")).toBeNull();
  });
});

describe("Turnstile at commit (§5.8.5, Review Focus 1)", () => {
  it("a token older than 270 s is never sent: the widget resets, the desk waits 10 s, then a commit bot hold", async () => {
    await mount();                                             // tok-1 held at t = 0
    await settle(271_000);                                     // a background tab closed the window long after
    const resetBefore = turnstile.props!.resetKey ?? 0;
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    expect(actions.decide).not.toHaveBeenCalled();
    expect(turnstile.props!.resetKey).not.toBe(resetBefore);
    await settle(10_000);
    expect(actions.decide).not.toHaveBeenCalled();
    expect(screen.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeTruthy();
    expect(screen.queryByText("Couldn't confirm your decision.")).toBeNull();
  });

  it("the fresh token that arrives within 10 s is the one sent", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: OUTCOME });
    await mount();
    await settle(271_000);
    fireEvent.keyDown(desk(), { key: "a" });
    await settle(8_100);
    act(() => turnstile.props!.onToken!("tok-new"));
    await settle(100);
    expect(actions.decide).toHaveBeenCalledTimes(1);
    expect(actions.decide.mock.calls[0][0].turnstileToken).toBe("tok-new");
  });

  it("a report sent while the widget re-executes waits for the token instead of failing the bot check", async () => {
    actions.decide.mockResolvedValue({ ok: true, outcome: { ...OUTCOME, displayStatus: "issue" } });
    await mount();
    act(() => turnstile.props!.onToken!(null));                // a reset: no token held, the widget is re-executing
    fireEvent.keyDown(desk(), { key: "r" });
    fireEvent.change(document.getElementById("note")!, { target: { value: "strength should read 5 mg" } });
    fireEvent.keyDown(document.getElementById("note")!, { key: "Enter", ctrlKey: true });
    await settle(100);
    expect(live()).not.toMatch(/Bot check failed/);
    act(() => turnstile.props!.onToken!("tok-after-reset"));
    await settle(100);
    expect(actions.decide.mock.calls[0][0]).toMatchObject({ decision: "issue", turnstileToken: "tok-after-reset" });
    expect(live()).toBe("Issue reported for Napa. An engineer will see your note.");
  });
});
