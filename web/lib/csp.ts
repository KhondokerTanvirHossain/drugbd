/** A Firebase auth domain must be a plain host name; anything else is left out of the CSP. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * The Content-Security-Policy, extended only as far as Google sign-in and Turnstile need (Global Constraints).
 * `authDomain` is NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: Firebase's sign-in popup helper is framed from it.
 */
export function buildCsp(authDomain: string | undefined): string {
  const frames = [authDomain && HOST.test(authDomain) ? `https://${authDomain}` : null, "https://challenges.cloudflare.com"]
    .filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    `frame-src ${frames}`,
    "frame-ancestors 'none'",
  ].join("; ");
}
