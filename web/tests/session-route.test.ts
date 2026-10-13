import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn((_options: unknown, _name?: string) => ({ name: "bddrug" }));
const verifyIdToken = vi.fn();
const getAuth = vi.fn((_app: unknown) => ({ verifyIdToken }));
vi.mock("firebase-admin/app", () => ({ initializeApp: (o: unknown, n?: string) => initializeApp(o, n) }));
vi.mock("firebase-admin/auth", () => ({ getAuth: (a: unknown) => getAuth(a) }));

import { DELETE, POST } from "@/app/api/session/route";
import { config as middlewareConfig } from "@/middleware";
import { verifySessionToken } from "@/lib/session";

const nowS = () => Math.floor(Date.now() / 1000);
const decoded = (over: Record<string, unknown> = {}) => ({
  uid: "u1", email: "Pharm@Example.org", email_verified: true, auth_time: nowS() - 10, ...over });
const post = (body: unknown) => POST(new Request("http://localhost/api/session", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body) }));
const sessionCookie = (res: Response) => res.headers.getSetCookie().find((c) => /^(__Host-)?intellidrugs_session=/.test(c));
const jwtOf = (cookie: string) => cookie.split(";")[0].replace(/^[^=]*=/, "");

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  vi.stubEnv("FIREBASE_PROJECT_ID", "bddrug-test");
  vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist,eng@example.org:engineer");
  verifyIdToken.mockReset();
  verifyIdToken.mockResolvedValue(decoded());
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/session", () => {
  it("verifies the ID token with firebase-admin initialized from the project ID only", async () => {
    const res = await post({ idToken: "tok" });
    expect(res.status).toBe(200);
    expect(initializeApp).toHaveBeenCalledWith({ projectId: "bddrug-test" }, expect.any(String));
    expect(verifyIdToken.mock.calls[0][0]).toBe("tok");
  });

  it("sets an httpOnly, SameSite=Lax, 8 h session cookie with the mapped role", async () => {
    const res = await post({ idToken: "tok" });
    const cookie = sessionCookie(res)!;
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=lax/i);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=28800/);
    expect(cookie).not.toMatch(/; Secure/i);
    expect(await verifySessionToken(jwtOf(cookie))).toMatchObject({ email: "pharm@example.org", role: "pharmacist" });
    expect(await res.json()).toEqual({ success: true, data: { role: "pharmacist" }, message: "Signed in", errors: [] });
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie(await post({ idToken: "tok" }))).toMatch(/; Secure/i);
  });

  it("gives role user to a verified Google account that is not on the list", async () => {
    verifyIdToken.mockResolvedValue(decoded({ email: "someone@gmail.com" }));
    const res = await post({ idToken: "tok" });
    expect(res.status).toBe(200);
    expect(await verifySessionToken(jwtOf(sessionCookie(res)!))).toMatchObject({ email: "someone@gmail.com", role: "user" });
  });

  it("maps the engineer role", async () => {
    verifyIdToken.mockResolvedValue(decoded({ email: "ENG@example.org" }));
    const res = await post({ idToken: "tok" });
    expect((await res.json()).data).toEqual({ role: "engineer" });
  });

  it("rejects an unverified email with 401 and sets no cookie", async () => {
    verifyIdToken.mockResolvedValue(decoded({ email_verified: false }));
    const res = await post({ idToken: "tok" });
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
    expect((await res.json()).success).toBe(false);
  });

  it("rejects a token without an email with 401", async () => {
    verifyIdToken.mockResolvedValue(decoded({ email: undefined }));
    const res = await post({ idToken: "tok" });
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("rejects an ID token from a sign-in older than 5 minutes with 401", async () => {
    verifyIdToken.mockResolvedValue(decoded({ auth_time: nowS() - 301 }));
    const res = await post({ idToken: "tok" });
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("rejects a token firebase-admin refuses with 401", async () => {
    verifyIdToken.mockRejectedValue(Object.assign(new Error("Firebase ID token has expired"), { code: "auth/id-token-expired" }));
    const res = await post({ idToken: "tok" });
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("returns 400 without calling firebase for a missing, empty, oversized or non-JSON body", async () => {
    for (const body of [{}, { idToken: "" }, { idToken: 7 }, { idToken: "x".repeat(8193) }, "not json"]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(sessionCookie(res)).toBeUndefined();
    }
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("refuses a non-JSON content type with 415 (a cross-site form cannot log a visitor in)", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const res = await POST(new Request("http://localhost/api/session", {
        method: "POST", headers: { "Content-Type": type }, body: JSON.stringify({ idToken: "tok" }) }));
      expect(res.status).toBe(415);
      expect(sessionCookie(res)).toBeUndefined();
    }
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 503 with a clear message when sign-in is not configured", async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    const res = await post({ idToken: "tok" });
    expect(res.status).toBe(503);
    expect((await res.json()).message).toBe("Reviewer sign-in is not configured.");
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("never returns or logs the email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = await post({ idToken: "tok" });
    expect(JSON.stringify(await ok.json())).not.toMatch(/pharm@/i);
    verifyIdToken.mockResolvedValue(decoded({ email_verified: false }));
    expect(JSON.stringify(await (await post({ idToken: "tok" })).json())).not.toMatch(/pharm@/i);
    const logged = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().map(String).join(" ");
    expect(logged).not.toMatch(/pharm@/i);
    log.mockRestore(); warn.mockRestore(); error.mockRestore();
  });
});

describe("DELETE /api/session", () => {
  it("clears the session cookie", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/^intellidrugs_session=;/);
    expect(cookie).toMatch(/Max-Age=0/);
    expect(cookie).toMatch(/; Path=\//);
  });
});

describe("rate limiting", () => {
  it("the shared middleware covers /api/session", () => {
    const matcher = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    expect(matcher.test("/api/session")).toBe(true);
    expect(matcher.test("/signin")).toBe(true);
  });
});
