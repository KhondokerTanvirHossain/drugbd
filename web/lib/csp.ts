/** A Firebase auth domain must be a plain host name; anything else is left out of the CSP. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** The /__/auth proxy's whole policy (§9.5): our pages frame Firebase's handler; it runs Firebase's scripts. */
export const AUTH_PROXY_CSP = "frame-ancestors 'self'";

/**
 * §9.4 policy, built per request in the middleware. Under 'strict-dynamic' the host list is ignored by modern
 * browsers and kept as the fallback. frame-src lists the Firebase auth domain only when it is not the site itself,
 * so an image built with <project>.firebaseapp.com still signs in with the popup.
 */
export function buildCsp({ nonce, authDomain, siteHostname }: { nonce: string; authDomain?: string; siteHostname: string }): string {
  const authFrame = authDomain && HOST.test(authDomain) && authDomain.toLowerCase() !== siteHostname.toLowerCase()
    ? ` https://${authDomain}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://apis.google.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    `frame-src 'self' https://challenges.cloudflare.com${authFrame}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** 128 random bits, base64. */
export function newNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}
