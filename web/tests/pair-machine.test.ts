import { describe, expect, it } from "vitest";
import { initialPairs, pairStep, type PairEffect, type PairEvent, type PairOp, type PairState } from "@/components/review/senior/pair-machine";

const op = (over: Partial<PairOp> = {}): PairOp => ({ key: "DDInter14|DDInter1951", ddinterA: "DDInter14", ddinterB: "DDInter1951",
  a: "Acetaminophen", b: "Warfarin", decision: "reviewed", note: "", version: { contentHash: "a".repeat(64), lastPairReviewId: null },
  requestId: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6", ...over });
const OUT = { ddinterA: "DDInter14", ddinterB: "DDInter1951", review: { state: "reviewed" as const, at: "2026-10-15T03:00:00Z", mine: true, note: null },
  version: { contentHash: "a".repeat(64), lastPairReviewId: 9 }, replayed: false };
function run(s: PairState, ...events: PairEvent[]) {
  let state = s;
  const effects: PairEffect[] = [];
  for (const e of events) { const r = pairStep(state, e); state = r.state; effects.push(...r.effects); }
  return { state, effects };
}
const said = (fx: PairEffect[]) => fx.filter((e) => e.type === "announce" || e.type === "hint").map((e) => (e as { text: string }).text);
const sent = () => run(initialPairs(), { type: "SEND", op: op(), token: "held" });

describe("pair decisions (§5.17.2 outcomes)", () => {
  it("sends at once, with no undo window, one decision per page at a time", () => {
    const r = sent();
    expect(r.state.rows[op().key]).toEqual({ kind: "sending", op: op() });
    expect(r.effects).toEqual([{ type: "send", op: op() }]);
    const other = op({ key: "DDInter1951|DDInter20", ddinterA: "DDInter1951", ddinterB: "DDInter20" });
    expect(run(r.state, { type: "SEND", op: other, token: "held" }).effects).toEqual([]);
  });
  it("reviewed and issue: saved and announced by name", () => {
    const ok = run(sent().state, { type: "RESULT", key: op().key, result: { ok: true, outcome: OUT } });
    expect(ok.state.rows[op().key]).toEqual({ kind: "idle" });
    expect(ok.effects[0]).toEqual({ type: "saved", op: op(), outcome: OUT });
    expect(said(ok.effects)).toEqual(["Pair Acetaminophen + Warfarin marked reviewed."]);
    const issue = run(initialPairs(), { type: "SEND", op: op({ decision: "issue", note: "text contradicts the severity" }), token: "held" },
      { type: "RESULT", key: op().key, result: { ok: true, outcome: OUT } });
    expect(said(issue.effects)).toEqual(["Pair issue reported for Acetaminophen + Warfarin."]);
  });
  it("409 contentHash and lastPairReviewId pause the row until Reload; 409 state is a hint", () => {
    const c = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "content_changed" } });
    expect(c.state.rows[op().key]).toEqual({ kind: "paused", reason: "content" });
    expect(said(c.effects)).toEqual(["This pair changed in DDInter after you opened the page. Nothing was saved. Reload to review the latest text."]);
    expect(run(c.state, { type: "SEND", op: op(), token: "held" }).effects).toEqual([]);
    expect(run(c.state, { type: "RELOADED", key: op().key }).state.rows[op().key]).toEqual({ kind: "idle" });
    const o = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "other_senior" } });
    expect(said(o.effects)).toEqual(["Another senior pharmacist decided on this pair after you opened the page. Nothing was saved. Reload to see their decision."]);
    const s = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "already_reviewed" } });
    expect(s.effects).toEqual([{ type: "hint", text: "This pair is already reviewed." }]);
  });
  it("429 is not saved, a lost answer unconfirmed; Try again resends the same op", () => {
    const no = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "rate_limited" } });
    expect(no.state.rows[op().key]).toEqual({ kind: "netErr", op: op(), saved: "no" });
    expect(said(no.effects)).toEqual(["Couldn't save your pair review. Nothing was saved. Check your connection and try again."]);
    const lost = run(sent().state, { type: "RESULT", key: op().key, result: "network" });
    expect(said(lost.effects)).toEqual(["Couldn't confirm your pair review. Try again to find out; it will not be saved twice."]);
    expect(run(lost.state, { type: "TRY_AGAIN", key: op().key }).effects).toEqual([{ type: "send", op: op() }]);
  });
  it("captcha holds the op for Retry check; forbidden and unauthenticated stop the page", () => {
    const held = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "captcha" } });
    expect(held.state.rows[op().key]).toEqual({ kind: "botHold", op: op() });
    expect(run(held.state, { type: "RETRY_OK" }).effects).toContainEqual({ type: "send", op: op() });
    expect(run(initialPairs(), { type: "SEND", op: op(), token: "failed" }).state.rows[op().key]).toEqual({ kind: "botHold", op: op() });
    expect(run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "forbidden" } }).state.auth).toBe("forbidden");
    const out = run(sent().state, { type: "RESULT", key: op().key, result: { ok: false, code: "unauthenticated" } });
    expect(out.state.auth).toBe("signedOut");
    expect(said(out.effects)).toEqual(["Your sign-in expired. Your decision on Acetaminophen + Warfarin was not saved."]);
  });
});
