"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Auth } from "firebase/auth";
import TurnstileField from "@/components/TurnstileField";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { SIGN_IN, SIGN_IN_STATES } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { safeReturnTo } from "@/lib/return-to";
import { navigate } from "./navigate";
import styles from "./SignInButton.module.css";

/** Public Firebase web config (not secret). */
export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };
/** sessionStorage flag set before signInWithRedirect; Clear-Site-Data on sign-out removes it with everything else. */
export const REDIRECT_FLAG = "intellidrugs-signin-redirect";
const WELCOME = "/signin?welcome=1";

type Status = "idle" | "loading" | "captcha" | "cancelled" | "blocked" | "failed" | "rejected" | "rate_limited";
/** The 401 codes of POST /api/session (Task 19) and their §1.7 bodies; anything else reads as "request failed". */
const REJECTED_BODY: Record<string, string> = {
  UNVERIFIED_EMAIL: SIGN_IN_STATES.unverifiedBody,
  STALE_SIGN_IN: SIGN_IN_STATES.staleAuthBody,
  INVALID_ID_TOKEN: SIGN_IN_STATES.invalidBody,
};

let auth: Auth | null = null;
/** Loads the Firebase SDK lazily, only once Google sign-in is actually used (§10.6). Firebase keeps nothing. */
async function firebase(config: FirebaseWebConfig) {
  const [{ getApps, initializeApp }, fb] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  if (!auth) {
    const app = getApps()[0] ?? initializeApp(config);
    auth = fb.initializeAuth(app, { persistence: fb.inMemoryPersistence, popupRedirectResolver: fb.browserPopupRedirectResolver });
  }
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return { auth, fb, provider };
}

/**
 * Island (§4.2, §6.2): Google sign-in with the bot check. The Turnstile token (action signin) is required before the
 * button works; it is single-use, so every failed exchange asks Turnstile for a fresh one.
 */
export default function SignInButton({ config, siteKey, returnTo, siteOrigin, nonce }:
    { config: FirebaseWebConfig; siteKey: string; returnTo: string | null; siteOrigin: string; nonce?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pendingIdToken = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [rejectedBody, setRejectedBody] = useState<string>(SIGN_IN_STATES.requestFailedBody);
  const [resetKey, setResetKey] = useState(0);
  const live = useRef<HTMLParagraphElement>(null);

  const onToken = useCallback((t: string | null) => { tokenRef.current = t; setToken(t); }, []);
  const freshCheck = useCallback(() => { tokenRef.current = null; setToken(null); setResetKey((k) => k + 1); }, []);

  const exchange = useCallback(async (idToken: string, turnstileToken: string) => {
    tokenRef.current = null;
    setToken(null);
    let res: Response;
    try {
      res = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ idToken, turnstileToken, returnTo }),
      });
    } catch {
      freshCheck();
      setStatus("failed");
      return;
    }
    if (res.ok) {
      navigate(safeReturnTo(returnTo, siteOrigin) ?? WELCOME);
      return;
    }
    freshCheck();
    if (res.status === 429) { setStatus("rate_limited"); return; }
    const body = await res.json().catch(() => null);
    if (res.status === 403 && body?.errors?.[0]?.code === "CAPTCHA") { setStatus("captcha"); return; }
    if (res.status === 401) {
      // The text is picked by code from our own copy, never echoed from the response.
      const code = body?.errors?.[0]?.code;
      setRejectedBody(typeof code === "string" && code in REJECTED_BODY ? REJECTED_BODY[code] : SIGN_IN_STATES.requestFailedBody);
      setStatus("rejected");
      return;
    }
    setStatus("failed");
  }, [returnTo, siteOrigin, freshCheck]);

  // Back from signInWithRedirect ("Continue in this tab"): read Google's result, then exchange it once a token exists.
  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(REDIRECT_FLAG) === "1";
      sessionStorage.removeItem(REDIRECT_FLAG);
    } catch {
      // storage blocked: there is no redirect to finish
    }
    if (!flagged) return;
    setStatus("loading");
    (async () => {
      try {
        const { auth: a, fb } = await firebase(config);
        const result = await fb.getRedirectResult(a);
        if (!result) { setStatus("cancelled"); return; }
        const idToken = await result.user.getIdToken();
        await fb.signOut(a);
        if (tokenRef.current) await exchange(idToken, tokenRef.current);
        else pendingIdToken.current = idToken;
      } catch {
        setStatus("failed");
      }
    })();
    // Runs once, on the page load that follows the redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token && pendingIdToken.current) {
      const idToken = pendingIdToken.current;
      pendingIdToken.current = null;
      void exchange(idToken, token);
    }
  }, [token, exchange]);

  async function signIn() {
    const t = tokenRef.current;
    if (!t || status === "loading") return;
    setStatus("loading");
    try {
      const { auth: a, fb, provider } = await firebase(config);
      const credential = await fb.signInWithPopup(a, provider);
      const idToken = await credential.user.getIdToken();
      await fb.signOut(a);
      await exchange(idToken, t);
    } catch (e) {
      const code = (e as { code?: unknown })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") setStatus("cancelled");
      else if (code === "auth/popup-blocked") setStatus("blocked");
      else setStatus("failed");
    }
  }

  async function continueInTab() {
    try {
      sessionStorage.setItem(REDIRECT_FLAG, "1");
    } catch {
      // storage blocked: the redirect still runs; the result is read when the flag can be set
    }
    setStatus("loading");
    try {
      const { auth: a, fb, provider } = await firebase(config);
      await fb.signInWithRedirect(a, provider);
    } catch {
      setStatus("failed");
    }
  }

  const disabled = !token || status === "loading";
  const banner =
    status === "captcha" ? (
      <Banner tone="crit" role="note" title={SIGN_IN.captchaTitle} body={SIGN_IN.captchaBody}
        action={<Button variant="tonal" size="sm" onClick={() => { setStatus("idle"); freshCheck(); }}>{SIGN_IN.retry}</Button>} />
    ) : status === "cancelled" ? (
      <Banner tone="info" role="note" title={SIGN_IN.cancelledTitle} body={SIGN_IN.cancelledBody} />
    ) : status === "blocked" ? (
      <Banner tone="warn" role="note" title={SIGN_IN.blockedTitle} body={SIGN_IN.blockedBody}
        action={<Button variant="primary" size="sm" onClick={continueInTab}>{SIGN_IN.continueInTab}</Button>} />
    ) : status === "failed" ? (
      <Banner tone="crit" role="note" title={SIGN_IN_STATES.requestFailedTitle} body={SIGN_IN_STATES.requestFailedBody} />
    ) : status === "rejected" ? (
      <Banner tone="crit" role="note" title={SIGN_IN_STATES.requestFailedTitle} body={rejectedBody} />
    ) : status === "rate_limited" ? (
      <Banner tone="warn" role="note" title={SIGN_IN_STATES.rateLimited} />
    ) : null;

  // §10.2: the page's one polite live region announces each banner's title (clear, then write after 60 ms).
  const BANNER_TITLE: Partial<Record<Status, string>> = {
    captcha: SIGN_IN.captchaTitle, cancelled: SIGN_IN.cancelledTitle, blocked: SIGN_IN.blockedTitle,
    failed: SIGN_IN_STATES.requestFailedTitle, rejected: SIGN_IN_STATES.requestFailedTitle, rate_limited: SIGN_IN_STATES.rateLimited,
  };
  const announcement = BANNER_TITLE[status];
  useEffect(() => (announcement ? announce(live.current, announcement) : undefined), [status, announcement]);

  return (
    <div className={styles.root}>
      <Button variant="primary" size="lg" aria-disabled={disabled ? "true" : undefined} busy={status === "loading"}
        busyLabel={SIGN_IN.loading} onClick={disabled ? undefined : signIn}>
        {SIGN_IN.button}
      </Button>
      {status === "loading" && <p className={styles.hint}>{SIGN_IN.loadingHint}</p>}
      <TurnstileField siteKey={siteKey} action="signin" nonce={nonce} resetKey={resetKey} onToken={onToken}
        onError={() => setStatus("captcha")} />
      <div>{banner}</div>
      <p ref={live} className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
