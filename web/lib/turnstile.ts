import "server-only";

/** Cloudflare's documented always-pass test keys: accepted only when NODE_ENV !== "production". */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
/** The hidden form field the widget fills in. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

const isProduction = () => process.env.NODE_ENV === "production";

/** The public site key to render, or null when Turnstile is not configured (or a test key reaches production). */
export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  if (!key || (isProduction() && key === TURNSTILE_TEST_SITE_KEY)) return null;
  return key;
}

/**
 * Verifies a Turnstile response token server-side. Fails closed: a missing token or secret, a test secret in
 * production, a network error, a timeout (5 s) or any non-success reply all return false.
 */
export async function verifyTurnstile(token: unknown, ip: string | null | undefined): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (!secret || (isProduction() && secret === TURNSTILE_TEST_SECRET_KEY)) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const result = await res.json();
    return result?.success === true;
  } catch {
    return false;
  }
}
