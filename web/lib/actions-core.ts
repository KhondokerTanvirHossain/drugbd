import "server-only";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createFlag, resolveFlag, type FlagTarget } from "./api";
import { allowAccountAction } from "./limits";
import { clientIp } from "./rate-limit";
import { requestId } from "./request-id";
import { isReviewer } from "./reviewers";
import { getSession, type Session } from "./session";
import { TURNSTILE_RESPONSE_FIELD, verifyTurnstile } from "./turnstile";
import type { TurnstileAction } from "./turnstile-actions";

/**
 * The checks behind the flag and resolve server actions. Each write runs, in order:
 *   1. the session (re-read from the signed cookie) and its role,
 *   2. input validation,
 *   3. the Turnstile check (server-side, fails closed),
 *   4. the API call with the internal token and the session's own email and role (never values from the form).
 * A missing session, a wrong role or a failed Turnstile check is a 403 and the API is never called.
 * Nothing here logs: the session email is personal data.
 */

export type FlagCode = "sent" | "forbidden" | "captcha" | "invalid" | "failed";
export type ResolveCode = "resolved" | "forbidden" | "captcha" | "invalid" | "failed";
export type ActionResult<C extends string> = { status: 200 | 400 | 403 | 409 | 429 | 502; code: C };

export const FLAG_MESSAGE_MIN = 5, FLAG_MESSAGE_MAX = 2000;
const ID_MAX = 200;
export const FLAG_TARGETS: readonly FlagTarget[] = ["product", "substance", "check"];

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};
const validId = (s: string) => s.length > 0 && s.length <= ID_MAX;

async function turnstilePassed(fd: FormData, action: TurnstileAction): Promise<boolean> {
  return verifyTurnstile(fd.get(TURNSTILE_RESPONSE_FIELD), clientIp(await headers()), action);
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

  const r = await createFlag({ targetType: targetType as FlagTarget, targetId, message, reporterEmail: session.email,
    requestId: await requestId() });
  if (r.ok) {
    revalidatePath("/review/flags");
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

  // §5.15: the audit row carries the web request id (the middleware's x-request-id). A second resolve is the API's 409.
  const r = await resolveFlag(Number(raw), session.email, await requestId());
  if (!r.ok) return r.status === 404 || r.status === 409 ? { status: 400, code: "invalid" } : { status: 502, code: "failed" };
  revalidatePath("/review/flags");
  return { status: 200, code: "resolved" };
}
