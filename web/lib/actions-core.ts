import "server-only";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createFlag, postDecision, resolveFlag, type FlagTarget } from "./api";
import { allowAccountAction } from "./limits";
import { clientIp } from "./rate-limit";
import type { ReviewerRole } from "./reviewers";
import { getSession, type Session } from "./session";
import { TURNSTILE_RESPONSE_FIELD, verifyTurnstile } from "./turnstile";
import type { TurnstileAction } from "./turnstile-actions";

/**
 * The checks behind the review and flag server actions. Each write runs, in order:
 *   1. the session (re-read from the signed cookie) and its role,
 *   2. input validation,
 *   3. the Turnstile check (server-side, fails closed),
 *   4. the API call with the internal token and the session's own email and role (never values from the form).
 * A missing session, a wrong role or a failed Turnstile check is a 403 and the API is never called.
 * Nothing here logs: the session email is personal data.
 */

export type ReviewCode = "saved" | "forbidden" | "captcha" | "invalid" | "stale" | "decided" | "checks" | "issue_open"
  | "approved" | "checked" | "removed" | "failed" | "rate_limited";
export type FlagCode = "sent" | "forbidden" | "captcha" | "invalid" | "failed";
export type ResolveCode = "resolved" | "forbidden" | "captcha" | "invalid" | "failed";
export type ActionResult<C extends string> = { status: 200 | 400 | 403 | 409 | 429 | 502; code: C };

export const ISSUE_NOTE_MIN = 5, NOTE_MAX = 1000, FLAG_MESSAGE_MIN = 5, FLAG_MESSAGE_MAX = 2000;
const ID_MAX = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISION_ID_RE = /^[1-9][0-9]{0,14}$/;
/** The API's step 6 to 8 messages (spec §7.2), which share the field `review`. */
const REVIEW_REFUSALS: Record<string, ReviewCode> = {
  "An issue is open on this record. It returns to review after the fix and re-run.": "issue_open",
  "This record is already approved by a pharmacist": "approved",
  "Your check is already recorded for this record": "checked",
};

/** A 409 from the decision endpoint, by its `field` (spec §7.2). Anything unknown asks for a reload. */
function conflictCode(field: string | null, message: string): ReviewCode {
  switch (field) {
    case "lastDecisionId": return "decided";
    case "stages": return "checks";
    case "conceptId": return "removed";
    case "review": return REVIEW_REFUSALS[message] ?? "stale";
    default: return "stale";
  }
}
export const FLAG_TARGETS: readonly FlagTarget[] = ["product", "substance", "check"];

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};
const isReviewer = (s: Session | null): s is Session & { role: ReviewerRole } =>
  s?.role === "pharmacist" || s?.role === "engineer";
const validId = (s: string) => s.length > 0 && s.length <= ID_MAX;

async function turnstilePassed(fd: FormData, action: TurnstileAction): Promise<boolean> {
  return verifyTurnstile(fd.get(TURNSTILE_RESPONSE_FIELD), clientIp(await headers()), action);
}

/** Path of a batch page, used for both revalidation and the redirect back. */
export const batchPath = (batchId: string) => `/batches/${encodeURIComponent(batchId)}`;

export async function submitReview(fd: FormData): Promise<ActionResult<ReviewCode>> {
  const session = await getSession();
  if (!isReviewer(session)) return { status: 403, code: "forbidden" };

  const batchId = field(fd, "batchId"), conceptId = field(fd, "conceptId"), decision = field(fd, "decision");
  const note = field(fd, "note").trim();
  // The form always carries the item's extractedAt ("" when the item has none, sent as null); the API requires it.
  const rawExtractedAt = fd.get("extractedAt");
  if (typeof rawExtractedAt !== "string" || rawExtractedAt.length > 64) return { status: 400, code: "invalid" };
  const extractedAt = rawExtractedAt || null;
  // The form also carries the newest decision id ("" when none, sent as null) and a requestId rendered with the page.
  const rawLast = fd.get("expectedLastDecisionId");
  if (typeof rawLast !== "string" || (rawLast !== "" && !DECISION_ID_RE.test(rawLast))) return { status: 400, code: "invalid" };
  const expectedLastDecisionId = rawLast === "" ? null : Number(rawLast);
  const requestId = field(fd, "requestId");
  if (!UUID_RE.test(requestId)) return { status: 400, code: "invalid" };
  if (!validId(batchId) || !validId(conceptId)) return { status: 400, code: "invalid" };
  if (decision !== "ok" && decision !== "issue") return { status: 400, code: "invalid" };
  if (note.length > NOTE_MAX || (decision === "issue" && note.length < ISSUE_NOTE_MIN)) return { status: 400, code: "invalid" };

  if (!allowAccountAction("decision", session.email)) return { status: 429, code: "rate_limited" };
  if (!(await turnstilePassed(fd, "decision"))) return { status: 403, code: "captcha" };

  const r = await postDecision(batchId, conceptId, { decision, note, reviewerEmail: session.email,
    reviewerRole: session.role, extractedAt, expectedLastDecisionId, requestId });
  if (r.ok || r.status === 409) revalidatePath(batchPath(batchId));
  if (r.ok) return { status: 200, code: "saved" };   // a replayed request (200) is the same saved decision
  if (r.status === 409) return { status: 409, code: conflictCode(r.field, r.error) };
  if (r.status === 400) return { status: 400, code: "invalid" };
  return { status: 502, code: "failed" };
}

/** Where a flag form sends the visitor back to; built from validated fields only (no open redirect). */
export function flagReturnPath(targetType: string, targetId: string): string {
  if (targetType === "product") return `/products/${encodeURIComponent(targetId)}`;
  if (targetType === "substance") return `/substances/${encodeURIComponent(targetId)}`;
  if (targetType === "check") {
    // "check" is the check page's target when no product is selected.
    const ids = targetId === "check" ? [] : targetId.split(",").map((s) => s.trim()).filter(Boolean);
    return ids.length ? `/check?${new URLSearchParams(ids.map((id) => ["ids", id]))}` : "/check";
  }
  return "/";
}

export async function submitFlag(fd: FormData): Promise<ActionResult<FlagCode>> {
  const session = await getSession();
  if (!session) return { status: 403, code: "forbidden" };

  const targetType = field(fd, "targetType"), targetId = field(fd, "targetId"), message = field(fd, "message").trim();
  if (!(FLAG_TARGETS as readonly string[]).includes(targetType) || !validId(targetId)) return { status: 400, code: "invalid" };
  if (message.length < FLAG_MESSAGE_MIN || message.length > FLAG_MESSAGE_MAX) return { status: 400, code: "invalid" };

  if (!allowAccountAction("flag", session.email)) return { status: 429, code: "failed" };
  if (!(await turnstilePassed(fd, "flag"))) return { status: 403, code: "captcha" };

  const r = await createFlag({ targetType: targetType as FlagTarget, targetId, message, reporterEmail: session.email });
  if (r.ok) {
    revalidatePath("/flags");
    return { status: 200, code: "sent" };
  }
  return r.status === 400 ? { status: 400, code: "invalid" } : { status: 502, code: "failed" };
}

export async function submitResolve(fd: FormData): Promise<ActionResult<ResolveCode>> {
  const session = await getSession();
  if (!isReviewer(session)) return { status: 403, code: "forbidden" };

  const raw = field(fd, "flagId");
  if (!/^[1-9][0-9]{0,17}$/.test(raw)) return { status: 400, code: "invalid" };

  if (!(await turnstilePassed(fd, "resolve"))) return { status: 403, code: "captcha" };

  const r = await resolveFlag(Number(raw), session.email);
  if (!r.ok) return r.status === 404 || r.status === 409 ? { status: 400, code: "invalid" } : { status: 502, code: "failed" };
  revalidatePath("/flags");
  return { status: 200, code: "resolved" };
}
