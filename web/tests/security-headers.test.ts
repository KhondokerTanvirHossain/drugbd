import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextWithSecurityHeaders } from "@/lib/security-headers";

afterEach(() => vi.unstubAllEnvs());
const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("nextWithSecurityHeaders (§9.4)", () => {
  it("puts one nonce in the response CSP and in the request headers Next reads", () => {
    const res = nextWithSecurityHeaders(req("/signin"));
    const csp = res.headers.get("content-security-policy")!;
    const nonce = res.headers.get("x-middleware-request-x-nonce")!;
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });
  it("uses a new nonce per request", () => {
    expect(nextWithSecurityHeaders(req("/")).headers.get("x-middleware-request-x-nonce"))
      .not.toBe(nextWithSecurityHeaders(req("/")).headers.get("x-middleware-request-x-nonce"));
  });
  it("sets a server-made x-request-id, replacing any the client sent", () => {
    const id = nextWithSecurityHeaders(req("/", { "x-request-id": "client-chosen" })).headers.get("x-middleware-request-x-request-id");
    expect(id).toMatch(UUID);
  });
  it("marks every response private, no-store", () => {
    expect(nextWithSecurityHeaders(req("/products/x")).headers.get("cache-control")).toBe("private, no-store");
  });
  it("sends no app CSP and no nonce on the /__/auth proxy, but still a request id", () => {
    const res = nextWithSecurityHeaders(req("/__/auth/handler", { "x-nonce": "forged", "content-security-policy": "forged" }));
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-nonce")).toBeNull();
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-request-id")).toMatch(UUID);
  });
  it("never forwards the visitor's cookies (the session token) to the proxied Firebase host", () => {
    const res = nextWithSecurityHeaders(req("/__/auth/handler", { cookie: "__Host-intellidrugs_session=jwe; intellidrugs-theme=dark" }));
    expect(res.headers.get("x-middleware-request-cookie")).toBeNull();
    expect(res.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("cookie");
  });
  // The rewrite /__/auth/:path* matches case-insensitively and with zero segments, so the strip must too.
  it.each(["/__/auth", "/__/AUTH/handler"])("strips cookies on %s, which the case-insensitive rewrite also proxies", (path) => {
    const res = nextWithSecurityHeaders(req(path, { cookie: "__Host-intellidrugs_session=jwe; intellidrugs-theme=dark" }));
    expect(res.headers.get("x-middleware-request-cookie")).toBeNull();
    expect(res.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("cookie");
  });
  it("keeps cookies on every other path, where the app needs the session", () => {
    const res = nextWithSecurityHeaders(req("/signin", { cookie: "intellidrugs-theme=dark" }));
    expect(res.headers.get("x-middleware-request-cookie")).toBe("intellidrugs-theme=dark");
  });
});
