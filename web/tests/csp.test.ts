import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_PROXY_CSP, buildCsp, newNonce } from "../lib/csp";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

const directives = (csp: string) => new Map(csp.split(";").map((d) => d.trim()).filter(Boolean)
  .map((d) => { const [name, ...values] = d.split(/\s+/); return [name, values] as const; }));

describe("buildCsp (§9.4)", () => {
  it("is exactly the §9.4 policy, with the nonce and 'strict-dynamic' and without 'unsafe-inline' for scripts", () => {
    const d = directives(buildCsp({ nonce: "abc123==", authDomain: "intellidrugs-kb.firebaseapp.com", siteHostname: "drugdb.eliooo.org" }));
    expect([...d.keys()]).toEqual(["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "frame-src",
      "frame-ancestors", "base-uri", "form-action", "object-src"]);
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("script-src")).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'", "https://challenges.cloudflare.com",
      "https://apis.google.com", "https://www.gstatic.com"]);
    expect(d.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d.get("img-src")).toEqual(["'self'", "data:"]);
    expect(d.get("font-src")).toEqual(["'self'"]);
    expect(d.get("connect-src")).toEqual(["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]);
    expect(d.get("frame-src")).toEqual(["'self'", "https://challenges.cloudflare.com", "https://intellidrugs-kb.firebaseapp.com"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'none'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
  });

  it("leaves the auth domain out of frame-src when it is the site itself, missing, or not a plain host", () => {
    for (const authDomain of ["drugdb.eliooo.org", undefined, "", "evil.com; script-src *", "https://x.firebaseapp.com", "*"]) {
      const csp = buildCsp({ nonce: "n", authDomain, siteHostname: "drugdb.eliooo.org" });
      expect(directives(csp).get("frame-src")).toEqual(["'self'", "https://challenges.cloudflare.com"]);
      expect(csp).not.toContain("evil");
    }
  });

  it("makes a fresh 128-bit base64 nonce each time", () => {
    const a = newNonce(), b = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});

describe("next.config (§9.4, §9.5)", () => {
  const load = async () => (await import("../next.config")).default;

  it("has no static CSP; X-Frame-Options DENY everywhere except /__/auth", async () => {
    const [app, auth] = await (await load()).headers!();
    expect(app.source).toBe("/((?!__/auth/).*)");
    expect(Object.fromEntries(app.headers.map((h) => [h.key, h.value]))).toEqual({
      "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
    });
    expect(auth.source).toBe("/__/auth/:path*");
    expect(Object.fromEntries(auth.headers.map((h) => [h.key, h.value]))).toEqual({
      "Content-Security-Policy": AUTH_PROXY_CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
      "X-Robots-Tag": "noindex, nofollow",
    });
  });

  it("proxies /__/auth to the Firebase project's handler (Firebase's proxy option)", async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "intellidrugs-kb");
    expect(await (await load()).rewrites!()).toEqual([
      { source: "/__/auth/:path*", destination: "https://intellidrugs-kb.firebaseapp.com/__/auth/:path*" }]);
  });

  it("adds no rewrite without a valid project id", async () => {
    for (const id of ["", "Bad_Project", "x.evil.com/"]) {
      vi.stubEnv("FIREBASE_PROJECT_ID", id);
      vi.resetModules();
      expect(await (await load()).rewrites!()).toEqual([]);
    }
  });
});
