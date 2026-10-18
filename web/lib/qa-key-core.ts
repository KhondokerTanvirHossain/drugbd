import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createQaKey, revokeQaKey, type QaKeyOwnerRole } from "./api";
import { allowAccountAction } from "./limits";
import { QA_KEY_ID, toQaKeyView, validQaKeyName, type CreateQaKeyResult, type RevokeQaKeyResult } from "./qa-key-types";
import { clientIp } from "./rate-limit";
import { requestId } from "./request-id";
import { canUseQa } from "./reviewers";
import { getSession, type Session } from "./session";
import { TURNSTILE_RESPONSE_FIELD, verifyTurnstile } from "./turnstile";

/*
 * The checks behind the /review/qa key actions (spec §7.10.5, D67). Each runs, in order:
 *   1. the session, re-read from the encrypted cookie with its role re-checked against REVIEWERS (lib/session.ts):
 *      none is `unauthenticated`, a role that fails canUseQa is `forbidden`;
 *   2. CSRF and origin: Next's own server-action check (next.config.ts sets no serverActions.allowedOrigins), plus the
 *      SameSite=Lax session cookie;
 *   3. input validation (`invalid`);
 *   4. the per-account web limit (create: qaKeyCreate, `daily_limit`; revoke: qaKeyRevoke, `rate_limited`; §9.3);
 *   5. Turnstile, action `qakey` (`captcha`);
 *   6. the API with the internal token and the session's own email and role, never values from the form.
 * A key is generated after step 5 only, so a refused request never makes one. The key is in a `created` result and nowhere
 * else: never in a log line, an error, a redirect or revalidatePath data. Nothing here logs: the email is personal data.
 */

/** §7.10.2: "idqa_" + 43 base64url characters (32 random bytes, no padding). */
export function generateQaKey(): string {
  return `idqa_${randomBytes(32).toString("base64url")}`;
}

/** The SHA-256 hex of the full key's UTF-8 bytes, prefix included: the only form the API ever sees. */
export function hashQaKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

const field = (fd: FormData, name: string): unknown => fd.get(name);

/** Steps 1 and 1b: the session that may use QA tools, or the code that stops the action. */
async function qaSession(): Promise<{ ok: true; session: Session & { role: QaKeyOwnerRole } } | { ok: false; code: "unauthenticated" | "forbidden" }> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (!canUseQa(session.role)) return { ok: false, code: "forbidden" };
  return { ok: true, session: session as Session & { role: QaKeyOwnerRole } };
}

async function turnstilePassed(fd: FormData): Promise<boolean> {
  return verifyTurnstile(field(fd, TURNSTILE_RESPONSE_FIELD), clientIp(await headers()), "qakey");
}

export async function runCreateQaKey(fd: FormData): Promise<CreateQaKeyResult> {
  const s = await qaSession();
  if (!s.ok) return { code: s.code };
  const name = validQaKeyName(field(fd, "name"));
  if (name === null) return { code: "invalid" };
  if (!allowAccountAction("qaKeyCreate", s.session.email)) return { code: "daily_limit" };
  if (!(await turnstilePassed(fd))) return { code: "captcha" };

  const key = generateQaKey();
  const r = await createQaKey({ ownerEmail: s.session.email, ownerRole: s.session.role, name, keyHash: hashQaKey(key),
    requestId: await requestId() });
  if (!r.ok) {
    if (r.status === 409 && r.field === "activeKeys") return { code: "active_limit" };
    if (r.status === 409 && r.field === "createdToday") return { code: "daily_limit" };
    return { code: "failed" };   // network, timeout, 5xx, 409 keyHash and any other answer (§7.10.5)
  }
  revalidatePath("/review/qa");
  return { code: "created", key, row: toQaKeyView(r.data) };
}

export async function runRevokeQaKey(fd: FormData): Promise<RevokeQaKeyResult> {
  const s = await qaSession();
  if (!s.ok) return { code: s.code };
  const raw = field(fd, "keyId");
  if (typeof raw !== "string" || !QA_KEY_ID.test(raw)) return { code: "invalid" };
  if (!allowAccountAction("qaKeyRevoke", s.session.email)) return { code: "rate_limited" };
  if (!(await turnstilePassed(fd))) return { code: "captcha" };

  const r = await revokeQaKey(Number(raw), { ownerEmail: s.session.email, ownerRole: s.session.role, requestId: await requestId() });
  if (!r.ok) {
    if (r.status === 409 && r.field === "status") return { code: "already_revoked" };
    if (r.status === 404) return { code: "not_found" };
    if (r.status === 400) return { code: "invalid" };
    return { code: "failed" };
  }
  revalidatePath("/review/qa");
  const row = toQaKeyView(r.data);
  return row ? { code: "revoked", row } : { code: "revoked" };
}

const CREATE_STATUS: Record<CreateQaKeyResult["code"], number> = {
  created: 201, invalid: 400, unauthenticated: 401, forbidden: 403, captcha: 403, active_limit: 409, daily_limit: 429, failed: 502,
};
const REVOKE_STATUS: Record<RevokeQaKeyResult["code"], number> = {
  revoked: 200, invalid: 400, unauthenticated: 401, forbidden: 403, captcha: 403, not_found: 404, already_revoked: 409,
  rate_limited: 429, failed: 502,
};
export const createStatus = (r: CreateQaKeyResult): number => CREATE_STATUS[r.code];
export const revokeStatus = (r: RevokeQaKeyResult): number => REVOKE_STATUS[r.code];
