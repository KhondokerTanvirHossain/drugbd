import { NextResponse } from "next/server";
import { firebaseProjectId, verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { roleFor } from "@/lib/reviewers";
import { SESSION_COOKIE, createSessionCookie, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_ID_TOKEN_LENGTH = 8192;
/** An ID token is exchanged right after the popup sign-in; older sign-ins are refused (Firebase's session guidance). */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, data: null, message, errors: [{ code, message }] }, { status });

/**
 * POST {idToken}: verifies the Firebase ID token, requires a verified email, maps the role from REVIEWERS and sets
 * the httpOnly session cookie. The email is never returned or logged. Rate limiting comes from middleware.ts.
 */
export async function POST(request: Request) {
  // A JSON body needs a CORS preflight cross-origin, so another site cannot post its own token here (login CSRF).
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return fail(415, "UNSUPPORTED_MEDIA_TYPE", "Send the token as JSON.");
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || idToken.length === 0 || idToken.length > MAX_ID_TOKEN_LENGTH) {
    return fail(400, "BAD_REQUEST", "idToken is required.");
  }
  const projectId = firebaseProjectId();
  if (!projectId) return fail(503, "SIGNIN_DISABLED", "Reviewer sign-in is not configured.");

  let decoded: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  try {
    decoded = await verifyFirebaseIdToken(idToken, projectId);
  } catch {
    return fail(401, "UNAUTHORIZED", "Sign-in could not be verified. Please try again.");
  }
  if (typeof decoded.email !== "string" || !decoded.email.includes("@") || decoded.email_verified !== true) {
    return fail(401, "UNAUTHORIZED", "Your Google account email is not verified.");
  }
  const authAge = Math.floor(Date.now() / 1000) - Number(decoded.auth_time);
  if (!Number.isFinite(authAge) || authAge > MAX_SIGN_IN_AGE_SECONDS) {
    return fail(401, "UNAUTHORIZED", "Sign-in is too old. Please sign in again.");
  }

  const email = decoded.email.trim().toLowerCase();
  const role = roleFor(email);
  const res = NextResponse.json({ success: true, data: { role }, message: "Signed in", errors: [] });
  res.cookies.set(SESSION_COOKIE, await createSessionCookie({ email, role }), sessionCookieOptions());
  return res;
}

/** DELETE: clears the session cookie (sign-out). */
export async function DELETE() {
  const res = NextResponse.json({ success: true, data: null, message: "Signed out", errors: [] });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
