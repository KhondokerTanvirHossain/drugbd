"use client";
import { useEffect, useRef, useState } from "react";
import BotCheck, { type BotCheckState } from "@/components/ui/BotCheck";
import { NARROW_MEDIA } from "@/lib/narrow";
import type { TurnstileAction } from "@/lib/turnstile-actions";
import styles from "./TurnstileField.module.css";

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const narrowNow = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW_MEDIA).matches;
let loading: Promise<TurnstileApi> | null = null;
let loadingScript: HTMLScriptElement | null = null;

function loadTurnstile(nonce?: string): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  // A pending promise whose script tag has left the document can never settle (jsdom never loads external scripts, and a
  // page may swap the tag): drop it and attach to the script that is there now.
  if (loading && !loadingScript?.isConnected) { loading = null; loadingScript = null; }
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    // The no-JavaScript decision form (§5.8.6) puts Cloudflare's implicit script on the page; wait for it, never load twice.
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    const s = existing ?? document.createElement("script");
    loadingScript = s;
    // A failed load clears the shared promise and its tag, so a later retry requests the script again.
    const fail = () => { loading = null; loadingScript = null; s.remove(); reject(new Error("Turnstile did not load")); };
    const ok = () => (window.turnstile ? resolve(window.turnstile) : fail());
    if (existing) {
      existing.addEventListener("load", ok);
      existing.addEventListener("error", fail);
    } else {
      s.src = SCRIPT;
      s.async = true;
      if (nonce) s.setAttribute("nonce", nonce);
      s.onload = ok;
      s.onerror = fail;
      document.head.appendChild(s);
    }
  });
  return loading;
}

export type TurnstileFieldProps = {
  siteKey: string; action: TurnstileAction; nonce?: string; resetKey?: number;
  onToken?: (token: string | null) => void; onError?: () => void;
  /** §5.8.5: the desk uses "interaction-only" and refresh-expired "auto"; the desk shows its own BotCheck (hideStatus). */
  appearance?: "always" | "interaction-only"; refreshExpired?: "auto" | "manual"; hideStatus?: boolean;
  /**
   * §10.4: "compact" (150 px wide) where the 300 px widget would scroll the page sideways at 320 px. "auto" is compact
   * at NARROW_MEDIA and normal above it, following the media query (the signed-in public forms).
   */
  size?: "normal" | "compact" | "auto";
};

/**
 * Island (§4.2): explicit Turnstile render, reset and status. Turnstile puts the `cf-turnstile-response` field into
 * the enclosing form; `onToken` hands the same token to a fetch-based caller (sign-in).
 */
export default function TurnstileField({ siteKey, action, nonce, resetKey = 0, onToken, onError, appearance, refreshExpired, hideStatus, size }: TurnstileFieldProps) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  const [state, setState] = useState<BotCheckState>("checking");
  const [loadAttempt, setLoadAttempt] = useState(0);
  // The initial read keeps a phone from rendering the normal widget only to remove it.
  const [narrow, setNarrow] = useState(() => size === "auto" && narrowNow());
  useEffect(() => {
    if (size !== "auto" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(NARROW_MEDIA);
    setNarrow(mq.matches);
    const onChange = (e: { matches: boolean }) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [size]);
  const widgetSize = size === "auto" ? (narrow ? "compact" : undefined) : size;

  useEffect(() => {
    let cancelled = false;
    loadTurnstile(nonce).then((ts) => {
      if (cancelled || !box.current) return;
      widget.current = ts.render(box.current, {
        sitekey: siteKey,
        action,
        "response-field-name": "cf-turnstile-response",
        ...(appearance ? { appearance } : {}),
        ...(refreshExpired ? { "refresh-expired": refreshExpired } : {}),
        ...(widgetSize ? { size: widgetSize } : {}),
        callback: (token: string) => { setState("passed"); callbacks.current.onToken?.(token); },
        "error-callback": () => { setState("failed"); callbacks.current.onToken?.(null); callbacks.current.onError?.(); },
        "expired-callback": () => { setState("checking"); callbacks.current.onToken?.(null); },
      });
    }).catch(() => {
      if (cancelled) return;
      setState("failed");
      callbacks.current.onError?.();
    });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, action, nonce, appearance, refreshExpired, widgetSize, loadAttempt]);

  useEffect(() => {
    if (resetKey === 0) return;
    setState("checking");
    callbacks.current.onToken?.(null);
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    else setLoadAttempt((n) => n + 1); // no widget (the script failed to load): run the load again
  }, [resetKey]);

  return (
    <div className={styles.field}>
      <div ref={box} />
      {!hideStatus && <BotCheck state={state} />}
    </div>
  );
}
