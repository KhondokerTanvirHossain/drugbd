import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLimits } from "@/lib/limits";
import { encryptSession } from "@/lib/session-crypto";
import { createMiddleware } from "@/middleware";

const SECRET = "s".repeat(32);
beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());
const clock = () => Date.UTC(2026, 9, 12, 6, 0, 0);
const req = (path: string, init: { method?: string; cookie?: string } = {}) => new NextRequest(`http://localhost${path}`, {
  method: init.method ?? "GET", headers: { "x-forwarded-for": "203.0.113.9", ...(init.cookie ? { cookie: init.cookie } : {}) } });

describe("middleware on the review surface", () => {
  it("308s the legacy batch and flag routes", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const res = await mw(req("/batches/0001-pilot?review=saved&item=napa"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost/review/0001-pilot/napa");
    expect((await mw(req("/flags"))).headers.get("location")).toBe("http://localhost/review/flags");
  });

  it("307s an anonymous visitor to sign-in and lets a session through", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const anon = await mw(req("/review/0001-pilot/napa?show=needs"));
    expect(anon.status).toBe(307);
    expect(anon.headers.get("location")).toBe("http://localhost/signin?returnTo=%2Freview%2F0001-pilot%2Fnapa%3Fshow%3Dneeds");
    const cookie = `intellidrugs_session=${await encryptSession({ email: "reader@e2e.test", name: "", role: "user" }, SECRET)}`;
    expect((await mw(req("/review/0001-pilot/napa", { cookie }))).status).toBe(200);
  });

  it("passes the pathname to the server components", async () => {
    const res = await createMiddleware(createLimits(clock), clock)(req("/search?q=napa"));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/search");
  });

  it("logs its redirects through P1A's wrapper: the route template and status, never the query or the item id", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mw = createMiddleware(createLimits(clock), clock);
    await mw(req("/batches/0001-pilot?item=napa"));
    await mw(req("/review/0001-pilot/napa?q=warfarin"));
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0]))).map((l) => [l.route, l.status])).toEqual([
      ["/batches/[id]", 308], ["/review/[batchId]/[conceptId]", 307]]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/napa|warfarin/);
    log.mockRestore();
  });
});
