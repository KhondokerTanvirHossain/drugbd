import { DESK_NEW, P1C_COPY, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { PairDecideResult, PairOutcome, PairVersion } from "@/lib/senior-types";

/*
 * §5.17.2 outcomes as a pure reducer, one status per pair row. Decisions are sent at once (no undo window: marking
 * reviewed publishes nothing), one at a time per page, like the desk's report channel. A 409 on the content or from
 * another senior pauses the row until Reload; a lost answer leaves the row in netErr until Try again, which resends the
 * same op (same requestId and version), so the API saves it once or reports the earlier save.
 */
export type PairOp = {
  key: string; ddinterA: string; ddinterB: string; a: string; b: string; decision: "reviewed" | "issue"; note: string;
  version: PairVersion; requestId: string;
};
export type RowStatus =
  | { kind: "idle" }
  | { kind: "sending"; op: PairOp }
  | { kind: "botHold"; op: PairOp }
  | { kind: "netErr"; op: PairOp; saved: "no" | "unknown" }
  | { kind: "paused"; reason: "content" | "other" };
export type PairState = { rows: Record<string, RowStatus>; auth: "ok" | "forbidden" | "signedOut" };
export type PairEvent =
  | { type: "SEND"; op: PairOp; token: "held" | "pending" | "failed" }
  | { type: "RESULT"; key: string; result: PairDecideResult | "network" | "timeout" }
  | { type: "RETRY_OK" }
  | { type: "RETRY_FAIL" }
  | { type: "TRY_AGAIN"; key: string }
  | { type: "RELOADED"; key: string };
export type PairEffect =
  | { type: "send"; op: PairOp }
  | { type: "announce"; text: string }
  | { type: "hint"; text: string }
  | { type: "saved"; op: PairOp; outcome: PairOutcome };

const IDLE: RowStatus = { kind: "idle" };
const r = P1C_COPY.review;
export const initialPairs = (): PairState => ({ rows: {}, auth: "ok" });
export const rowStatus = (s: PairState, key: string): RowStatus => s.rows[key] ?? IDLE;
const put = (s: PairState, key: string, row: RowStatus): PairState => ({ ...s, rows: { ...s.rows, [key]: row } });
const announce = (text: string): PairEffect => ({ type: "announce", text });
/** A decision is in flight, or waits for the bot check, somewhere on the page. */
export const pairBusy = (s: PairState) => Object.values(s.rows).some((x) => x.kind === "sending" || x.kind === "botHold");

function failed(s: PairState, op: PairOp, saved: "no" | "unknown") {
  return { state: put(s, op.key, { kind: "netErr", op, saved }), effects: [announce(saved === "no"
    ? `${r.netTitle} ${DESK_NEW.deskMisc.reportFailedBody}` : `${r.unconfirmedTitle} ${r.unconfirmedBody}`)] };
}

export function pairStep(s: PairState, e: PairEvent): { state: PairState; effects: PairEffect[] } {
  switch (e.type) {
    case "SEND": {
      if (s.auth !== "ok" || rowStatus(s, e.op.key).kind !== "idle" || pairBusy(s)) return { state: s, effects: [] };
      if (e.token === "failed") return { state: put(s, e.op.key, { kind: "botHold", op: e.op }), effects: [announce(DESK.botFailedAnnounce)] };
      return { state: put(s, e.op.key, { kind: "sending", op: e.op }), effects: [{ type: "send", op: e.op }] };
    }
    case "RESULT": {
      const row = rowStatus(s, e.key);
      if (row.kind !== "sending") return { state: s, effects: [] };
      const op = row.op, res = e.result;
      if (res === "network" || res === "timeout") return failed(s, op, "unknown");
      if (res.ok) return { state: put(s, op.key, IDLE), effects: [{ type: "saved", op, outcome: res.outcome },
        announce(fill(op.decision === "reviewed" ? r.announceReviewed : r.announceIssue, { a: op.a, b: op.b }))] };
      switch (res.code) {
        case "content_changed":
        case "not_found":   // the pair or a side is no longer held: the page is out of date, as for a content change
          return { state: put(s, op.key, { kind: "paused", reason: "content" }), effects: [announce(`${r.contentTitle} ${r.contentBody}`)] };
        case "other_senior":
          return { state: put(s, op.key, { kind: "paused", reason: "other" }), effects: [announce(`${r.otherTitle} ${r.otherBody}`)] };
        case "already_reviewed":
          return { state: put(s, op.key, IDLE), effects: [{ type: "hint", text: r.alreadyReviewed }] };
        case "captcha":
          return { state: put(s, op.key, { kind: "botHold", op }), effects: [announce(DESK.botFailedAnnounce)] };
        case "forbidden":
          return { state: { ...put(s, op.key, IDLE), auth: "forbidden" }, effects: [announce(r.notAuthTitle)] };
        case "unauthenticated":
          return { state: { ...put(s, op.key, IDLE), auth: "signedOut" },
            effects: [announce(fill(DESK_NEW.sessionExpired.block, { name: `${op.a} + ${op.b}` }))] };
        case "rate_limited":
        case "invalid":
          return failed(s, op, "no");
        case "failed":
          return failed(s, op, "unknown");
      }
      return { state: s, effects: [] };
    }
    case "RETRY_OK": {
      const held = Object.values(s.rows).find((x): x is Extract<RowStatus, { kind: "botHold" }> => x.kind === "botHold");
      if (!held) return { state: s, effects: [] };
      return { state: put(s, held.op.key, { kind: "sending", op: held.op }),
        effects: [announce(DESK.botPassedAnnounce), { type: "send", op: held.op }] };
    }
    case "RETRY_FAIL":
      return { state: s, effects: [announce(DESK.botFailedAnnounce)] };
    case "TRY_AGAIN": {
      const row = rowStatus(s, e.key);
      if (row.kind !== "netErr" || pairBusy(s)) return { state: s, effects: [] };
      return { state: put(s, e.key, { kind: "sending", op: row.op }), effects: [{ type: "send", op: row.op }] };
    }
    case "RELOADED":
      return rowStatus(s, e.key).kind === "paused" ? { state: put(s, e.key, IDLE), effects: [] } : { state: s, effects: [] };
  }
}
