import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsp } from "../lib/csp";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

const directives = (csp: string) => new Map(csp.split(";").map((d) => d.trim()).filter(Boolean)
  .map((d) => { const [name, ...values] = d.split(/\s+/); return [name, values] as const; }));

describe("buildCsp", () => {
  it("adds exactly the Google sign-in and Turnstile sources from the Global Constraints", () => {
    const d = directives(buildCsp("bddrug-kb.firebaseapp.com"));
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "https://apis.google.com",
      "https://www.gstatic.com", "https://challenges.cloudflare.com"]);
    expect(d.get("frame-src")).toEqual(["https://bddrug-kb.firebaseapp.com", "https://challenges.cloudflare.com"]);
    expect(d.get("connect-src")).toEqual(["'self'", "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com"]);
    expect(d.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d.get("img-src")).toEqual(["'self'", "data:"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect([...d.keys()].sort()).toEqual(["connect-src", "default-src", "frame-ancestors", "frame-src", "img-src",
      "script-src", "style-src"]);
  });

  it("allows only the Turnstile frame when no auth domain is configured", () => {
    expect(directives(buildCsp(undefined)).get("frame-src")).toEqual(["https://challenges.cloudflare.com"]);
    expect(directives(buildCsp("")).get("frame-src")).toEqual(["https://challenges.cloudflare.com"]);
  });

  it("ignores an auth domain that is not a plain host name", () => {
    for (const bad of ["evil.com; script-src *", "https://x.firebaseapp.com", "*", "x.com/path", "a b"]) {
      const csp = buildCsp(bad);
      expect(directives(csp).get("frame-src")).toEqual(["https://challenges.cloudflare.com"]);
      expect(csp).not.toContain("evil");
    }
  });
});

describe("next.config headers", () => {
  it("serves the CSP built from NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, with the existing security headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "bddrug-kb.firebaseapp.com");
    const config = (await import("../next.config")).default;
    const [{ source, headers }] = await config.headers!();
    expect(source).toBe("/(.*)");
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(byKey["Content-Security-Policy"]).toBe(buildCsp("bddrug-kb.firebaseapp.com"));
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(byKey["Referrer-Policy"]).toBe("same-origin");
  });
});
