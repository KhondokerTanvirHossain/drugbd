import { NextResponse } from "next/server";
import { recordAudit, type AuditInput } from "@/lib/audit";
import { firebaseProjectId, verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { clientIp } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-log";
import { SIGN_IN_STATES } from "@/lib/copy";
import { safeReturnTo } from "@/lib/return-to";
import { roleFor } from "@/lib/reviewers";
import { LEGACY_SESSION_COOKIE, createSessionCookie, sessionCookieName, sessionCookieOptions } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const MAX_ID_TOKEN_LENGTH = 8192;
const MAX_RETURN_TO_LENGTH = 2048;
const MAX_NAME_LENGTH = 200;
/** An ID token is exchanged right after the Google sign-in; older sign-ins are refused (Firebase's session guidance). */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;
const WELCOME = "/signin?welcome=1";
const NO_STORE = { "Cache-Control": "private, no-store" };

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, data: null, message, errors: [{ code, message }] }, { status, headers: NO_STORE });

/** Audit writes are best effort (recordAudit logs its own failure); an audit outage never blocks sign-in. */
const audit = (e: AuditInput) => recordAudit(e).catch(() => false);
const deny = async (outcome: "captcha" | "unverified" | "stale_auth" | "invalid", status: number, code: string, message: string) => {
  await audit({ event: "sign_in_denied", outcome });
  return fail(status, code, message);
};

/**
 * POST {idToken, turnstileToken, returnTo}: checks the bot check (action signin), verifies the Firebase ID token,
 * requires a verified email and a fresh sign-in, maps the role from REVIEWERS, and sets the encrypted session cookie.
 * The email is never returned or logged. Rate limiting (10 per 10 minutes per IP) is in middleware.ts.
 */
async function handle(request: Request): Promise<Response> {
  // A JSON body needs a CORS preflight cross-origin, so another site cannot post its own token here (login CSRF).
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return fail(415, "UNSUPPORTED_MEDIA_TYPE", "Send the token as JSON.");
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || idToken.length === 0 || idToken.length > MAX_ID_TOKEN_LENGTH) {
    return fail(400, "BAD_REQUEST", "idToken is required.");
  }
  const returnTo = body?.returnTo ?? null;
  if (returnTo !== null && (typeof returnTo !== "string" || returnTo.length > MAX_RETURN_TO_LENGTH)) {
    return fail(400, "BAD_REQUEST", "returnTo must be a path.");
  }
  const projectId = firebaseProjectId();
  if (!projectId) return fail(503, "SIGNIN_DISABLED", "Reviewer sign-in is not configured.");

  if (!(await verifyTurnstile(body?.turnstileToken, clientIp(request.headers), "signin"))) {
    return deny("captcha", 403, "CAPTCHA", "The bot check did not pass.");
  }

  let decoded: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  // §1.7 new copy: each 401 names its reason by code; the message is the matching SIGN_IN_STATES body.
  try {
    decoded = await verifyFirebaseIdToken(idToken, projectId);
  } catch {
    return deny("invalid", 401, "INVALID_ID_TOKEN", SIGN_IN_STATES.invalidBody);
  }
  if (typeof decoded.email !== "string" || !decoded.email.includes("@") || decoded.email_verified !== true) {
    return deny("unverified", 401, "UNVERIFIED_EMAIL", SIGN_IN_STATES.unverifiedBody);
  }
  const authAge = Math.floor(Date.now() / 1000) - Number(decoded.auth_time);
  if (!Number.isFinite(authAge) || authAge > MAX_SIGN_IN_AGE_SECONDS) {
    return deny("stale_auth", 401, "STALE_SIGN_IN", SIGN_IN_STATES.staleAuthBody);
  }

  const email = decoded.email.trim().toLowerCase();
  const role = roleFor(email);
  const name = typeof decoded.name === "string" ? decoded.name.slice(0, MAX_NAME_LENGTH) : "";
  const redirectTo = (returnTo !== null && safeReturnTo(returnTo, siteOrigin())) || WELCOME;

  const res = NextResponse.json({ success: true, data: { role, redirectTo }, message: "Signed in", errors: [] }, { headers: NO_STORE });
  res.cookies.set(sessionCookieName(), await createSessionCookie({ email, name, role }), sessionCookieOptions());
  res.cookies.set(LEGACY_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  await audit({ event: "sign_in", actorEmail: email, actorRole: role, outcome: "ok" });
  return res;
}

export const POST = withRequestLog("/api/session", handle);
