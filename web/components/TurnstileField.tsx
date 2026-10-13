"use client";
import { useEffect, useRef, useState } from "react";
import BotCheck, { type BotCheckState } from "@/components/ui/BotCheck";
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
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(nonce?: string): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    if (nonce) s.setAttribute("nonce", nonce);
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    s.onerror = () => { loading = null; reject(new Error("Turnstile did not load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export type TurnstileFieldProps = {
  siteKey: string; action: TurnstileAction; nonce?: string; resetKey?: number;
  onToken?: (token: string | null) => void; onError?: () => void;
};

/**
 * Island (§4.2): explicit Turnstile render, reset and status. Turnstile puts the `cf-turnstile-response` field into
 * the enclosing form; `onToken` hands the same token to a fetch-based caller (sign-in).
 */
export default function TurnstileField({ siteKey, action, nonce, resetKey = 0, onToken, onError }: TurnstileFieldProps) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  const [state, setState] = useState<BotCheckState>("checking");

  useEffect(() => {
    let cancelled = false;
    loadTurnstile(nonce).then((ts) => {
      if (cancelled || !box.current) return;
      widget.current = ts.render(box.current, {
        sitekey: siteKey,
        action,
        "response-field-name": "cf-turnstile-response",
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
  }, [siteKey, action, nonce]);

  useEffect(() => {
    if (resetKey === 0 || !widget.current || !window.turnstile) return;
    setState("checking");
    callbacks.current.onToken?.(null);
    window.turnstile.reset(widget.current);
  }, [resetKey]);

  return (
    <div className={styles.field}>
      <div ref={box} />
      <BotCheck state={state} />
    </div>
  );
}
