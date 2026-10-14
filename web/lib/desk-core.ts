import "server-only";
import { headers } from "next/headers";
import type { DecideCode, DecideResultLike } from "@/components/review/desk/commit-machine";
import { getReviewDiff, postDeskDecision } from "./api";
import { DESK_NEW } from "./copy";
import { recordAudit } from "./audit";
import { AUDIT_ONCE } from "./audit-once";
import { allowAccountAction } from "./limits";
import { accountKey, clientIp } from "./rate-limit";
import type { DiffRow } from "./review-types";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";
import { isReviewer } from "./reviewers";
import { getSession, type Session } from "./session";
import { verifyTurnstile } from "./turnstile";

/*
 * The decide action behind the desk (§5.8). In order: the session (none: unauthenticated; not a reviewer: forbidden),
 * input bounds, the per-account limit (§9.3), the bot check (action "decision"), then the API with the session's own
 * email and role, never values from the client. Every stop before the API is a decision_denied audit row (§5.15).
 * The only log line is P1A's request line (logAction): action name, status, duration, web request id. Emails and notes
 * are personal data and are never logged.
 */
export type DecideInput = {
  batchId: string; conceptId: string; decision: "ok" | "issue"; note: string; extractedAt: string | null;
  expectedLastDecisionId: number | null; requestId: string; turnstileToken: string;
};
export type DecideResult = DecideResultLike;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_MAX = 200, NOTE_MAX = 1000, ISSUE_MIN = 5, STAMP_MAX = 64, TOKEN_MAX = 2048;
const codePoints = (s: string) => [...s].length;
const validId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= ID_MAX;

// The API's 409 messages (DecisionGuard). The first one ends in a NEW_COPY sentence, so it is built from it: P1A's
// copy.test fails on a retyped NEW_COPY string, and DESK.issueOpen (Task 9) is the same sentence.
const REVIEW_REFUSALS: Record<string, DecideCode> = {
  [`An issue is open on this record. ${DESK_NEW.approvalRefused.promiseBody}`]: "issue_open",
  "This record is already approved by a pharmacist": "already_approved",
  "Your check is already recorded for this record": "already_checked",
};

/** A 409 from the decision endpoint, by its field (§7.2, §5.11). */
export function conflictCode(field: string | null, message: string): DecideCode {
  switch (field) {
    case "extractedAt": return "stale_rerun";
    case "lastDecisionId": return "stale_decision";
    case "stages": return "stage_failed";
    case "conceptId": return "removed";
    case "review": return REVIEW_REFUSALS[message] ?? "stale_decision";
    default: return "stale_rerun";
  }
}

function parse(x: unknown): DecideInput | null {
  if (typeof x !== "object" || x === null) return null;
  const i = x as Record<string, unknown>;
  if (!validId(i.batchId) || !validId(i.conceptId)) return null;
  if (i.decision !== "ok" && i.decision !== "issue") return null;
  if (typeof i.note !== "string") return null;
  const note = i.note.trim();
  if (codePoints(note) > NOTE_MAX || (i.decision === "issue" && codePoints(note) < ISSUE_MIN)) return null;
  if (i.extractedAt !== null && (typeof i.extractedAt !== "string" || i.extractedAt.length === 0 || i.extractedAt.length > STAMP_MAX)) return null;
  const last = i.expectedLastDecisionId;
  if (last !== null && (typeof last !== "number" || !Number.isSafeInteger(last) || last < 1)) return null;
  if (typeof i.requestId !== "string" || !UUID_RE.test(i.requestId)) return null;
  if (typeof i.turnstileToken !== "string" || i.turnstileToken.length > TOKEN_MAX) return null;
  return { batchId: i.batchId, conceptId: i.conceptId, decision: i.decision, note, extractedAt: i.extractedAt as string | null,
    expectedLastDecisionId: last as number | null, requestId: i.requestId, turnstileToken: i.turnstileToken };
}

/**
 * The audit target `{batchId}/{conceptId}`, or null. P1A Task 17's AuditService refuses a targetId over 200 characters
 * (TARGET_ID_MAX, 400 field=targetId), and recordAudit is best effort, so a longer target would silently lose the row;
 * the same bound as P1A Task 18's denyDecision (batchId.length + conceptId.length < ID_MAX) keeps the row, without a target.
 */
function targetId(batchId: unknown, conceptId: unknown): string | null {
  return validId(batchId) && validId(conceptId) && batchId.length + conceptId.length < ID_MAX ? `${batchId}/${conceptId}` : null;
}

function targetOf(x: unknown): string | null {
  const i = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
  return targetId(i.batchId, i.conceptId);
}

/**
 * §5.15 decision_denied, written here: the outcomes P1A Task 18 defined for the legacy /batches review form.
 * The target is the batch item only when both ids are valid. Best effort: an audit outage never changes the answer.
 */
async function deny(outcome: "unauthenticated" | "forbidden" | "rate_limited" | "captcha", s: Session | null, target: string | null) {
  await recordAudit({ event: "decision_denied", outcome, actorEmail: s?.email ?? null, actorRole: s?.role ?? null,
    targetType: target ? "batch_item" : null, targetId: target }).catch(() => false);
}

export async function runDecide(input: unknown): Promise<DecideResult> {
  const session = await getSession();
  const target = targetOf(input);
  if (!session) {
    await deny("unauthenticated", null, target);
    return { ok: false, code: "unauthenticated" };
  }
  if (!isReviewer(session) || (session.role !== "pharmacist" && session.role !== "engineer")) {
    await deny("forbidden", session, target);
    return { ok: false, code: "forbidden" };
  }
  const d = parse(input);
  if (!d) return { ok: false, code: "invalid" };
  if (!allowAccountAction("decision", session.email)) {
    await deny("rate_limited", session, target);
    return { ok: false, code: "rate_limited" };
  }
  if (!(await verifyTurnstile(d.turnstileToken, clientIp(await headers()), "decision"))) {
    await deny("captcha", session, target);
    return { ok: false, code: "captcha" };
  }
  const r = await postDeskDecision(d.batchId, d.conceptId, { decision: d.decision, note: d.note, reviewerEmail: session.email,
    reviewerRole: session.role, extractedAt: d.extractedAt, expectedLastDecisionId: d.expectedLastDecisionId, requestId: d.requestId });
  if (r.ok) return { ok: true, outcome: r.data };
  if (r.status === 409) return { ok: false, code: conflictCode(r.field, r.error) };
  if (r.status === 400) return { ok: false, code: "invalid" };
  if (r.status === 404) return { ok: false, code: "removed" };
  return { ok: false, code: "failed" };
}

/** The status a decide result is logged with (§9.7 log line). */
export function decideStatus(r: DecideResult): number {
  if (r.ok) return 200;
  switch (r.code) {
    case "invalid": return 400;
    case "unauthenticated": return 401;
    case "forbidden": case "captcha": return 403;
    case "removed": return 404;
    case "rate_limited": return 429;
    case "failed": return 502;
    default: return 409;
  }
}

/** P1A Task 25's log line for a desk server action: name, status, duration and the web request id, never a form field. */
export async function logAction(route: "action:decide" | "action:decide-form", status: number, started: number): Promise<void> {
  logRequest({ route, method: "POST", status, ms: performance.now() - started, requestId: await requestId() });
}

/** runDecide plus its one log line. */
export async function runDecideLogged(route: "action:decide" | "action:decide-form", input: unknown): Promise<DecideResult> {
  const started = performance.now();
  const result = await runDecide(input);
  await logAction(route, decideStatus(result), started);
  return result;
}

/** review_open (the record is shown as the open record) and evidence_open (drawer opened), §5.15. */
export async function logOpen(kind: "review_open" | "evidence_open", batchId: unknown, conceptId: unknown): Promise<void> {
  if (!validId(batchId) || !validId(conceptId)) return;
  const session = await getSession();
  if (!session || !isReviewer(session)) return;
  if (!AUDIT_ONCE(`${kind}|${accountKey(session.email)}|${batchId}/${conceptId}`)) return;
  const target = targetId(batchId, conceptId);   // null past 200 characters: the row is kept, without a target
  await recordAudit({ event: kind, outcome: "shown", actorEmail: session.email, actorRole: session.role,
    targetType: target ? "batch_item" : null, targetId: target });
}

/** Without JavaScript the record page render is the "shown" moment; prefetches never are (§5.15). */
export async function logOpenOnRender(batchId: string, conceptId: string, h: Headers): Promise<void> {
  if (h.get("next-router-prefetch") === "1" || h.get("purpose") === "prefetch") return;
  await logOpen("review_open", batchId, conceptId);
}

/** "See what changed" (§5.11): the diff rows from the page's stamp to now, reviewers only. */
export async function diffRows(batchId: unknown, conceptId: unknown, from: unknown): Promise<DiffRow[] | null> {
  if (!validId(batchId) || !validId(conceptId) || typeof from !== "string" || from.length === 0 || from.length > STAMP_MAX) return null;
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;
  try {
    return (await getReviewDiff(batchId, conceptId, from))?.rows ?? null;
  } catch {
    return null;
  }
}
