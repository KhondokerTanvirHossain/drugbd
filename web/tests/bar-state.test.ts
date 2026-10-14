import { describe, expect, it } from "vitest";
import {
  ADVANCE_GUARD_MS, approveDisabled, approveHint, noteLength, promise, reportDisabled, reportHint, sendDisabled, sendHint, type BarCtx,
} from "@/components/review/desk/bar-state";
import { initialMachine, type MachineState, type Op } from "@/components/review/desk/commit-machine";

const op = (over: Partial<Op> = {}): Op => ({ conceptId: "napa", name: "Napa", role: "pharmacist", decision: "ok", note: "",
  viewedVersion: { extractedAt: null, lastDecisionId: null }, requestId: "r", ...over });
const machine = (over: Partial<MachineState> = {}): MachineState => ({ ...initialMachine(8), ...over });
const ctx = (over: Partial<BarCtx> = {}): BarCtx => ({
  loading: false, complete: false, role: "pharmacist", batchId: "0001-pilot",
  record: { conceptId: "napa", name: "Napa", status: "pending", stagesBlocked: false },
  stale: false, drawerOpen: false, reportOpen: false, machine: machine(), undoSeconds: 8, advanceGuard: null, now: 10_000, ...over,
});
const rec = (over: Partial<NonNullable<BarCtx["record"]>>) => ({ ...ctx().record!, ...over });

describe("the promise, first match wins (§5.7)", () => {
  it.each([
    [{ loading: true }, ["Loading batch 0001-pilot.", "Decisions open when the record loads."]],
    [{ complete: true }, ["Batch 0001-pilot is approved.", "Open any record to read it."]],
    [{ stale: true }, ["Decisions are paused.", "This record changed after you opened it. Reload it to review the latest data."]],
    [{ machine: machine({ commit: { kind: "netErr", op: op(), saved: "no" } }) }, ["Your decision was not saved.", "Use Try again above."]],
    [{ machine: machine({ commit: { kind: "netErr", op: op(), saved: "unknown" } }) },
      ["Your decision may not have been saved.", "Use Try again above to find out."]],
    [{ machine: machine({ commit: { kind: "armed", op: op(), deadline: 1 } }) },
      ["Marked correct.", "Publishes when the undo window closes. Press U to undo."]],
    [{ role: "engineer", machine: machine({ commit: { kind: "armed", op: op({ role: "engineer" }), deadline: 1 } }) },
      ["Marked correct.", "Your check saves when the undo window closes. Press U to undo."]],
    [{ machine: machine({ commit: { kind: "committing", op: op() } }) }, ["Marked correct.", "Publishing now."]],
    [{ role: "engineer", machine: machine({ commit: { kind: "committing", op: op({ role: "engineer" }) } }) }, ["Marked correct.", "Saving your check now."]],
    [{ record: rec({ stagesBlocked: true }) }, ["A check failed on this record.", "It returns to review after the fix and re-run."]],
    [{ record: rec({ status: "approved" }) }, ["Approved by a pharmacist.", "This record is public."]],
    [{ record: rec({ status: "issue" }) }, ["An issue is open on this record.", "It returns to review after the fix and re-run."]],
    [{ role: "engineer", record: rec({ status: "engineer_checked" }) }, ["Your check is recorded.", "A pharmacist still needs to approve."]],
    [{}, ["You're reviewing as a pharmacist.", '"Looks correct" publishes this record after an 8-second undo window.']],
    [{ undoSeconds: 60 }, ["You're reviewing as a pharmacist.", '"Looks correct" publishes this record after an 60-second undo window.']],
    [{ role: "engineer" }, ["You're reviewing as an engineer.", '"Looks correct" records your check. It does not publish; a pharmacist still needs to approve.']],
  ] as [Partial<BarCtx>, [string, string]][])("%j", (over, [lead, body]) => {
    expect(promise(ctx(over))).toEqual({ lead, body });
  });

  it("a window on another record does not change this record's promise", () => {
    expect(promise(ctx({ machine: machine({ commit: { kind: "armed", op: op({ conceptId: "other" }), deadline: 1 } }) })).lead)
      .toBe("You're reviewing as a pharmacist.");
  });
});

describe("hints for A, first match wins (§5.8.4)", () => {
  const text = (over: Partial<BarCtx>) => approveHint(ctx(over)).text;
  it("follows the spec order", () => {
    expect(text({ machine: machine({ auth: "forbidden" }), stale: true })).toBe("Your account can't review this batch.");
    expect(text({ machine: machine({ auth: "signedOut" }) })).toBe("Your sign-in expired. Sign in again to keep reviewing.");
    expect(approveHint(ctx({ loading: true }))).toEqual({ block: true, text: null });
    expect(text({ complete: true })).toBe("Every record is approved. Open a record to read it.");
    expect(text({ drawerOpen: true, stale: true })).toBe("Close the evidence first (Esc).");
    expect(text({ stale: true })).toBe("Decisions are paused. Reload the record first.");
    expect(text({ machine: machine({ commit: { kind: "armed", op: op(), deadline: 1 } }) }))
      .toBe("This record is already in its undo window. Press U to undo.");
    expect(text({ machine: machine({ commit: { kind: "committing", op: op({ conceptId: "x", name: "Aspirin" }) } }) }))
      .toBe("Aspirin is still in its undo window. Press U to undo it, or wait until it saves.");
    expect(text({ machine: machine({ commit: { kind: "netErr", op: op(), saved: "no" } }) }))
      .toBe("Your last decision on this record was not saved. Use Try again.");
    expect(text({ machine: machine({ commit: { kind: "netErr", op: op(), saved: "unknown" } }) }))
      .toBe("Your last decision on this record is not confirmed yet. Use Try again.");
    expect(text({ machine: machine({ commit: { kind: "netErr", op: op({ conceptId: "x", name: "Aspirin" }), saved: "unknown" } }) }))
      .toBe("Aspirin is still in its undo window. Press U to undo it, or wait until it saves.");   // §5.8.3 string, no new copy
    expect(text({ record: rec({ stagesBlocked: true, status: "approved" }) }))
      .toBe("A check failed on this record. It returns to review after the fix and re-run.");
    expect(text({ record: rec({ status: "approved" }) })).toBe("This record is already approved by a pharmacist.");
    expect(text({ record: rec({ status: "issue" }) })).toBe("An issue is open on this record. It returns to review after the fix and re-run.");
    expect(text({ role: "engineer", record: rec({ status: "engineer_checked" }) })).toBe("Your check is already recorded for this record.");
    expect(text({ reportOpen: true })).toBe("Send or cancel the report first.");
    expect(text({ machine: machine({ commit: { kind: "botHold", hold: "approve", op: op() } }) }))
      .toBe("Retry the bot check first. Your earlier decision is kept.");
    expect(approveHint(ctx())).toEqual({ block: false, text: null });
  });

  it("the 1000 ms post-advance guard (§5.9)", () => {
    expect(ADVANCE_GUARD_MS).toBe(1000);
    const guard = { conceptId: "napa", at: 10_000 };
    expect(text({ advanceGuard: guard, now: 10_999 })).toBe("Record changed to Napa. Press A again to approve it.");
    expect(approveHint(ctx({ advanceGuard: guard, now: 11_000 }))).toEqual({ block: false, text: null });
    expect(approveHint(ctx({ advanceGuard: { conceptId: "other", at: 10_000 }, now: 10_100 }))).toEqual({ block: false, text: null });
  });
});

describe("R and Send report", () => {
  it("R names only the rows that apply to it", () => {
    expect(reportHint(ctx({ machine: machine({ auth: "forbidden" }) })).text).toBe("Your account can't review this batch.");
    expect(reportHint(ctx({ drawerOpen: true })).text).toBe("Close the evidence first (Esc).");
    expect(reportHint(ctx({ stale: true })).text).toBe("Decisions are paused. Reload the record first.");
    expect(reportHint(ctx({ record: rec({ status: "approved" }) }))).toEqual({ block: false, text: null });
    expect(reportHint(ctx({ loading: true }))).toEqual({ block: true, text: null });
  });

  it("Send is paused while stale and during a bot hold", () => {
    expect(sendHint(ctx({ stale: true }))).toBe("Sending is paused until you reload the record. Your note is kept.");
    expect(sendHint(ctx({ machine: machine({ report: { kind: "botHold", op: op() } }) })))
      .toBe("Retry the bot check first. Your earlier decision is kept.");
    expect(sendHint(ctx())).toBeNull();
    expect(sendDisabled(ctx({ stale: true }))).toBe(true);
  });
});

describe("aria-disabled (§5.7)", () => {
  it("Looks correct", () => {
    expect(approveDisabled(ctx())).toBe(false);
    for (const over of [{ record: null }, { loading: true }, { stale: true }, { drawerOpen: true }, { reportOpen: true },
      { record: rec({ status: "approved" }) }, { record: rec({ status: "issue" }) }, { record: rec({ stagesBlocked: true }) },
      { role: "engineer" as const, record: rec({ status: "engineer_checked" }) },
      { machine: machine({ auth: "forbidden" }) }, { machine: machine({ auth: "signedOut" }) },
      { machine: machine({ commit: { kind: "armed", op: op(), deadline: 1 } }) },
      { machine: machine({ commit: { kind: "netErr", op: op(), saved: "no" } }) }] as Partial<BarCtx>[])
      expect(approveDisabled(ctx(over))).toBe(true);
    expect(approveDisabled(ctx({ record: rec({ status: "engineer_checked" }) }))).toBe(false);
  });

  it("Report issue stays available on approved and issue records", () => {
    expect(reportDisabled(ctx({ record: rec({ status: "approved" }) }))).toBe(false);
    expect(reportDisabled(ctx({ record: rec({ status: "issue" }) }))).toBe(false);
    for (const over of [{ record: null }, { stale: true }, { drawerOpen: true }] as Partial<BarCtx>[])
      expect(reportDisabled(ctx(over))).toBe(true);
  });
});

describe("note length (Review Focus 2)", () => {
  it("counts note characters in code points, trimmed, as the API does", () => {
    expect(noteLength("  abcd  ")).toBe(4);
    expect(noteLength("😀😀😀😀")).toBe(4);
    expect("😀😀😀😀".length).toBe(8);
    expect(noteLength("ঔষধ ভুল")).toBe(7);
    expect(noteLength("😀😀😀😀😀")).toBe(5);
  });
});
