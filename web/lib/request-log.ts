/*
 * The web container's request log line (§5.15, §9.7): route template, method, status, duration and request id, one
 * JSON line on stdout. Never a raw path, a query string, an email, a note or any other form text. No "server-only":
 * the middleware imports it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/** Routes logged as they are. P1B and P2 add theirs. */
export const STATIC_ROUTES: readonly string[] = ["/", "/search", "/check", "/check/suggest", "/signin", "/signout",
  "/api/session", "/healthz", "/robots.txt", "/icon.svg", "/batches", "/flags", "/review", "/review/flags",
  "/review/pairs", "/review/substances", "/review/qa", "/partners", "/partners/request", "/flag", "/privacy",
  "/api/qa/v1/batches", "/api/qa/v1/records", "/api/qa/mcp"];
/** Dynamic routes: the pattern and the template logged for it, most specific first. P1B and P2 add theirs. */
export const DYNAMIC_ROUTES: readonly (readonly [RegExp, string])[] = [
  [/^\/api\/qa\/v1\/batches\/[^/]+\/records\/[^/]+$/, "/api/qa/v1/batches/[batchId]/records/[conceptId]"],
  [/^\/api\/qa\/v1\/batches\/[^/]+$/, "/api/qa/v1/batches/[batchId]"],
  [/^\/api\/qa\/v1\/substances\/[^/]+\/pairs$/, "/api/qa/v1/substances/[bdsId]/pairs"],
  [/^\/api\/qa(\/.*)?$/, "/api/qa/[[...rest]]"],
  [/^\/review\/substances\/[^/]+$/, "/review/substances/[bdsId]"],
  [/^\/products\/[^/]+$/, "/products/[id]"],
  [/^\/substances\/[^/]+$/, "/substances/[id]"],
  [/^\/batches\/[^/]+$/, "/batches/[id]"],
  [/^\/review\/[^/]+\/versions$/, "/review/[batchId]/versions"],
  [/^\/review\/[^/]+\/[^/]+$/, "/review/[batchId]/[conceptId]"],
  [/^\/review\/[^/]+$/, "/review/[batchId]"],
  [/^\/__\/auth\/.+$/, "/__/auth/[...path]"],
];
export const UNMATCHED_ROUTE = "[unmatched]";

/** The route template of a path. The query string and fragment are dropped; an unknown path is never echoed. */
export function routeTemplate(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  if (STATIC_ROUTES.includes(pathname)) return pathname;
  for (const [pattern, template] of DYNAMIC_ROUTES) if (pattern.test(pathname)) return template;
  return UNMATCHED_ROUTE;
}

export type RequestLog = { route: string; method: string; status: number; ms: number; requestId: string | null };

/** One line per response. `route` is a template from routeTemplate(), a route handler's own path, or an `action:` name. */
export function logRequest({ route, method, status, ms, requestId }: RequestLog): void {
  const m = method.toUpperCase();
  console.log(JSON.stringify({ msg: "request", route, method: METHODS.includes(m) ? m : "OTHER", status,
    ms: Math.round(ms), requestId: requestId && UUID.test(requestId) ? requestId : null }));
}

/** Wraps a route handler so each request logs one line with the request id the middleware set (§9.4). */
export function withRequestLog(route: string, handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    let status = 500;
    try {
      const res = await handler(request);
      status = res.status;
      return res;
    } finally {
      logRequest({ route, method: request.method, status, ms: performance.now() - started, requestId: request.headers.get("x-request-id") });
    }
  };
}
