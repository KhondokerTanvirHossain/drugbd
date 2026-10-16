"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Auth } from "firebase/auth";
import TurnstileField from "@/components/TurnstileField";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { SIGN_IN, SIGN_IN_STATES } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { SIGNIN_CARD } from "@/lib/public-copy";
import { safeReturnTo } from "@/lib/return-to";
import { navigate } from "./navigate";
import styles from "./SignInButton.module.css";

/** Public Firebase web config (not secret). */
export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };
/** sessionStorage flag set before signInWithRedirect; Clear-Site-Data on sign-out removes it with everything else. */
export const REDIRECT_FLAG = "intellidrugs-signin-redirect";
const WELCOME = "/signin?welcome=1";
/** §10.4: at 440 px and below the card leaves under 300 px for Turnstile, so the widget goes compact (150 px). */
const NARROW = "(max-width: 440px)";

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

/** Google's "G" in Google's own colours (tokens --g-*), as Board P draws it. Decorative: the button's text names it. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="var(--g-red)" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="var(--g-blue)" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="var(--g-yellow)" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="var(--g-green)" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
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
  const googleButton = useRef<HTMLButtonElement>(null);
  // The initial read keeps a phone from rendering the normal widget only to remove it (the size never reaches the markup).
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(NARROW).matches);

  // Read on mount and on change; a change re-renders the widget at the new size (TurnstileField's render effect).
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(NARROW);
    setCompact(mq.matches);
    const onChange = (e: { matches: boolean }) => setCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  // Retry check unmounts its own banner, so focus moves to Continue with Google, never to <body> (§10.1).
  // The button stays focusable while aria-disabled, until the fresh token arrives.
  function retryCheck() {
    setStatus("idle");
    freshCheck();
    googleButton.current?.focus();
  }

  const disabled = !token || status === "loading";
  const banner =
    status === "captcha" ? (
      <Banner tone="crit" role="note" title={SIGN_IN.captchaTitle} body={SIGN_IN.captchaBody}
        action={<Button variant="tonal" size="sm" onClick={retryCheck}>{SIGN_IN.retry}</Button>} />
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
      <button ref={googleButton} type="button" className={styles.gbtn} aria-disabled={disabled ? "true" : undefined}
        aria-busy={status === "loading" ? "true" : undefined} onClick={disabled ? undefined : signIn}>
        {status === "loading"
          ? <><span className="btn-spinner" aria-hidden="true" /><span>{SIGN_IN.loading}</span></>
          : <><GoogleGlyph /><span>{SIGN_IN.button}</span></>}
      </button>
      {status === "loading" && <p className={styles.hint}>{SIGN_IN.loadingHint}</p>}
      <div className={styles.turn}>
        <TurnstileField siteKey={siteKey} action="signin" nonce={nonce} resetKey={resetKey} onToken={onToken}
          onError={() => setStatus("captcha")} size={compact ? "compact" : undefined} />
        <span className={styles.turnBy}>{SIGNIN_CARD.turnstile}</span>
      </div>
      <div>{banner}</div>
      <p ref={live} className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
