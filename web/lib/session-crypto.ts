/*
 * Session cookie crypto (§9.6). No "server-only" import: the middleware and the e2e session fixture use it too.
 * It must never be imported from a client file (the island check refuses @/lib/session; this module reads
 * SESSION_SECRET, which check-client-bundle.mjs would catch in a client chunk).
 */
import { hkdfSync } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const LEGACY_SESSION_COOKIE = "bddrug_session";
const MIN_SECRET_LENGTH = 32;
const INFO = "intellidrugs-session-v1";

export type SessionClaims = { email: string; name: string; role: string };

/** `__Host-` in production (HttpOnly, Secure, Path=/, no Domain); a plain name in development. */
export function sessionCookieName(production = process.env.NODE_ENV === "production"): string {
  return production ? "__Host-intellidrugs_session" : "intellidrugs_session";
}

/** HKDF-SHA256(SESSION_SECRET, info intellidrugs-session-v1) → 32 bytes. Throws when the secret is too short. */
export function sessionKey(secret: string = process.env.SESSION_SECRET ?? ""): Uint8Array {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters (generate one with: openssl rand -hex 32)`);
  }
  return new Uint8Array(hkdfSync("sha256", secret, new Uint8Array(0), INFO, 32));
}

export async function encryptSession(c: SessionClaims, secret?: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = sessionKey(secret);
  return new EncryptJWT({ email: c.email, name: c.name, role: c.role })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + SESSION_TTL_SECONDS)
    .encrypt(key);
}

/** The claims, or null for a forged, tampered, expired, foreign-key or malformed token. */
export async function decryptSession(token: string, secret?: string): Promise<SessionClaims | null> {
  const key = sessionKey(secret);
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtDecrypt(token, key, {
      keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"], requiredClaims: ["exp", "iat"],
    }));
  } catch {
    return null;
  }
  const { email, name, role } = payload;
  if (typeof email !== "string" || !email.includes("@") || typeof role !== "string") return null;
  return { email, name: typeof name === "string" ? name : "", role };
}
