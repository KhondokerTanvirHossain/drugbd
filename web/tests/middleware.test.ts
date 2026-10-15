import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLimits } from "@/lib/limits";
import { encryptSession } from "@/lib/session-crypto";
import { createMiddleware } from "@/middleware";

const SECRET = "s".repeat(32);
beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

let t = Date.UTC(2026, 9, 12, 17, 0, 0);          // 23:00 Dhaka: one hour to the daily reset
const clock = () => t;
const req = (path: string, init: { method?: string; ip?: string; cookie?: string } = {}) => new NextRequest(`http://localhost${path}`, {
  method: init.method ?? "GET",
  headers: { "x-forwarded-for": `${init.ip ?? "203.0.113.9"}, 10.0.0.1`, ...(init.cookie ? { cookie: init.cookie } : {}) },
});
const session = async (email: string, secret = SECRET) =>
  `intellidrugs_session=${await encryptSession({ email, name: "", role: "pharmacist" }, secret)}`;

describe("middleware: limits and headers (§9.3, §9.4)", () => {
  it("never limits /healthz", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 100; i++) expect((await mw(req("/healthz"))).status).toBe(200);
  });

  it("per IP: the 31st request in the same instant is 429 with Retry-After: 1", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 30; i++) expect((await mw(req("/"))).status).toBe(200);
    const res = await mw(req("/"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(await res.text()).toBe("Too many requests. Please slow down.");
  });

  it("POST /api/session: 10 per 10 minutes per IP, then the sign-in message as JSON; GET is not counted", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 10; i++) expect((await mw(req("/api/session", { method: "POST" }))).status).toBe(200);
    expect((await mw(req("/api/session"))).status).toBe(200);
    const res = await mw(req("/api/session", { method: "POST" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ success: false, data: null,
      message: "Too many sign-in attempts. Wait a few minutes and try again.",
      errors: [{ code: "RATE_LIMITED", message: "Too many sign-in attempts. Wait a few minutes and try again." }] });
    expect((await mw(req("/signout", { method: "POST" }))).status).toBe(200);        // counted separately
  });

  it("/check/suggest: 5/s burst 10 per IP, then 429 with an empty list", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 10; i++) expect((await mw(req("/check/suggest?q=na"))).status).toBe(200);
    const res = await mw(req("/check/suggest?q=na"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual([]);
  });

  it("/review/*/versions: 1 per 5 s, burst 3, per account", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const cookie = await session("pharm@example.org");
    for (let i = 0; i < 3; i++) expect((await mw(req("/review/0001-pilot/versions", { cookie }))).status).toBe(200);
    expect((await mw(req("/review/0001-pilot/versions", { cookie }))).status).toBe(429);
  });

  it("anonymous pages: daily cap per IP, Retry-After = seconds until 00:00 Dhaka", async () => {
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 3, accountDaily: 2 }), clock);
    for (let i = 0; i < 3; i++) expect((await mw(req("/search"))).status).toBe(200);
    const res = await mw(req("/search"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect((await mw(req("/search", { ip: "198.51.100.7" }))).status).toBe(200);
  });

  it("a signed-in reviewer is not blocked by the anonymous cap on the same IP (Review Focus 2)", async () => {
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 3, accountDaily: 2 }), clock);
    for (let i = 0; i < 4; i++) await mw(req("/"));
    const cookie = await session("pharm@example.org");
    expect((await mw(req("/", { cookie }))).status).toBe(200);
    expect((await mw(req("/", { cookie }))).status).toBe(200);
    expect((await mw(req("/", { cookie }))).status).toBe(429);              // per-account cap of 2
    expect((await mw(req("/", { cookie: await session("PHARM@example.org") }))).status).toBe(429); // same account
  });

  it("treats unreadable session cookies as anonymous (Review Focus 1)", async () => {
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 3, accountDaily: 100 }), clock);
    const good = await session("pharm@example.org");
    const tampered = `${good.slice(0, -3)}xyz`;
    const legacyJws = `intellidrugs_session=${await new SignJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(SECRET))}`;
    const rotated = await session("pharm@example.org", "x".repeat(32));
    for (const cookie of [tampered, legacyJws, rotated]) expect((await mw(req("/", { cookie }))).status).toBe(200);
    expect((await mw(req("/", { cookie: tampered }))).status).toBe(429);    // they all used the anonymous bucket
  });

  it("deletes the old bddrug_session cookie on the first response", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const res = await mw(req("/", { cookie: "bddrug_session=old.jwt.value" }));
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith("bddrug_session="))!;
    expect(cleared).toMatch(/^bddrug_session=;/);
    expect(cleared).toMatch(/Max-Age=0/);
    expect(cleared).toMatch(/Path=\//);
  });

  it("still sets the security headers on allowed requests", async () => {
    const res = await createMiddleware(createLimits(clock), clock)(req("/signin"));
    expect(res.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(res.headers.get("x-middleware-request-x-request-id")).toBeTruthy();
  });
});

describe("middleware request log (§5.15, §9.7)", () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("logs each response it ends itself with the route template, never the query string or the email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 1, accountDaily: 100 }), clock);
    expect((await mw(req("/search?q=warfarin", { ip: "192.0.2.50" }))).status).toBe(200);   // passed on: not logged here
    expect((await mw(req("/search?q=warfarin", { ip: "192.0.2.50" }))).status).toBe(429);
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { msg: "request", route: "/search", method: "GET", status: 429, ms: expect.any(Number), requestId: expect.stringMatching(UUID_RE) }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/warfarin|pharm@/);
    log.mockRestore();
  });
});

describe("middleware: an almost-right Learn chapter (Review Focus 4)", () => {
  // A page-level notFound() aborts Next 15's server-rendered shell (its HTML is the bare <html id="__next_error__">, with
  // chrome only after hydration), so the middleware sends these paths to Next's own /_not-found page, rendered on the
  // server inside the root layout. The layout still sees the original path.
  it("rewrites a one-segment non-chapter path to /_not-found, with the security headers and the original x-pathname", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (const path of ["/learn/Start", "/learn/START", "/learn/start%20", "/learn/start.html", "/learn/nope"]) {
      const res = await mw(req(path));
      expect(new URL(res.headers.get("x-middleware-rewrite")!).pathname, path).toBe("/_not-found");
      expect(res.headers.get("content-security-policy"), path).toContain("nonce-");
      expect(res.headers.get("x-middleware-request-x-pathname"), path).toBe(path);
    }
  });

  it("passes the ten chapters and an encoded chapter slug through unchanged", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (const path of ["/learn/start", "/learn/faq", "/learn/st%61rt", "/learn/glossary/extra"]) {
      const res = await mw(req(path));
      expect(res.headers.get("x-middleware-rewrite"), path).toBeNull();
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
  });
});
