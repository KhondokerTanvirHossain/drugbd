import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { ROLES, roleFor, type Role } from "./reviewers";

export type Session = { email: string; role: Role };

export const SESSION_COOKIE = "bddrug_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

/** Throws when SESSION_SECRET is unset or shorter than 32 characters. The message never contains the secret. */
export function assertSessionSecret(): void {
  sessionKey();
}

function sessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters (generate one with: openssl rand -hex 32)`);
  }
  return new TextEncoder().encode(secret);
}

/** The signed session JWT (HS256, `{email, role}`, expires after 8 h). */
export async function createSessionCookie(session: Session): Promise<string> {
  const key = sessionKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: session.email, role: session.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(key);
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
 * Verifies a session JWT. Returns null when it is forged, tampered, expired or malformed.
 * The role is re-checked against the current REVIEWERS list: a reviewer removed from the list (or moved to another
 * role) drops to `user` at once instead of keeping the signed role for the rest of the 8 h. A role is never raised.
 */
export async function verifySessionToken(token: string): Promise<Session | null> {
  const key = sessionKey();
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, key, { algorithms: ["HS256"], requiredClaims: ["exp", "iat"] }));
  } catch {
    return null;
  }
  const { email, role } = payload;
  if (typeof email !== "string" || !email.includes("@")) return null;
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) return null;
  const effective: Role = role !== "user" && roleFor(email) === role ? (role as Role) : "user";
  return { email, role: effective };
}

/** The current visitor's session from the `bddrug_session` cookie, or null. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
