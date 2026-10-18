import { afterEach, describe, expect, it, vi } from "vitest";
import { UNMATCHED_ROUTE, logRequest, routeTemplate, withRequestLog } from "@/lib/request-log";

const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const spyLog = () => vi.spyOn(console, "log").mockImplementation(() => {});
const lines = (log: ReturnType<typeof spyLog>) => log.mock.calls.map((c) => JSON.parse(String(c[0])));
afterEach(() => vi.restoreAllMocks());

describe("routeTemplate", () => {
  it.each([
    ["/products/186-0030-006--napa", "/products/[id]"], ["/substances/BDS-000010", "/substances/[id]"],
    ["/batches/0001-pilot", "/batches/[id]"], ["/review/0001-pilot", "/review/[batchId]"],
    ["/review/0001-pilot/N-1", "/review/[batchId]/[conceptId]"], ["/review/0001-pilot/versions", "/review/[batchId]/versions"],
    ["/review/pairs", "/review/pairs"], ["/review/substances", "/review/substances"],
    ["/review/substances/BDS-000003", "/review/substances/[bdsId]"],
    ["/review/flags", "/review/flags"], ["/__/auth/handler", "/__/auth/[...path]"], ["/", "/"], ["/api/session", "/api/session"],
    ["/partners", "/partners"], ["/partners/request", "/partners/request"], ["/flag", "/flag"], ["/privacy", "/privacy"],
    // QA (§7.9): the middleware's own 429 lines name the QA route template, never an id or a query value
    ["/api/qa/v1/batches", "/api/qa/v1/batches"], ["/api/qa/v1/batches/0001-pilot", "/api/qa/v1/batches/[batchId]"],
    ["/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa", "/api/qa/v1/batches/[batchId]/records/[conceptId]"],
    ["/api/qa/v1/records?filter=stage_warn&batch=0001-pilot", "/api/qa/v1/records"],
    ["/api/qa/v1/substances/BDS-000003/pairs", "/api/qa/v1/substances/[bdsId]/pairs"],
    ["/api/qa", "/api/qa/[[...rest]]"], ["/api/qa/v2/someone@example.org", "/api/qa/[[...rest]]"],
  ])("%s is logged as %s", (path, template) => {
    expect(routeTemplate(path)).toBe(template);
  });

  it("drops the query string and the fragment (§9.7: no /search or /check query in logs)", () => {
    expect(routeTemplate("/search?q=paracetamol")).toBe("/search");
    expect(routeTemplate("/check?ids=186-0030-006--napa&ids=X-2#flag")).toBe("/check");
  });

  it("never echoes an unknown path", () => {
    expect(routeTemplate("/someone@example.org/x")).toBe(UNMATCHED_ROUTE);
    expect(routeTemplate("/api/qax")).toBe(UNMATCHED_ROUTE);
  });
});

describe("logRequest", () => {
  it("writes one JSON line with the route, method, status, rounded duration and request id only", () => {
    const log = spyLog();
    logRequest({ route: "/search", method: "get", status: 429, ms: 1.6, requestId: RID });
    expect(lines(log)).toEqual([{ msg: "request", route: "/search", method: "GET", status: 429, ms: 2, requestId: RID }]);
  });

  it("drops a request id that is not a UUID and names an unknown method OTHER", () => {
    const log = spyLog();
    logRequest({ route: "/", method: "BREW", status: 405, ms: 0, requestId: "pharm@example.org" });
    expect(lines(log)).toEqual([{ msg: "request", route: "/", method: "OTHER", status: 405, ms: 0, requestId: null }]);
  });
});

describe("withRequestLog", () => {
  const request = () => new Request("http://localhost/api/session?who=pharm@example.org", {
    method: "POST", headers: { "x-request-id": RID, "content-type": "application/json" }, body: JSON.stringify({ idToken: "secret-token" }) });

  it("logs the handler's status with the middleware's request id, never the URL, the body or an email", async () => {
    const log = spyLog();
    const handler = withRequestLog("/api/session", async () => new Response("{}", { status: 401 }));
    expect((await handler(request())).status).toBe(401);
    expect(lines(log)).toEqual([{ msg: "request", route: "/api/session", method: "POST", status: 401, ms: expect.any(Number), requestId: RID }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/pharm@|secret-token/);
  });

  it("logs 500 when the handler throws, and rethrows", async () => {
    const log = spyLog();
    const handler = withRequestLog("/signout", async () => { throw new Error("boom"); });
    await expect(handler(request())).rejects.toThrow("boom");
    expect(lines(log)[0]).toMatchObject({ route: "/signout", status: 500 });
  });
});
