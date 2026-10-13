import { turnstileSiteKey } from "@/lib/turnstile";
import type { TurnstileAction } from "@/lib/turnstile-actions";

/**
 * The implicit Cloudflare Turnstile widget for a server-action <form> on the legacy pages. Turnstile adds the hidden
 * `cf-turnstile-response` field; the action checks it with verifyTurnstile(token, ip, action). Under the nonce CSP
 * the script runs only with the request's nonce (§9.4).
 */
export default function Turnstile({ action, nonce }: { action: TurnstileAction; nonce?: string }) {
  const siteKey = turnstileSiteKey();
  if (!siteKey) return <p role="alert">Verification is not configured, so this action is disabled.</p>;
  return (
    <>
      <div className="cf-turnstile" data-sitekey={siteKey} data-action={action} />
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />
    </>
  );
}
