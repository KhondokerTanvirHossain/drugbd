import { DESK_NEW, fill } from "@/lib/copy";
import { DESK, toastSub } from "@/lib/review-copy";
import type { DeskOutcome, ReviewerRole, Version } from "@/lib/review-types";

/*
 * Spec §5.8.2: the commit-delayed approval as a pure reducer. Time comes in on events (`now` from performance.now()),
 * never from a clock read here, so a wall-clock jump cannot shorten a window and the tests drive time directly.
 * Reports (§5.10) have their own small state next to the commit, so a report on one record never ends another's window.
 */

export type Op = {
  conceptId: string; name: string; role: ReviewerRole; decision: "ok" | "issue"; note: string;
  /** The version the reviewer saw (§5.11); sent with the commit and every retry, never a later one. */
  viewedVersion: Version;
  /** UUID v4 made when A is pressed or Send report is chosen; reused unchanged on every retry (§7.2 step 1). */
  requestId: string;
};
export type Commit =
  | { kind: "idle" }
  | { kind: "awaitingToken"; op: Op; since: number }
  | { kind: "armed"; op: Op; deadline: number }
  | { kind: "committing"; op: Op }
  | { kind: "botHold"; hold: "approve" | "commit"; op: Op }
  | { kind: "netErr"; op: Op; saved: "no" | "unknown" };
export type Report =
  | { kind: "idle" }
  | { kind: "sending"; op: Op }
  | { kind: "botHold"; op: Op }
  | { kind: "netErr"; op: Op; saved: "no" | "unknown" };
export type Auth = "ok" | "forbidden" | "signedOut";
export type MachineState = { commit: Commit; report: Report; auth: Auth; undoMs: number };

export const TOKEN_MAX_AGE_MS = 270_000;
export const TOKEN_WAIT_MS = 10_000;

export const initialMachine = (undoSeconds: number): MachineState =>
  ({ commit: { kind: "idle" }, report: { kind: "idle" }, auth: "ok", undoMs: undoSeconds * 1000 });

/** The codes the decide server action answers with (lib/desk-core.ts). */
export type DecideCode = "stale_rerun" | "stale_decision" | "issue_open" | "already_approved" | "already_checked" | "removed"
  | "stage_failed" | "captcha" | "forbidden" | "unauthenticated" | "rate_limited" | "invalid" | "failed";
export type DecideResultLike = { ok: true; outcome: DeskOutcome } | { ok: false; code: DecideCode };
type ConflictCode = Extract<DecideCode, "stale_rerun" | "stale_decision" | "issue_open" | "already_approved" | "already_checked"
  | "removed" | "stage_failed">;

export type Outcome =
  | { type: "OK"; outcome: DeskOutcome }
  | { type: "CONFLICT"; code: ConflictCode }
  | { type: "CAPTCHA" } | { type: "FORBIDDEN" } | { type: "UNAUTHENTICATED" }
  /** Refused before anything could be saved: 429, rate_limited, or a 400 (§5.7 "Not saved"). */
  | { type: "NOT_SAVED" }
  /** Sent, but the answer was lost: network error, timeout or 5xx (§5.7 "Unconfirmed"). */
  | { type: "UNCONFIRMED" };

export function toOutcome(r: DecideResultLike | "network" | "timeout"): Outcome {
  if (r === "network" || r === "timeout") return { type: "UNCONFIRMED" };
  if (r.ok) return { type: "OK", outcome: r.outcome };
  switch (r.code) {
    case "captcha": return { type: "CAPTCHA" };
    case "forbidden": return { type: "FORBIDDEN" };
    case "unauthenticated": return { type: "UNAUTHENTICATED" };
    case "rate_limited": case "invalid": return { type: "NOT_SAVED" };
    case "failed": return { type: "UNCONFIRMED" };
    default: return { type: "CONFLICT", code: r.code };
  }
}

type TokenState = "held" | "pending" | "failed";
export type Event =
  | { type: "PRESS_A"; op: Op; token: TokenState; now: number }
  | { type: "TOKEN"; now: number }
  | { type: "WIDGET_ERROR" }
  | { type: "TOKEN_TIMEOUT"; now: number }
  | { type: "PRESS_U" }
  | { type: "STALE"; conceptId: string; reason: "rerun" | "other" }
  | { type: "FORBIDDEN" }
  | { type: "UNAUTHENTICATED" }
  | { type: "PAGE_UNLOAD" }
  | { type: "DEADLINE"; now: number }
  | { type: "SEND_REPORT"; op: Op; token: TokenState }
  | { type: "RESULT"; channel: "commit" | "report"; result: Outcome }
  | { type: "RETRY_OK"; now: number }
  | { type: "RETRY_FAIL" }
  | { type: "TRY_AGAIN"; channel: "commit" | "report" }
  | { type: "SET_UNDO"; seconds: number };

export type Effect =
  | { type: "send"; channel: "commit" | "report"; op: Op }
  | { type: "announce"; text: string }
  | { type: "hint"; text: string }
  | { type: "saved"; channel: "commit" | "report"; op: Op; outcome: DeskOutcome }
  | { type: "stale"; conceptId: string; reason: "rerun" | "other"; cancelled: boolean }
  | { type: "refresh" };

const IDLE: Commit = { kind: "idle" };
const announce = (text: string): Effect => ({ type: "announce", text });
const hint = (text: string): Effect => ({ type: "hint", text });

function arm(s: MachineState, op: Op, now: number): { state: MachineState; effects: Effect[] } {
  const sub = toastSub(op.role, s.undoMs / 1000);
  return { state: { ...s, commit: { kind: "armed", op, deadline: now + s.undoMs } },
    effects: [announce(fill(DESK.announceMarked, { name: op.name, sub }))] };
}

const CONFLICT_HINT: Record<Exclude<ConflictCode, "stale_rerun" | "stale_decision">, () => string> = {
  issue_open: () => DESK.issueOpen,
  already_approved: () => DESK.alreadyApproved,
  already_checked: () => DESK.alreadyChecked,
  removed: () => DESK_NEW.approvalRefused.removedHint,
  stage_failed: () => DESK_NEW.approvalRefused.commitHint,
};

/** The window or pending approval on the record, if any. */
export function windowOn(s: MachineState): Op | null {
  const c = s.commit;
  return c.kind === "armed" || c.kind === "awaitingToken" || c.kind === "committing" ? c.op : null;
}

function cancelWindow(s: MachineState, conceptId?: string): { s: MachineState; cancelled: Op | null } {
  const c = s.commit;
  const open = c.kind === "armed" || c.kind === "awaitingToken" || (c.kind === "botHold" && c.hold === "approve");
  if (!open || (conceptId !== undefined && c.op.conceptId !== conceptId)) return { s, cancelled: null };
  return { s: { ...s, commit: IDLE }, cancelled: c.op };
}

function outcome(s: MachineState, channel: "commit" | "report", op: Op, r: Outcome): { state: MachineState; effects: Effect[] } {
  const clear = channel === "commit" ? { ...s, commit: IDLE } : { ...s, report: { kind: "idle" } as Report };
  const failed = (saved: "no" | "unknown") => channel === "commit"
    ? { ...s, commit: { kind: "netErr", op, saved } as Commit } : { ...s, report: { kind: "netErr", op, saved } as Report };
  switch (r.type) {
    case "OK":
      return { state: clear, effects: [{ type: "saved", channel, op, outcome: r.outcome },
        ...(channel === "report" ? [announce(fill(DESK.reported, { name: op.name }))] : [])] };
    case "CONFLICT":
      if (r.code === "stale_rerun" || r.code === "stale_decision")
        return { state: clear, effects: [{ type: "stale", conceptId: op.conceptId, reason: r.code === "stale_rerun" ? "rerun" : "other",
          cancelled: true }] };
      return { state: clear, effects: [hint(CONFLICT_HINT[r.code]()), { type: "refresh" }] };
    case "CAPTCHA":
      return { state: channel === "commit" ? { ...s, commit: { kind: "botHold", hold: "commit", op } } : { ...s, report: { kind: "botHold", op } },
        effects: [announce(DESK.botFailedAnnounce)] };
    case "FORBIDDEN":
      return { state: { ...clear, auth: "forbidden" }, effects: [announce(fill(DESK.noAuthAnnounce, { name: op.name }))] };
    case "UNAUTHENTICATED":
      return { state: { ...clear, auth: "signedOut" }, effects: [announce(fill(DESK_NEW.sessionExpired.block, { name: op.name }))] };
    case "NOT_SAVED":
      return { state: failed("no"), effects: [announce(channel === "commit" ? DESK.netAnnounce : reportFailed())] };
    case "UNCONFIRMED":
      return { state: failed("unknown"), effects: [announce(channel === "commit" ? DESK_NEW.decisionUnconfirmed.announce : reportFailed())] };
  }
}

const reportFailed = () => `${DESK_NEW.deskMisc.reportFailedTitle} ${DESK_NEW.deskMisc.reportFailedBody}`;

export function step(s: MachineState, e: Event): { state: MachineState; effects: Effect[] } {
  const c = s.commit;
  switch (e.type) {
    case "SET_UNDO":
      return { state: { ...s, undoMs: e.seconds * 1000 }, effects: [] };
    case "PRESS_A":
      if (c.kind !== "idle") return { state: s, effects: [] };
      if (e.token === "failed")
        return { state: { ...s, commit: { kind: "botHold", hold: "approve", op: e.op } }, effects: [announce(DESK.botFailedAnnounce)] };
      if (e.token === "pending") return { state: { ...s, commit: { kind: "awaitingToken", op: e.op, since: e.now } }, effects: [] };
      return arm(s, e.op, e.now);
    case "TOKEN":
      return c.kind === "awaitingToken" ? arm(s, c.op, e.now) : { state: s, effects: [] };
    case "WIDGET_ERROR":
    case "TOKEN_TIMEOUT":
      return c.kind === "awaitingToken"
        ? { state: { ...s, commit: { kind: "botHold", hold: "approve", op: c.op } }, effects: [announce(DESK.botFailedAnnounce)] }
        : { state: s, effects: [] };
    case "PRESS_U":
      if (c.kind === "armed" || c.kind === "awaitingToken")
        return { state: { ...s, commit: IDLE }, effects: [announce(fill(DESK.undone, { name: c.op.name }))] };
      if (c.kind === "committing") return { state: s, effects: [hint(fill(DESK_NEW.undoWhileSaving.hint, { name: c.op.name }))] };
      return { state: s, effects: [hint(DESK.nothingToUndo)] };
    case "STALE": {
      const { s: next, cancelled } = cancelWindow(s, e.conceptId);
      return { state: next, effects: [{ type: "stale", conceptId: e.conceptId, reason: e.reason, cancelled: cancelled !== null }] };
    }
    case "FORBIDDEN":
    case "UNAUTHENTICATED": {
      const { s: next, cancelled } = cancelWindow(s);
      const auth: Auth = e.type === "FORBIDDEN" ? "forbidden" : "signedOut";
      const text = cancelled === null ? null : e.type === "FORBIDDEN"
        ? fill(DESK.noAuthAnnounce, { name: cancelled.name }) : fill(DESK_NEW.sessionExpired.block, { name: cancelled.name });
      return { state: { ...next, auth }, effects: text ? [announce(text)] : [] };
    }
    case "PAGE_UNLOAD":
      return { state: cancelWindow(s).s, effects: [] };
    case "DEADLINE":
      if (c.kind !== "armed" || e.now < c.deadline) return { state: s, effects: [] };
      return { state: { ...s, commit: { kind: "committing", op: c.op } }, effects: [{ type: "send", channel: "commit", op: c.op }] };
    case "SEND_REPORT": {
      const { s: next } = cancelWindow(s, e.op.conceptId);
      // §5.8.5: only error-callback (or 10 s without a token, which the send reports as CAPTCHA) is a bot failure.
      // "pending" sends now; the desk's freshToken waits up to TOKEN_WAIT_MS for the token.
      if (e.token === "failed") return { state: { ...next, report: { kind: "botHold", op: e.op } }, effects: [announce(DESK.botFailedAnnounce)] };
      return { state: { ...next, report: { kind: "sending", op: e.op } }, effects: [{ type: "send", channel: "report", op: e.op }] };
    }
    case "RESULT": {
      if (e.channel === "commit") return c.kind === "committing" ? outcome(s, "commit", c.op, e.result) : { state: s, effects: [] };
      return s.report.kind === "sending" ? outcome(s, "report", s.report.op, e.result) : { state: s, effects: [] };
    }
    case "RETRY_OK": {
      const passed = announce(DESK.botPassedAnnounce);
      if (c.kind === "botHold" && c.hold === "approve") {
        const armed = arm(s, c.op, e.now);
        return { state: armed.state, effects: [passed, ...armed.effects] };
      }
      if (c.kind === "botHold" && c.hold === "commit")
        return { state: { ...s, commit: { kind: "committing", op: c.op } }, effects: [passed, { type: "send", channel: "commit", op: c.op }] };
      if (s.report.kind === "botHold")
        return { state: { ...s, report: { kind: "sending", op: s.report.op } },
          effects: [passed, { type: "send", channel: "report", op: s.report.op }] };
      return { state: s, effects: [] };
    }
    case "RETRY_FAIL":
      return { state: s, effects: [announce(DESK.botFailedAnnounce)] };
    case "TRY_AGAIN":
      if (e.channel === "commit" && c.kind === "netErr")
        return { state: { ...s, commit: { kind: "committing", op: c.op } }, effects: [{ type: "send", channel: "commit", op: c.op }] };
      if (e.channel === "report" && s.report.kind === "netErr")
        return { state: { ...s, report: { kind: "sending", op: s.report.op } }, effects: [{ type: "send", channel: "report", op: s.report.op }] };
      return { state: s, effects: [] };
  }
}

/** §5.8.5: a held token older than 270 s is refreshed before a send; a fresh one is used once. */
export function tokenPlan(heldAt: number | null, now: number): "use" | "refresh" {
  return heldAt !== null && now - heldAt < TOKEN_MAX_AGE_MS ? "use" : "refresh";
}

/** The toast (§5.8.4): running while armed, "saving" while committing, nothing otherwise. */
export function toastView(s: MachineState): { mode: "running" | "saving"; op: Op } | null {
  if (s.commit.kind === "armed") return { mode: "running", op: s.commit.op };
  if (s.commit.kind === "committing") return { mode: "saving", op: s.commit.op };
  return null;
}

/**
 * A decision on this record may have been saved without the desk knowing yet: in flight (`committing`, report
 * `sending`) or unconfirmed (`netErr`, `saved: "unknown"`). A poll or refresh must not read the changed lastDecisionId
 * as another reviewer (§5.8.2 D45); the outcome sets viewedVersion, or Try again resolves it.
 */
export function unconfirmedOn(s: MachineState, conceptId: string): boolean {
  const c = s.commit, r = s.report;
  return (c.kind === "committing" && c.op.conceptId === conceptId)
    || (c.kind === "netErr" && c.saved === "unknown" && c.op.conceptId === conceptId)
    || (r.kind === "sending" && r.op.conceptId === conceptId)
    || (r.kind === "netErr" && r.saved === "unknown" && r.op.conceptId === conceptId);
}

/** §5.8.3: leaving would lose a decision. */
export function blocksUnload(s: MachineState): boolean {
  return ["awaitingToken", "armed", "committing", "netErr"].includes(s.commit.kind) || s.report.kind === "sending" || s.report.kind === "netErr";
}

/** §5.11: re-run when the stamp changed; another reviewer when only the decision id changed (unless unconfirmed). */
export function staleReason(viewed: Version, current: Version, unconfirmed: boolean): "rerun" | "other" | null {
  if (viewed.extractedAt !== current.extractedAt) return "rerun";
  if (viewed.lastDecisionId !== current.lastDecisionId && !unconfirmed) return "other";
  return null;
}

export type Viewed = Record<string, Version>;
/** §5.8.2 "Own saves never make the record stale": a saved decision's version becomes that record's viewed version. */
export function applySaved(viewed: Viewed, e: Effect): Viewed {
  return e.type === "saved" ? { ...viewed, [e.op.conceptId]: e.outcome.version } : viewed;
}
