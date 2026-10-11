"use client";
import { useState } from "react";
import type { Auth } from "firebase/auth";

/** Public Firebase web config (not secret). */
export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };

let auth: Auth | null = null;

const MESSAGES: Record<string, string> = {
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again.",
};

/**
 * The site's only client component. Google sign-in runs in a Firebase pop-up; the ID token is exchanged once at
 * /api/session for our own httpOnly cookie. Firebase keeps nothing (in-memory persistence, signed out at once).
 */
export default function SignInButton({ config }: { config: FirebaseWebConfig }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const [{ getApps, initializeApp }, fb] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      if (!auth) {
        const app = getApps()[0] ?? initializeApp(config);
        auth = fb.initializeAuth(app, { persistence: fb.inMemoryPersistence,
          popupRedirectResolver: fb.browserPopupRedirectResolver });
      }
      const provider = new fb.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await fb.signInWithPopup(auth, provider);
      const idToken = await credential.user.getIdToken();
      await fb.signOut(auth);
      const res = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.message === "string" ? body.message : "Sign-in failed. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign("/");
    } catch (e) {
      const code = (e as { code?: unknown })?.code;
      setError((typeof code === "string" && MESSAGES[code]) || "Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={signIn} disabled={busy}>{busy ? "Signing in…" : "Sign in with Google"}</button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
