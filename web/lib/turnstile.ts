import "server-only";
import { isE2e, siteHostname } from "./site";
import type { TurnstileAction } from "./turnstile-actions";

/** Cloudflare's documented test keys. Refused in production unless INTELLIDRUGS_E2E=1 (§9.2, §11.4). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SITE_KEYS = ["1x00000000000000000000AA", "2x00000000000000000000AB", "1x00000000000000000000BB",
  "2x00000000000000000000BB", "3x00000000000000000000FF"] as const;
export const TURNSTILE_TEST_SECRETS = ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA"] as const;
/** The hidden form field the widget fills in. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const isProduction = () => process.env.NODE_ENV === "production";
const isTestSiteKey = (k: string) => (TURNSTILE_TEST_SITE_KEYS as readonly string[]).includes(k);
const isTestSecret = (s: string) => (TURNSTILE_TEST_SECRETS as readonly string[]).includes(s);

/** The public site key to render, or null when Turnstile is not configured (or a test key reaches production). */
export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  if (!key || (isProduction() && isTestSiteKey(key) && !isE2e())) return null;
  return key;
}

/**
 * Verifies a Turnstile token server-side. Fails closed. A reply counts only when `success` is true, `action`
 * equals the expected action and `hostname` equals SITE_HOST (without port). The single exception is
 * INTELLIDRUGS_E2E=1 with one of Cloudflare's test secrets, whose replies carry a fixed hostname and no action
 * (checked against the live answer in P1A): then only `success` is checked.
 */
export async function verifyTurnstile(token: unknown, ip: string | null | undefined, action: TurnstileAction): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (!secret) return false;
  const e2eTestKey = isTestSecret(secret) && isE2e();
  if (isTestSecret(secret) && isProduction() && !e2eTestKey) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  let result: { success?: unknown; action?: unknown; hostname?: unknown };
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    result = await res.json();
  } catch {
    return false;
  }
  if (result?.success !== true) return false;
  if (e2eTestKey) return true;
  return result.action === action && result.hostname === siteHostname();
}
