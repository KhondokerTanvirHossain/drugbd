import { NextResponse, type NextRequest } from "next/server";
import { NEW_COPY, NEW_COPY_ROWS, TOO_MANY_REQUESTS } from "@/lib/copy";
import { LIMITS, type Limits } from "@/lib/limits";
import { accountKey, clientIp, secondsUntilDhakaMidnight } from "@/lib/rate-limit";
import { logRequest, routeTemplate } from "@/lib/request-log";
import { AUTH_PROXY_PREFIX, nextWithSecurityHeaders } from "@/lib/security-headers";
import { LEGACY_SESSION_COOKIE, decryptSession, sessionCookieName } from "@/lib/session-crypto";

const NO_STORE = "private, no-store";
const VERSIONS = /^\/review\/[^/]+\/versions$/;
const SIGN_IN_RATE_LIMITED = NEW_COPY[NEW_COPY_ROWS.signIn].rateLimited;

const tooMany = (retryAfter: number) => new NextResponse(TOO_MANY_REQUESTS, {
  status: 429,
  headers: { "Retry-After": String(retryAfter), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE },
});

/** The session email for per-account keys; any unreadable cookie counts as no session. Never logged. */
async function sessionEmail(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(sessionCookieName())?.value;
  if (!token) return null;
  try {
    return (await decryptSession(token))?.email ?? null;
  } catch {
    return null;
  }
}

/** Page requests count toward the daily caps; route handlers with their own limits and the auth proxy do not. */
const isPage = (request: NextRequest, path: string) =>
  (request.method === "GET" || request.method === "HEAD") && !path.startsWith("/api/") && path !== "/check/suggest"
  && !VERSIONS.test(path) && !path.startsWith(AUTH_PROXY_PREFIX);

export function createMiddleware(limits: Limits, now: () => number = Date.now) {
  const handle = async (request: NextRequest): Promise<NextResponse> => {
    const path = request.nextUrl.pathname;
    if (path === "/healthz") return NextResponse.next();       // container healthcheck: never limited

    const ip = clientIp(request.headers);
    if (!limits.perIp.allow(ip)) return tooMany(1);

    if (request.method === "POST" && path === "/api/session" && !limits.signIn.allow(ip)) {
      return NextResponse.json(
        { success: false, data: null, message: SIGN_IN_RATE_LIMITED, errors: [{ code: "RATE_LIMITED", message: SIGN_IN_RATE_LIMITED }] },
        { status: 429, headers: { "Retry-After": "60", "Cache-Control": NO_STORE } });
    }
    if (request.method === "POST" && path === "/signout" && !limits.signOut.allow(ip)) return tooMany(60);
    if (path === "/check/suggest" && !limits.suggest.allow(ip)) {
      return NextResponse.json([], { status: 429, headers: { "Retry-After": "1", "Cache-Control": NO_STORE } });
    }

    const email = await sessionEmail(request);
    const account = email ? accountKey(email) : null;
    if (VERSIONS.test(path)) {
      if (account && !limits.versions.allow(account)) return tooMany(5);
    } else if (isPage(request, path)) {
      const allowed = account ? limits.accountDaily.allow(account) : limits.anonymousDaily.allow(ip);
      if (!allowed) return tooMany(secondsUntilDhakaMidnight(now()));
    }

    const res = nextWithSecurityHeaders(request);
    if (request.cookies.has(LEGACY_SESSION_COOKIE)) res.cookies.set(LEGACY_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  return async function middleware(request: NextRequest): Promise<NextResponse> {
    const started = performance.now();
    const res = await handle(request);
    // Responses the middleware ends itself (429s; P1B's redirects) are logged here. A passed-on request
    // (x-middleware-next: 1) is logged by its route handler or server action, if at all.
    if (res.headers.get("x-middleware-next") !== "1") {
      logRequest({ route: routeTemplate(request.nextUrl.pathname), method: request.method, status: res.status,
        ms: performance.now() - started, requestId: crypto.randomUUID() });
    }
    return res;
  };
}

export const middleware = createMiddleware(LIMITS);

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
