import { turnstileSiteKey } from "@/lib/turnstile";

/**
 * The Cloudflare Turnstile widget for a server-action <form>. Turnstile adds the hidden `cf-turnstile-response`
 * field to the enclosing form; the action checks it with verifyTurnstile(). React de-duplicates the script tag.
 */
export default function Turnstile() {
  const siteKey = turnstileSiteKey();
  if (!siteKey) return <p role="alert">Verification is not configured, so this action is disabled.</p>;
  return (
    <>
      <div className="cf-turnstile" data-sitekey={siteKey} />
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
    </>
  );
}
