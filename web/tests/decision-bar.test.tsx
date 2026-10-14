// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/lib/desk-actions", () => ({ decideFormAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));

import DecisionBar from "@/components/review/desk/DecisionBar";
import DeskRecordContext from "@/components/review/desk/DeskRecordContext";
import { initialMachine, type MachineState, type Op } from "@/components/review/desk/commit-machine";
import { barFromRegistration } from "@/components/review/desk/context";
import { makeReg } from "./desk-reg";
import { WithDesk, stubDesk } from "./desk-stub";

const NAPA = makeReg("napa");
const OP: Op = { conceptId: NAPA.conceptId, name: "Napa", role: "pharmacist", decision: "ok", note: "", viewedVersion: NAPA.version,
  requestId: "11111111-2222-4333-8444-555555555555" };
const withMachine = (over: Partial<MachineState>) => {
  const machine = { ...initialMachine(8), ...over };
  return stubDesk(NAPA, { machine, bar: { ...barFromRegistration(NAPA, "pharmacist", 8), machine } });
};
const bar = (desk = stubDesk(NAPA)) => render(<WithDesk desk={desk}><DecisionBar reg={NAPA} fallbackWidget={<div className="cf-turnstile" />} /></WithDesk>);

afterEach(cleanup);

describe("the decision bar rendered from desk state (§5.7)", () => {
  it("ready: the promise, Report issue and Looks correct with their keys, the key row", () => {
    bar();
    expect(document.querySelector(".decision-promise")!.textContent).toMatch(/^You're reviewing as a pharmacist\./);
    expect(document.querySelector('[data-fk="approve"]')!.getAttribute("aria-keyshortcuts")).toBe("A");
    expect(document.querySelector('[data-fk="report"]')!.getAttribute("aria-keyshortcuts")).toBe("R");
    expect(document.querySelector(".decision-keys")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("ready");
  });

  it("not saved and unconfirmed: two different banners, each with Try again", () => {
    const desk = withMachine({ commit: { kind: "netErr", op: OP, saved: "no" } });
    const r = bar(desk);
    expect(screen.getByText("Couldn't save your decision.")).toBeTruthy();
    expect(screen.getByText("Nothing was published. Check your connection and try again. Decision: Looks correct on Napa.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(desk.tryAgain).toHaveBeenCalled();
    r.unmount();
    bar(withMachine({ commit: { kind: "netErr", op: OP, saved: "unknown" } }));
    expect(screen.getByText("Couldn't confirm your decision.")).toBeTruthy();
    expect(screen.queryByText(/Nothing was published/)).toBeNull();
  });

  it("forbidden and signed out replace the actions and the key row", () => {
    const r = bar(withMachine({ auth: "forbidden" }));
    expect(screen.getByText("Your account can't review this batch.")).toBeTruthy();
    expect(document.querySelector('[data-fk="approve"]')).toBeNull();
    expect(document.querySelector(".decision-keys")).toBeNull();
    r.unmount();
    bar(withMachine({ auth: "signedOut" }));
    expect(screen.getByText("Your sign-in expired. Your decision on Napa was not saved.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toMatch(/^\/signin\?returnTo=/);
  });

  it("the report panel counts code points, and pauses Send while stale", () => {
    const desk = stubDesk(NAPA, { reportOpen: true, note: "😀😀😀😀", bar: { ...barFromRegistration(NAPA, "pharmacist", 8), stale: true } });
    bar(desk);
    expect(screen.getByText("4 / 1000")).toBeTruthy();
    expect(screen.getByText("Sending is paused until you reload the record. Your note is kept.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send report/ }).getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("decision-bar")!.getAttribute("data-state")).toBe("paused");
  });

  it("Send report shows its busy Sending label while the report is in flight (§5.10, Task 10 Ruling)", () => {
    const machine: MachineState = { ...initialMachine(8), report: { kind: "sending", op: { ...OP, decision: "issue", note: "wrong strength" } } };
    bar(stubDesk(NAPA, { machine, reportOpen: true, note: "wrong strength", bar: { ...barFromRegistration(NAPA, "pharmacist", 8), machine } }));
    const send = screen.getByRole("button", { name: /Sending/ });
    expect(send.getAttribute("aria-busy")).toBe("true");
  });

  it("a bot hold shows the bot row with Retry check", () => {
    const desk = withMachine({ commit: { kind: "botHold", hold: "commit", op: OP } });
    bar(desk);
    expect(screen.getByText("We couldn't confirm you're a person. Your decision is kept. Retry the check to continue.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(desk.retryCheck).toHaveBeenCalled();
  });

  it("single-key shortcuts off: no key row and no aria-keyshortcuts", () => {
    bar(stubDesk(NAPA, { singleKeys: false }));
    expect(document.querySelector(".decision-keys")).toBeNull();
    expect(document.querySelectorAll("[aria-keyshortcuts]")).toHaveLength(0);
  });

  it("before the desk runs: the native form with the version, a requestId and the implicit widget (§5.8.6)", () => {
    bar(stubDesk(NAPA, { ready: false }));
    const form = document.querySelector("form.decision-main")!;
    const value = (n: string) => form.querySelector<HTMLInputElement>(`input[name="${n}"]`)!.value;
    expect(value("extractedAt")).toBe(NAPA.version.extractedAt);
    expect(value("expectedLastDecisionId")).toBe("");
    expect(value("requestId")).toBe(NAPA.requestId);
    expect(form.querySelector(".cf-turnstile")).not.toBeNull();
    expect(form.querySelector('button[type="submit"]')!.textContent).toBe("Looks correct");
  });
});

describe("DeskRecordContext (§4.2, §5.11)", () => {
  it("registers the record with the desk and renders the subtree the desk holds", () => {
    const held = <p>napa as opened</p>;
    const desk = stubDesk(NAPA, { staleFor: () => "rerun", subtree: () => held });
    render(<WithDesk desk={desk}>
      <DeskRecordContext reg={NAPA} filters={null} evidence={<p>evidence body</p>} fallbackWidget={null} confirm={null} emptyText={null} pane={null}>
        <p>napa after the re-run</p>
      </DeskRecordContext>
    </WithDesk>);
    expect(desk.register).toHaveBeenCalledWith(NAPA, expect.anything());
    expect(screen.getByText("napa as opened")).toBeTruthy();
    expect(screen.queryByText("napa after the re-run")).toBeNull();
    expect(screen.getByText("This record changed — reload to review the latest data")).toBeTruthy();
    expect(document.getElementById("drawer")!.hidden).toBe(true);
  });

  it("the complete view replaces the record; an empty view offers Show all", () => {
    render(<WithDesk desk={stubDesk(NAPA, { complete: true })}>
      <DeskRecordContext reg={{ ...NAPA, rows: [] }} filters={null} evidence={null} fallbackWidget={null} confirm={null}
        emptyText="No records with an issue reported." pane={null}><p>napa</p></DeskRecordContext>
    </WithDesk>);
    expect(screen.getByRole("button", { name: "Open record 1" })).toBeTruthy();
    expect(screen.queryByText("napa")).toBeNull();
    const all = screen.getByRole("link", { name: "Show all 10 records" });
    expect(all.getAttribute("href")).toBe(NAPA.all[7].href);
    expect(all.getAttribute("data-fk")).toBe("show-all");
  });
});
