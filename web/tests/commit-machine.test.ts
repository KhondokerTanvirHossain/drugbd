import { describe, expect, it } from "vitest";
import {
  TOKEN_MAX_AGE_MS, applySaved, blocksUnload, initialMachine, staleReason, step, toOutcome, toastView, tokenPlan, unconfirmedOn,
  type Effect, type Event, type MachineState, type Op,
} from "@/components/review/desk/commit-machine";
import { parseUndo } from "@/lib/desk-settings";

const V1 = { extractedAt: "2026-10-12T09:00:00.123456Z", lastDecisionId: null };
const op = (over: Partial<Op> = {}): Op => ({ conceptId: "186-0030-006--napa", name: "Napa", role: "pharmacist", decision: "ok",
  note: "", viewedVersion: V1, requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22", ...over });
const OUT = { review: "ok", displayStatus: "approved" as const, batchStatus: "in_review",
  version: { extractedAt: V1.extractedAt, lastDecisionId: 41 }, replayed: false };

function run(s: MachineState, ...events: Event[]): { state: MachineState; effects: Effect[] } {
  let state = s;
  const effects: Effect[] = [];
  for (const e of events) {
    const r = step(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}
const texts = (effects: Effect[], type: "announce" | "hint") =>
  effects.filter((e): e is Extract<Effect, { type: typeof type }> => e.type === type).map((e) => e.text);
const sends = (effects: Effect[]) => effects.filter((e) => e.type === "send");

describe("the undo window (§5.8.1)", () => {
  it("is a deadline on the monotonic clock: 8, 20 or 60 s, and 8 for a bad cookie", () => {
    for (const [cookie, ms] of [["8", 8000], ["20", 20000], ["60", 60000], ["bogus", 8000]] as const) {
      const { state } = run(initialMachine(parseUndo(cookie)), { type: "PRESS_A", op: op(), token: "held", now: 1000 });
      expect(state.commit).toEqual({ kind: "armed", op: op(), deadline: 1000 + ms });
    }
  });

  it("an early DEADLINE does nothing; only now >= deadline commits (a wall-clock jump cannot shorten it)", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 1000 }).state;
    expect(run(armed, { type: "DEADLINE", now: 8999 }).state.commit.kind).toBe("armed");
    const r = run(armed, { type: "DEADLINE", now: 9000 });
    expect(r.state.commit).toEqual({ kind: "committing", op: op() });
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "commit", op: op() }]);
  });

  it("announces once on open, with the role's sub, and never per second", () => {
    const p = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 });
    expect(texts(p.effects, "announce")).toEqual(["Napa marked correct. Publishes in 8 seconds. Press U to undo."]);
    const e = run(initialMachine(20), { type: "PRESS_A", op: op({ role: "engineer" }), token: "held", now: 0 });
    expect(texts(e.effects, "announce")).toEqual(["Napa marked correct. Your check saves in 20 seconds. It does not publish. Press U to undo."]);
  });

  it("U undoes: idle, announced, nothing sent", () => {
    const r = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "PRESS_U" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(texts(r.effects, "announce")).toContain("Undone. Napa was not saved.");
    expect(sends(r.effects)).toEqual([]);
  });

  it("U with no window says so", () => {
    expect(texts(run(initialMachine(8), { type: "PRESS_U" }).effects, "hint")).toEqual(["Nothing to undo."]);
  });

  it("a second A while armed changes nothing (the desk shows the other-window hint)", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    const r = run(armed, { type: "PRESS_A", op: op({ conceptId: "x", name: "Aspirin" }), token: "held", now: 10 });
    expect(r.state).toEqual(armed);
  });

  it("U while committing keeps committing and says it is too late; the toast drops Undo on DEADLINE", () => {
    const committing = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 }).state;
    expect(toastView(committing)).toEqual({ mode: "saving", op: op() });
    const r = run(committing, { type: "PRESS_U" });
    expect(r.state.commit.kind).toBe("committing");
    expect(texts(r.effects, "hint")).toEqual(["Too late to undo: Napa is saving. Use Report issue to withdraw it."]);
    expect(toastView(run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state))
      .toEqual({ mode: "running", op: op() });
  });

  it("stale cancels the window on that record, and says the decision was not saved", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    const r = run(armed, { type: "STALE", conceptId: op().conceptId, reason: "rerun" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(r.effects).toContainEqual({ type: "stale", conceptId: op().conceptId, reason: "rerun", cancelled: true });
    expect(run(armed, { type: "STALE", conceptId: "other", reason: "other" }).state.commit.kind).toBe("armed");
  });

  it("unload discards: nothing sent, nothing announced", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    expect(blocksUnload(armed)).toBe(true);
    const r = run(armed, { type: "PAGE_UNLOAD" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(r.effects).toEqual([]);
    expect(blocksUnload(r.state)).toBe(false);
  });
});

describe("Turnstile (§5.8.5)", () => {
  it("A while the widget is re-executing waits for a token, then arms a full window from that moment", () => {
    const waiting = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "pending", now: 100 }).state;
    expect(waiting.commit).toEqual({ kind: "awaitingToken", op: op(), since: 100 });
    expect(run(waiting, { type: "TOKEN", now: 2100 }).state.commit).toEqual({ kind: "armed", op: op(), deadline: 10100 });
  });

  it("an error-callback or 10 s without a token is a bot hold, never a window", () => {
    const waiting = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "pending", now: 0 }).state;
    for (const e of [{ type: "WIDGET_ERROR" }, { type: "TOKEN_TIMEOUT", now: 10_000 }] as Event[]) {
      const r = run(waiting, e);
      expect(r.state.commit).toEqual({ kind: "botHold", hold: "approve", op: op() });
      expect(texts(r.effects, "announce")).toEqual(["Bot check failed. Your decision is kept. Retry the check to continue."]);
    }
    expect(run(initialMachine(8), { type: "PRESS_A", op: op(), token: "failed", now: 0 }).state.commit.kind).toBe("botHold");
  });

  it("a bot hold before arming: retry arms a new window", () => {
    const hold = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "failed", now: 0 }).state;
    const r = run(hold, { type: "RETRY_OK", now: 5000 });
    expect(r.state.commit).toEqual({ kind: "armed", op: op(), deadline: 13000 });
    expect(texts(r.effects, "announce")[0]).toBe("Bot check passed.");
  });

  it("captcha at commit: retry sends the same decision without a new window", () => {
    const hold = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 },
      { type: "RESULT", channel: "commit", result: toOutcome({ ok: false, code: "captcha" }) }).state;
    expect(hold.commit).toEqual({ kind: "botHold", hold: "commit", op: op() });
    const r = run(hold, { type: "RETRY_OK", now: 9000 });
    expect(r.state.commit).toEqual({ kind: "committing", op: op() });
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "commit", op: op() }]);
    expect(run(hold, { type: "RETRY_FAIL" }).state.commit).toEqual(hold.commit);
  });

  it("tokenPlan: a token older than 270 s is refreshed, never reused (thresholds; the desk path is pinned in desk-flow.test.tsx)", () => {
    expect(TOKEN_MAX_AGE_MS).toBe(270_000);
    expect(tokenPlan(null, 1000)).toBe("refresh");
    expect(tokenPlan(0, 269_999)).toBe("use");
    expect(tokenPlan(0, 270_000)).toBe("refresh");
    expect(tokenPlan(0, 10 * 60_000)).toBe("refresh");
  });
});

describe("commit outcomes (§5.8.2, §5.11)", () => {
  const committing = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 }).state;
  const result = (r: Parameters<typeof toOutcome>[0]) => run(committing, { type: "RESULT", channel: "commit", result: toOutcome(r) });

  it("OK and a replayed OK are the same save", () => {
    for (const replayed of [false, true]) {
      const r = result({ ok: true, outcome: { ...OUT, replayed } });
      expect(r.state.commit).toEqual({ kind: "idle" });
      expect(r.effects).toContainEqual({ type: "saved", channel: "commit", op: op(), outcome: { ...OUT, replayed } });
    }
  });

  it("429 or rate_limited is not saved; network, 5xx and timeout are unconfirmed", () => {
    expect(result({ ok: false, code: "rate_limited" }).state.commit).toEqual({ kind: "netErr", op: op(), saved: "no" });
    expect(texts(result({ ok: false, code: "rate_limited" }).effects, "announce"))
      .toEqual(["Couldn't save your decision. Nothing was published. Check your connection and try again."]);
    for (const r of ["network", "timeout", { ok: false as const, code: "failed" as const }] as const) {
      const x = result(r);
      expect(x.state.commit).toEqual({ kind: "netErr", op: op(), saved: "unknown" });
      expect(texts(x.effects, "announce")).toEqual(["Couldn't confirm your decision. We couldn't confirm your decision was saved. "
        + "Try again to find out; it will not be saved twice."]);
    }
  });

  it("Try again resends the same requestId and viewedVersion, with no new window", () => {
    const err = result("network").state;
    const r = run(err, { type: "TRY_AGAIN", channel: "commit" });
    expect(r.state.commit).toEqual({ kind: "committing", op: op() });
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "commit", op: op() }]);
  });

  it("while unconfirmed, a changed lastDecisionId is not another reviewer; a changed stamp still is a re-run", () => {
    const err = result("network").state;
    expect(unconfirmedOn(err, op().conceptId)).toBe(true);
    // In flight is the same: the server may already have saved it (D45, own saves never make the record stale).
    expect(unconfirmedOn(committing, op().conceptId)).toBe(true);
    expect(unconfirmedOn(committing, "other")).toBe(false);
    const sendingReport = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state;
    expect(unconfirmedOn(sendingReport, op().conceptId)).toBe(true);
    expect(unconfirmedOn(result({ ok: false, code: "rate_limited" }).state, op().conceptId)).toBe(false);   // "not saved" is proven
    expect(staleReason(V1, { ...V1, lastDecisionId: 41 }, true)).toBeNull();
    expect(staleReason(V1, { ...V1, lastDecisionId: 41 }, false)).toBe("other");
    expect(staleReason(V1, { extractedAt: "2026-10-13T00:00:00Z", lastDecisionId: 41 }, true)).toBe("rerun");
    expect(staleReason(V1, V1, false)).toBeNull();
  });

  it("forbidden and unauthenticated are different states", () => {
    const f = result({ ok: false, code: "forbidden" });
    expect(f.state.auth).toBe("forbidden");
    expect(texts(f.effects, "announce")).toEqual(["Your account can't review this batch. Your decision on Napa was not saved."]);
    const u = result({ ok: false, code: "unauthenticated" });
    expect(u.state.auth).toBe("signedOut");
    expect(texts(u.effects, "announce")).toEqual(["Your sign-in expired. Your decision on Napa was not saved."]);
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    expect(run(armed, { type: "UNAUTHENTICATED" }).state).toMatchObject({ commit: { kind: "idle" }, auth: "signedOut" });
    expect(run(armed, { type: "FORBIDDEN" }).state).toMatchObject({ commit: { kind: "idle" }, auth: "forbidden" });
  });

  it("409s map by field: stale copy for versions, a hint and a refresh for the rest", () => {
    const rerun = result({ ok: false, code: "stale_rerun" });
    expect(rerun.effects).toContainEqual({ type: "stale", conceptId: op().conceptId, reason: "rerun", cancelled: true });
    expect(result({ ok: false, code: "stale_decision" }).effects)
      .toContainEqual({ type: "stale", conceptId: op().conceptId, reason: "other", cancelled: true });
    for (const [code, hint] of [
      ["issue_open", "An issue is open on this record. It returns to review after the fix and re-run."],
      ["already_approved", "This record is already approved by a pharmacist."],
      ["already_checked", "Your check is already recorded for this record."],
      ["removed", "This record was removed from the batch file. Nothing was saved."],
      ["stage_failed", "A check failed on this record. It returns to review after the fix and re-run. Nothing was saved."],
    ] as const) {
      const r = result({ ok: false, code });
      expect(r.state.commit).toEqual({ kind: "idle" });
      expect(texts(r.effects, "hint")).toEqual([hint]);
      expect(r.effects).toContainEqual({ type: "refresh" });
    }
  });
});

describe("own saves never make the record stale (§5.8.2, D45)", () => {
  it("after A, on the open record or another one, the saved version becomes the viewed version", () => {
    const viewed = { [op().conceptId]: V1, other: V1 };
    const saved = result();
    function result() {
      return run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }, { type: "DEADLINE", now: 8000 },
        { type: "RESULT", channel: "commit", result: toOutcome({ ok: true, outcome: OUT }) });
    }
    const after = saved.effects.reduce(applySaved, viewed);
    expect(after[op().conceptId]).toEqual(OUT.version);
    expect(staleReason(after[op().conceptId], OUT.version, false)).toBeNull();
    expect(after.other).toBe(V1);
  });

  it("after R (a report), too", () => {
    const viewed = { [op().conceptId]: V1 };
    const reportOp = op({ decision: "issue", note: "strength should read 5 mg" });
    const r = run(initialMachine(8), { type: "SEND_REPORT", op: reportOp, token: "held" },
      { type: "RESULT", channel: "report", result: toOutcome({ ok: true, outcome: { ...OUT, displayStatus: "issue" } }) });
    expect(r.effects.filter((e) => e.type === "send")).toEqual([{ type: "send", channel: "report", op: reportOp }]);
    expect(r.effects.reduce(applySaved, viewed)[op().conceptId]).toEqual(OUT.version);
    expect(texts(r.effects, "announce")).toEqual(["Issue reported for Napa. An engineer will see your note."]);
  });

  it("the refresh race: a re-stamp that lands with other rows' refresh makes the open record stale, and the decision keeps the viewed version", () => {
    const viewed = { [op().conceptId]: V1 };
    const restamped = { extractedAt: "2026-10-12T10:00:00Z", lastDecisionId: null };
    expect(staleReason(viewed[op().conceptId], restamped, false)).toBe("rerun");
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op({ viewedVersion: viewed[op().conceptId] }), token: "held", now: 0 });
    expect(armed.state.commit.kind === "armed" && armed.state.commit.op.viewedVersion).toEqual(V1);
  });
});

describe("reports (§5.10)", () => {
  it("a report cancels an open window on the same record first; only a widget error is a bot hold", () => {
    const armed = run(initialMachine(8), { type: "PRESS_A", op: op(), token: "held", now: 0 }).state;
    const r = run(armed, { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" });
    expect(r.state.commit).toEqual({ kind: "idle" });
    expect(r.state.report.kind).toBe("sending");
    // §5.8.5: right after a reset the widget is re-executing; the send waits for the token (freshToken, at most 10 s)
    const waiting = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "pending" });
    expect(waiting.state.report.kind).toBe("sending");
    expect(sends(waiting.effects)).toHaveLength(1);
    expect(texts(waiting.effects, "announce")).toEqual([]);
    // no token after the wait comes back as CAPTCHA, which is the report bot hold
    const timedOut = run(waiting.state, { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "captcha" }) });
    expect(timedOut.state.report.kind).toBe("botHold");
    const hold = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "failed" });
    expect(hold.state.report.kind).toBe("botHold");
    expect(texts(hold.effects, "announce")).toEqual(["Bot check failed. Your decision is kept. Retry the check to continue."]);
    expect(run(hold.state, { type: "RETRY_OK", now: 0 }).state.report.kind).toBe("sending");
  });

  it("a report failure says the report was not sent and offers Try again", () => {
    const sending = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state;
    const r = run(sending, { type: "RESULT", channel: "report", result: toOutcome("network") });
    expect(r.state.report.kind).toBe("netErr");
    expect(texts(r.effects, "announce")).toEqual(["Couldn't send your report. Nothing was saved. Check your connection and try again."]);
    expect(run(r.state, { type: "TRY_AGAIN", channel: "report" }).state.report.kind).toBe("sending");
  });
});

describe("one report at a time (§5.8.2 D45, §5.10; Task 10 Ruling)", () => {
  const X = op({ decision: "issue", note: "wrong strength" });
  const Y = op({ conceptId: "186-0031-001--aspirin", name: "Aspirin", decision: "issue", note: "wrong route",
    requestId: "7d2e4b10-3c5a-4f8e-9b61-2a7c9e0d4f33" });

  it("a report on X that is unconfirmed: Send report on Y changes nothing, and Try again still resends X's own requestId", () => {
    const err = run(initialMachine(8), { type: "SEND_REPORT", op: X, token: "held" },
      { type: "RESULT", channel: "report", result: toOutcome("network") }).state;
    expect(err.report).toEqual({ kind: "netErr", op: X, saved: "unknown" });
    // An open window on Y is not cancelled by the ignored press either.
    const withWindow = run(err, { type: "PRESS_A", op: op({ conceptId: Y.conceptId, name: Y.name }), token: "held", now: 0 }).state;
    for (const s of [err, withWindow]) {
      const r = run(s, { type: "SEND_REPORT", op: Y, token: "held" });
      expect(r.state).toEqual(s);
      expect(r.effects).toEqual([]);
      expect(unconfirmedOn(r.state, X.conceptId)).toBe(true);
      expect(unconfirmedOn(r.state, Y.conceptId)).toBe(false);
      const again = run(r.state, { type: "TRY_AGAIN", channel: "report" });
      expect(sends(again.effects)).toEqual([{ type: "send", channel: "report", op: X }]);
      expect(again.effects.flatMap((e) => (e.type === "send" ? [e.op.requestId] : []))).toEqual([X.requestId]);
    }
  });

  it("a report on X that is sending: Send report on Y sends nothing, and the OK is X's save, never Y's", () => {
    const sending = run(initialMachine(8), { type: "SEND_REPORT", op: X, token: "held" }).state;
    const pressed = run(sending, { type: "SEND_REPORT", op: Y, token: "held" });
    expect(pressed.state).toEqual(sending);
    expect(sends(pressed.effects)).toEqual([]);
    const ok = run(pressed.state, { type: "RESULT", channel: "report",
      result: toOutcome({ ok: true, outcome: { ...OUT, displayStatus: "issue" } }) });
    expect(ok.effects).toContainEqual({ type: "saved", channel: "report", op: X, outcome: { ...OUT, displayStatus: "issue" } });
    expect(texts(ok.effects, "announce")).toEqual(["Issue reported for Napa. An engineer will see your note."]);
    const viewed = ok.effects.reduce(applySaved, { [X.conceptId]: V1, [Y.conceptId]: V1 });
    expect(viewed[X.conceptId]).toEqual(OUT.version);
    expect(viewed[Y.conceptId]).toBe(V1);
  });

  it("a report on X in a bot hold: Send report on Y keeps X's hold, and Retry sends X", () => {
    const hold = run(initialMachine(8), { type: "SEND_REPORT", op: X, token: "failed" }).state;
    expect(hold.report).toEqual({ kind: "botHold", op: X });
    const r = run(hold, { type: "SEND_REPORT", op: Y, token: "held" });
    expect(r.state).toEqual(hold);
    expect(r.effects).toEqual([]);
    expect(sends(run(r.state, { type: "RETRY_OK", now: 0 }).effects)).toEqual([{ type: "send", channel: "report", op: X }]);
  });
});

describe("dismissals on the report channel (§5.8.2, §5.10a)", () => {
  const dop = (over: Partial<Op> = {}): Op => op({ role: "senior", decision: "dismiss", note: "the register says 500 mg",
    requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6", ...over });
  const PENDING = { ...OUT, review: "pending", displayStatus: "pending" as const };
  const sent = () => run(initialMachine(8), { type: "SEND_DISMISS", op: dop(), token: "held" }).state;

  it("sends at once on the report channel: no undo window, and an open window elsewhere is untouched", () => {
    const armedElsewhere = run(initialMachine(8),
      { type: "PRESS_A", op: op({ conceptId: "other", name: "Other", role: "senior" }), token: "held", now: 0 }).state;
    const r = run(armedElsewhere, { type: "SEND_DISMISS", op: dop(), token: "held" });
    expect(r.state.report).toEqual({ kind: "sending", op: dop() });
    expect(r.state.commit.kind).toBe("armed");
    expect(sends(r.effects)).toEqual([{ type: "send", channel: "report", op: dop() }]);
  });

  it("only a senior's dismiss op, and only while the report channel is idle (a report blocks it, and the reverse)", () => {
    expect(run(initialMachine(8), { type: "SEND_DISMISS", op: dop({ role: "pharmacist" }), token: "held" }).state.report.kind).toBe("idle");
    expect(run(initialMachine(8), { type: "SEND_DISMISS", op: dop({ decision: "issue" }), token: "held" }).state.report.kind).toBe("idle");
    const reporting = run(initialMachine(8), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state;
    expect(run(reporting, { type: "SEND_DISMISS", op: dop(), token: "held" }).state).toEqual(reporting);
    expect(run(sent(), { type: "SEND_REPORT", op: op({ decision: "issue", note: "wrong strength" }), token: "held" }).state).toEqual(sent());
  });

  it("OK: saved on the report channel, announced with the dismissal sentence, and the outcome becomes the viewed version", () => {
    const r = run(sent(), { type: "RESULT", channel: "report", result: { type: "OK", outcome: PENDING } });
    expect(r.state.report).toEqual({ kind: "idle" });
    const saved = r.effects.find((e) => e.type === "saved")!;
    expect(saved).toEqual({ type: "saved", channel: "report", op: dop(), outcome: PENDING });
    expect(texts(r.effects, "announce")).toEqual(["Issue dismissed for Napa. The record is back in review for a pharmacist."]);
    expect(applySaved({}, saved)).toEqual({ [dop().conceptId]: PENDING.version });
  });

  it("409 no_issue gives its hint and a refresh; the stale codes give the stale banner", () => {
    const r = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "no_issue" }) });
    expect(texts(r.effects, "hint")).toEqual(["No issue is open on this record any more. Nothing was saved."]);
    expect(r.effects).toContainEqual({ type: "refresh" });
    const removed = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "removed" }) });
    expect(texts(removed.effects, "hint")).toEqual(["This record was removed from the batch file. Nothing was saved."]);
    const s = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "stale_decision" }) });
    expect(s.effects).toContainEqual({ type: "stale", conceptId: dop().conceptId, reason: "other", cancelled: true });
  });

  it("captcha: the report channel's bot hold keeps the dismiss op, and Retry check resends it with the same requestId", () => {
    const held = run(initialMachine(8), { type: "SEND_DISMISS", op: dop(), token: "failed" }).state;
    expect(held.report).toEqual({ kind: "botHold", op: dop() });
    expect(sends(run(held, { type: "RETRY_OK", now: 5 }).effects)).toEqual([{ type: "send", channel: "report", op: dop() }]);
    const viaCaptcha = run(sent(), { type: "RESULT", channel: "report", result: { type: "CAPTCHA" } }).state;
    expect(viaCaptcha.report).toEqual({ kind: "botHold", op: dop() });
  });

  it("429 is netErr saved:no and a lost answer saved:unknown, with the dismissal copy; TRY_AGAIN resends the same op, never an approval", () => {
    const no = run(sent(), { type: "RESULT", channel: "report", result: toOutcome({ ok: false, code: "rate_limited" }) });
    expect(no.state.report).toEqual({ kind: "netErr", op: dop(), saved: "no" });
    expect(texts(no.effects, "announce")).toEqual(["Couldn't send your dismissal. Nothing was saved. Check your connection and try again."]);
    const unknown = run(sent(), { type: "RESULT", channel: "report", result: toOutcome("network") });
    expect(unknown.state.report).toEqual({ kind: "netErr", op: dop(), saved: "unknown" });
    expect(texts(unknown.effects, "announce")).toEqual([
      "Couldn't confirm your dismissal. We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice."]);
    expect(unknown.state.commit).toEqual({ kind: "idle" });
    expect(unconfirmedOn(unknown.state, dop().conceptId)).toBe(true);
    const again = run(unknown.state, { type: "TRY_AGAIN", channel: "report" });
    expect(sends(again.effects)).toEqual([{ type: "send", channel: "report", op: dop() }]);
    expect(run(unknown.state, { type: "TRY_AGAIN", channel: "commit" }).effects).toEqual([]);
  });
});
