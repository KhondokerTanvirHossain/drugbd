import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "./csp";
import { siteHostname } from "./site";

export const AUTH_PROXY_PREFIX = "/__/auth/";

/**
 * NextResponse.next() with the per-request security headers (§9.4):
 * - request headers for app code: `content-security-policy` (Next reads the nonce from it), `x-nonce`, `x-request-id`;
 * - response headers: the same CSP and `Cache-Control: private, no-store`.
 * The /__/auth proxy gets only the request id, and never the visitor's cookies: the rewrite forwards request headers
 * to <project>.firebaseapp.com, a third-party host that must not see the session token. Its header set comes from
 * next.config.ts.
 */
export function nextWithSecurityHeaders(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", crypto.randomUUID());
  headers.delete("x-nonce");
  headers.delete("content-security-policy");
  // Match the way the rewrite does: case-insensitive (caseSensitiveRoutes is false) and `:path*` allows zero segments.
  const p = request.nextUrl.pathname.toLowerCase();
  if (p === "/__/auth" || p.startsWith(AUTH_PROXY_PREFIX)) {
    headers.delete("cookie");
    return NextResponse.next({ request: { headers } });
  }

  const nonce = newNonce();
  const csp = buildCsp({ nonce, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, siteHostname: siteHostname() });
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
