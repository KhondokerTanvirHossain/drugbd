import "server-only";
import { initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

let app: App | null = null;

/** The Firebase project the ID tokens must belong to, or null when sign-in is not configured. */
export function firebaseProjectId(): string | null {
  return process.env.FIREBASE_PROJECT_ID || null;
}

/**
 * Verifies a Firebase ID token (signature against Google's public keys, issuer/audience = the project, expiry).
 * The app is initialized from the project ID only, with no service account (plan: Architecture). Without a
 * credential firebase-admin cannot call the revocation check (`checkRevoked` needs getUser()), so it is off; the
 * session route instead accepts only tokens from a sign-in within the last few minutes.
 */
export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<DecodedIdToken> {
  app ??= initializeApp({ projectId }, "intellidrugs-session");
  return getAuth(app).verifyIdToken(idToken, false);
}
