import "server-only";
import { headers } from "next/headers";
import { postPairDecision } from "./api";
import { recordAudit } from "./audit";
import { AUDIT_ONCE } from "./audit-once";
import { allowAccountAction } from "./limits";
import { accountKey, clientIp } from "./rate-limit";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";
import { PAIR_SHOWS, type PairDecideInput, type PairDecideResult } from "./senior-types";
import { getSession } from "./session";
import { verifyTurnstile } from "./turnstile";

/*
 * The pair decision action behind the senior pages (§5.17.2, §7.7). In order: the session (none: unauthenticated; not a
 * senior: forbidden), input bounds, the per-account decision budget shared with record decisions (§9.3), the bot check
 * (action "decision", §9.2), then the API with the session's own email and role. The API writes pair_decision and
 * pair_decision_rejected (§5.15). Emails and notes are personal data and are never logged.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^DDInter[0-9]{1,6}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const NOTE_MAX = 1000, ISSUE_MIN = 5, TOKEN_MAX = 2048;
const codePoints = (s: string) => [...s].length;

function parse(x: unknown): PairDecideInput | null {
  if (typeof x !== "object" || x === null) return null;
  const i = x as Record<string, unknown>;
  if (typeof i.ddinterA !== "string" || typeof i.ddinterB !== "string" || !ID_RE.test(i.ddinterA) || !ID_RE.test(i.ddinterB)) return null;
  if (!(i.ddinterA < i.ddinterB)) return null;   // the API stores each pair once, in text order (§7.7 step 2)
  if (i.decision !== "reviewed" && i.decision !== "issue") return null;
  if (typeof i.note !== "string") return null;
  const note = i.note.trim();
  if (codePoints(note) > NOTE_MAX || (i.decision === "issue" && codePoints(note) < ISSUE_MIN)) return null;
  if (typeof i.expectedContentHash !== "string" || !HASH_RE.test(i.expectedContentHash)) return null;
  const last = i.expectedLastPairReviewId;
  if (last !== null && (typeof last !== "number" || !Number.isSafeInteger(last) || last < 1)) return null;
  if (typeof i.requestId !== "string" || !UUID_RE.test(i.requestId)) return null;
  if (typeof i.turnstileToken !== "string" || i.turnstileToken.length > TOKEN_MAX) return null;
  return { ddinterA: i.ddinterA, ddinterB: i.ddinterB, decision: i.decision, note, expectedContentHash: i.expectedContentHash,
    expectedLastPairReviewId: last as number | null, requestId: i.requestId, turnstileToken: i.turnstileToken };
}

const CONFLICT: Record<string, "content_changed" | "other_senior" | "already_reviewed"> = {
  contentHash: "content_changed", lastPairReviewId: "other_senior", state: "already_reviewed",
};

export async function runPairDecide(input: unknown): Promise<PairDecideResult> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "senior") return { ok: false, code: "forbidden" };
  const d = parse(input);
  if (!d) return { ok: false, code: "invalid" };
  if (!allowAccountAction("decision", session.email)) return { ok: false, code: "rate_limited" };
  if (!(await verifyTurnstile(d.turnstileToken, clientIp(await headers()), "decision"))) return { ok: false, code: "captcha" };
  const r = await postPairDecision(d.ddinterA, d.ddinterB, { decision: d.decision, note: d.note, reviewerEmail: session.email,
    reviewerRole: "senior", expectedContentHash: d.expectedContentHash, expectedLastPairReviewId: d.expectedLastPairReviewId,
    requestId: d.requestId });
  if (r.ok) return { ok: true, outcome: r.data };
  if (r.status === 409) return { ok: false, code: CONFLICT[r.field ?? ""] ?? "already_reviewed" };
  if (r.status === 404) return { ok: false, code: "not_found" };
  if (r.status === 400) return { ok: false, code: "invalid" };
  return { ok: false, code: "failed" };
}

export function pairDecideStatus(r: PairDecideResult): number {
  if (r.ok) return 200;
  switch (r.code) {
    case "invalid": return 400;
    case "unauthenticated": return 401;
    case "forbidden": case "captcha": return 403;
    case "not_found": return 404;
    case "rate_limited": return 429;
    case "failed": return 502;
    default: return 409;
  }
}

/** runPairDecide plus its one log line: action name, status, duration and the web request id (§9.7). */
export async function runPairDecideLogged(input: unknown): Promise<PairDecideResult> {
  const started = performance.now();
  const result = await runPairDecide(input);
  logRequest({ route: "action:pair-decide", method: "POST", status: pairDecideStatus(result), ms: performance.now() - started,
    requestId: await requestId() });
  return result;
}

/** §5.15 senior_open: a senior page shown (never a prefetch: the island calls this on mount). At most once per actor, page and 10 minutes. */
export async function logSenior(type: unknown, id: unknown): Promise<void> {
  if ((type !== "pair_queue" && type !== "substance") || typeof id !== "string") return;
  if (type === "pair_queue" ? !(PAIR_SHOWS as readonly string[]).includes(id) : !/^[A-Za-z0-9-]{1,64}$/.test(id)) return;
  const session = await getSession();
  if (!session || session.role !== "senior") return;
  if (!AUDIT_ONCE(`senior_open|${accountKey(session.email)}|${type}/${id}`)) return;
  await recordAudit({ event: "senior_open", outcome: "shown", actorEmail: session.email, actorRole: "senior", targetType: type, targetId: id });
}
