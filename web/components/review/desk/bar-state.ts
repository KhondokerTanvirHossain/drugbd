import { DESK_NEW, PROMISE_ENGINEER, PROMISE_PAUSED, PROMISE_PHARMACIST, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { DisplayStatus, ReviewerRole } from "@/lib/review-types";
import { windowOn, type MachineState } from "./commit-machine";

/** Everything the decision bar's words and states depend on (§5.7, §5.8.4). Pure. */
export type BarCtx = {
  loading: boolean; complete: boolean; role: ReviewerRole; batchId: string;
  record: { conceptId: string; name: string; status: DisplayStatus; stagesBlocked: boolean } | null;
  stale: boolean; drawerOpen: boolean; reportOpen: boolean; machine: MachineState; undoSeconds: number;
  advanceGuard: { conceptId: string; at: number } | null; now: number;
};

export const ADVANCE_GUARD_MS = 1000;
export const NOTE_MIN = 5, NOTE_MAX = 1000;
/** The API counts characters in code points (Validate.length); so does the desk (Review Focus 2). */
export const noteLength = (s: string) => [...s.trim()].length;

const p = (lead: string, body: string) => ({ lead, body });
const onRecord = (ctx: BarCtx, conceptId: string | undefined) => ctx.record !== null && ctx.record.conceptId === conceptId;
const netErrHere = (ctx: BarCtx) => ctx.machine.commit.kind === "netErr" && onRecord(ctx, ctx.machine.commit.op.conceptId)
  ? ctx.machine.commit.saved : null;

export function promise(ctx: BarCtx): { lead: string; body: string } {
  const c = ctx.machine.commit, r = ctx.record, pharmacist = ctx.role === "pharmacist";
  if (ctx.loading) return p(fill(DESK.promiseLoading, { id: ctx.batchId }), DESK.promiseLoadingBody);
  if (ctx.complete) return p(fill(DESK.promiseComplete, { id: ctx.batchId }), DESK.promiseCompleteBody);
  if (ctx.stale) return p(PROMISE_PAUSED.lead, PROMISE_PAUSED.body);
  const net = netErrHere(ctx);
  if (net === "no") return p(DESK.promiseNotSaved, DESK.promiseNotSavedBody);
  if (net === "unknown") return p(DESK_NEW.decisionUnconfirmed.promiseLead, DESK_NEW.decisionUnconfirmed.promiseBody);
  if (c.kind === "armed" && onRecord(ctx, c.op.conceptId))
    return p(DESK.promiseMarked, pharmacist ? DESK.promiseMarkedPharmacist : DESK.promiseMarkedEngineer);
  if (c.kind === "committing" && onRecord(ctx, c.op.conceptId))
    return p(DESK_NEW.committing.lead, pharmacist ? DESK_NEW.committing.pharmacistBody : DESK_NEW.committing.engineerBody);
  if (r?.stagesBlocked) return p(DESK_NEW.approvalRefused.promiseLead, DESK_NEW.approvalRefused.promiseBody);
  if (r?.status === "approved") return p(DESK.promiseApproved, DESK.promiseApprovedBody);
  if (r?.status === "issue") return p(DESK.promiseIssue, DESK.promiseIssueBody);
  if (!pharmacist && r?.status === "engineer_checked") return p(DESK.promiseChecked, DESK.promiseCheckedBody);
  return pharmacist ? p(PROMISE_PHARMACIST.lead, PROMISE_PHARMACIST.body(ctx.undoSeconds)) : p(PROMISE_ENGINEER.lead, PROMISE_ENGINEER.body);
}

type Hint = { block: boolean; text: string | null };
const allow: Hint = { block: false, text: null };
const say = (text: string): Hint => ({ block: true, text });

/** Board R's approve() order, extended (§5.8.4). */
export function approveHint(ctx: BarCtx): Hint {
  const m = ctx.machine, c = m.commit, r = ctx.record;
  if (m.auth === "forbidden") return say(DESK.noAuthTitle);
  if (m.auth === "signedOut") return say(DESK_NEW.sessionExpired.hint);
  if (ctx.loading) return { block: true, text: null };
  if (ctx.complete || r === null) return say(DESK.completeHint);
  if (ctx.drawerOpen) return say(DESK_NEW.drawerOpen.hint);
  if (ctx.stale) return say(DESK.paused);
  const open = windowOn(m);
  if (open && open.conceptId === r.conceptId) return say(DESK.thisWindow);
  if (open) return say(fill(DESK.otherWindow, { name: open.name }));
  if (c.kind === "netErr") {
    if (c.op.conceptId === r.conceptId) return say(c.saved === "no" ? DESK.notSavedHint : DESK_NEW.decisionUnconfirmed.hint);
    // The machine holds one commit, so A elsewhere cannot start a window while a failed commit waits for Try again.
    // §5.8.4 has no row of its own for this; §5.8.3 already gives a waiting failed commit the "window on another
    // record" hint (the leave guard), so the same spec string is used here rather than new copy.
    return say(fill(DESK.otherWindow, { name: c.op.name }));
  }
  if (r.stagesBlocked) return say(DESK_NEW.approvalRefused.hint);
  if (r.status === "approved") return say(DESK.alreadyApproved);
  if (r.status === "issue") return say(DESK.issueOpen);
  if (ctx.role === "engineer" && r.status === "engineer_checked") return say(DESK.alreadyChecked);
  if (ctx.reportOpen) return say(DESK.reportOpen);
  if (ctx.advanceGuard && ctx.advanceGuard.conceptId === r.conceptId && ctx.now - ctx.advanceGuard.at < ADVANCE_GUARD_MS)
    return say(fill(DESK.advanceGuard, { name: r.name }));
  if (c.kind === "botHold" || m.report.kind === "botHold") return say(DESK.botFirst);
  return allow;
}

/** R, and the Report issue button while the panel is closed: the rows of the A order that name R. */
export function reportHint(ctx: BarCtx): Hint {
  if (ctx.machine.auth === "forbidden") return say(DESK.noAuthTitle);
  if (ctx.machine.auth === "signedOut") return say(DESK_NEW.sessionExpired.hint);
  if (ctx.loading || ctx.complete || ctx.record === null) return { block: true, text: null };
  if (ctx.drawerOpen) return say(DESK_NEW.drawerOpen.hint);
  if (ctx.stale) return say(DESK.paused);
  return allow;
}

export function sendHint(ctx: BarCtx): string | null {
  if (ctx.stale) return DESK.reportPaused;
  if (ctx.machine.report.kind === "botHold" || ctx.machine.commit.kind === "botHold") return DESK.botFirst;
  return null;
}

export function approveDisabled(ctx: BarCtx): boolean {
  const r = ctx.record, m = ctx.machine;
  if (r === null || ctx.loading || ctx.complete || ctx.stale || ctx.drawerOpen || ctx.reportOpen || m.auth !== "ok") return true;
  const open = windowOn(m);
  if (open && open.conceptId === r.conceptId) return true;
  if (netErrHere(ctx) !== null) return true;
  if (r.status === "approved" || r.status === "issue" || r.stagesBlocked) return true;
  return ctx.role === "engineer" && r.status === "engineer_checked";
}

export function reportDisabled(ctx: BarCtx): boolean {
  return ctx.record === null || ctx.loading || ctx.complete || ctx.stale || ctx.drawerOpen;
}

export const sendDisabled = (ctx: BarCtx) => ctx.stale;
