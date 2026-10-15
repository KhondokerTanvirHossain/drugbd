// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

import { Desk, makeReg, versionsAnswer } from "./desk-harness";

const NAPA = makeReg("napa");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("fetch", versionsAnswer(NAPA.all.map((r) => ({ conceptId: r.conceptId, displayStatus: r.displayStatus, ...r.version }))));
  actions.decide.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function commitWith(result: unknown) {
  actions.decide.mockResolvedValue(result);
  render(<Desk reg={NAPA}><p>napa</p></Desk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok"));
  fireEvent.keyDown(document.getElementById("desk")!, { key: "a" });
  await act(async () => { await vi.advanceTimersByTimeAsync(8_200); });
}

describe("decision bar states (§5.7)", () => {
  it("not saved: Board R's banner, and the promise points at Try again", async () => {
    await commitWith({ ok: false, code: "rate_limited" });
    expect(screen.getByText("Couldn't save your decision.")).toBeTruthy();
    expect(screen.getByText("Nothing was published. Check your connection and try again. Decision: Looks correct on Napa.")).toBeTruthy();
    expect(document.querySelector(".decision-promise")!.textContent).toBe("Your decision was not saved. Use Try again above.");
    expect(document.querySelector('[role="option"][aria-selected="true"] .rec-hint--warn')?.textContent).toBe("Decision not saved");
  });

  it("unconfirmed: the new banner, never 'nothing was published'", async () => {
    await commitWith({ ok: false, code: "failed" });
    expect(screen.getByText("Couldn't confirm your decision.")).toBeTruthy();
    expect(screen.queryByText(/Nothing was published/)).toBeNull();
    expect(screen.getAllByText("Decision not confirmed").length).toBeGreaterThan(0);
  });

  it("forbidden: the no-auth block replaces the actions and the key row", async () => {
    await commitWith({ ok: false, code: "forbidden" });
    expect(screen.getByText("Your account can't review this batch.")).toBeTruthy();
    expect(document.querySelector('[data-fk="approve"]')).toBeNull();
    expect(document.querySelector(".decision-keys")).toBeNull();
  });

  it("a refused commit (409 stage_failed) is a hint, not a banner", async () => {
    await commitWith({ ok: false, code: "stage_failed" });
    expect(document.querySelector(".decision-hint")!.textContent)
      .toBe("A check failed on this record. It returns to review after the fix and re-run. Nothing was saved.");
    expect(document.querySelector(".banner--crit")).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("Send shows its busy Sending label while the report is in flight (§5.10)", async () => {
    actions.decide.mockImplementation(() => new Promise(() => {}));
    render(<Desk reg={NAPA}><p>napa</p></Desk>);
    await act(async () => {});
    act(() => turnstile.props!.onToken!("tok"));
    fireEvent.keyDown(document.getElementById("desk")!, { key: "r" });
    fireEvent.change(document.getElementById("note")!, { target: { value: "strength should read 5 mg" } });
    fireEvent.keyDown(document.getElementById("note")!, { key: "Enter", ctrlKey: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(actions.decide).toHaveBeenCalledTimes(1);
    const send = screen.getByRole("button", { name: /Sending/ });
    expect(send.getAttribute("aria-busy")).toBe("true");
  });

  it("captcha at commit: the bot row, then Retry check sends without a new window", async () => {
    await commitWith({ ok: false, code: "captcha" });
    expect(screen.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeTruthy();
    expect(document.querySelector(".botcheck")!.textContent).toBe("Checking");
    actions.decide.mockResolvedValue({ ok: true, outcome: { review: "ok", displayStatus: "approved", batchStatus: "in_review",
      version: { extractedAt: NAPA.version.extractedAt, lastDecisionId: 9 }, replayed: false } });
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    act(() => turnstile.props!.onToken!("tok-2"));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(actions.decide).toHaveBeenCalledTimes(2);
    expect(actions.decide.mock.calls[1][0].requestId).toBe(actions.decide.mock.calls[0][0].requestId);
    expect(document.querySelector(".toast.is-running")).toBeNull();
  });
});
