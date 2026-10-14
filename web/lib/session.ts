import "server-only";
import { cookies } from "next/headers";
import { ROLES, roleFor, type Role } from "./reviewers";
import { SESSION_TTL_SECONDS, decryptSession, encryptSession, sessionCookieName, sessionKey } from "./session-crypto";

export { LEGACY_SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieName } from "./session-crypto";

/** `name` is the Google display name (shown to its owner only, in the account menu). */
export type Session = { email: string; role: Role; name?: string };

/** Throws when SESSION_SECRET is unset or shorter than 32 characters. The message never contains the secret. */
export function assertSessionSecret(): void {
  sessionKey();
}

/** The encrypted session JWT (JWE dir + A256GCM, `{email, name, role}`, 8 h). */
export async function createSessionCookie(session: Session): Promise<string> {
  return encryptSession({ email: session.email, name: session.name ?? "", role: session.role });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/**
 * Decrypts a session JWE. Null when it is forged, tampered, expired or malformed. The role is re-checked against
 * the current REVIEWERS list: it can drop to `user`, never rise.
 */
export async function verifySessionToken(token: string): Promise<Session | null> {
  const claims = await decryptSession(token);
  if (!claims || !(ROLES as readonly string[]).includes(claims.role)) return null;
  const role = claims.role as Role;
  const effective: Role = role !== "user" && roleFor(claims.email) === role ? role : "user";
  return { email: claims.email, name: claims.name, role: effective };
}

/** The visitor's session from the IntelliDrugs session cookie, or null. The old bddrug_session cookie is ignored. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
