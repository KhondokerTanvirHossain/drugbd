import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn((_options: unknown, _name?: string) => ({ name: "intellidrugs-session" }));
const verifyIdToken = vi.fn();
vi.mock("firebase-admin/app", () => ({ initializeApp: (o: unknown, n?: string) => initializeApp(o, n) }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));
const verifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (t: unknown, ip: unknown, a: unknown) => verifyTurnstile(t, ip, a) }));
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));

import * as route from "@/app/api/session/route";
import { config as middlewareConfig } from "@/middleware";
import { verifySessionToken } from "@/lib/session";

const nowS = () => Math.floor(Date.now() / 1000);
const decoded = (over: Record<string, unknown> = {}) => ({
  uid: "u1", email: "Pharm@Example.org", email_verified: true, auth_time: nowS() - 10, name: "Farhana Islam", ...over });
const post = (body: unknown, contentType = "application/json") => route.POST(new Request("http://localhost/api/session", {
  method: "POST", headers: { "Content-Type": contentType, "x-forwarded-for": "203.0.113.9" },
  body: typeof body === "string" ? body : JSON.stringify(body) }));
const signIn = (over: Record<string, unknown> = {}) => post({ idToken: "tok", turnstileToken: "ts-1", ...over });
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string) => cookie.split(";")[0].slice(cookie.indexOf("=") + 1);

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  vi.stubEnv("FIREBASE_PROJECT_ID", "intellidrugs-test");
  vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist,eng@example.org:engineer");
  verifyIdToken.mockReset().mockResolvedValue(decoded());
  verifyTurnstile.mockReset().mockResolvedValue(true);
  recordAudit.mockReset().mockResolvedValue(true);
  initializeApp.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/session", () => {
  it("checks Turnstile with action signin and the client IP before Firebase (initialized as intellidrugs-session)", async () => {
    expect((await signIn()).status).toBe(200);
    expect(verifyTurnstile).toHaveBeenCalledWith("ts-1", "203.0.113.9", "signin");
    // firebase-admin keeps one app per process, so the first sign-in of the file is the one that initializes it (§9.8).
    expect(initializeApp).toHaveBeenCalledWith({ projectId: "intellidrugs-test" }, "intellidrugs-session");
    verifyTurnstile.mockResolvedValue(false);
    verifyIdToken.mockClear();
    const res = await signIn();
    expect(res.status).toBe(403);
    expect((await res.json()).errors[0].code).toBe("CAPTCHA");
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(cookieOf(res, "intellidrugs_session")).toBeUndefined();
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "sign_in_denied", outcome: "captcha" });
  });

  it("sets the encrypted session cookie, clears the old one, and audits sign_in", async () => {
    const res = await signIn();
    const cookie = cookieOf(res, "intellidrugs_session")!;
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=lax/i);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=28800/);
    expect(cookie).not.toMatch(/; Secure/i);
    expect(cookie).not.toMatch(/; Domain=/i);
    expect(await verifySessionToken(valueOf(cookie))).toEqual({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    expect(cookieOf(res, "bddrug_session")).toMatch(/Max-Age=0/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ success: true, data: { role: "pharmacist", redirectTo: "/signin?welcome=1" },
      message: "Signed in", errors: [] });
    expect(recordAudit).toHaveBeenCalledWith({ event: "sign_in", actorEmail: "pharm@example.org", actorRole: "pharmacist", outcome: "ok" });
  });

  it("uses the __Host- cookie with Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(cookieOf(await signIn(), "__Host-intellidrugs_session")).toMatch(/; Secure/i);
  });

  it("returns a safe redirect target and never an unsafe one", async () => {
    expect((await (await signIn({ returnTo: "/review/0001-pilot?show=needs" })).json()).data.redirectTo).toBe("/review/0001-pilot?show=needs");
    expect((await (await signIn({ returnTo: "/\\evil.com" })).json()).data.redirectTo).toBe("/signin?welcome=1");
    expect((await (await signIn({ returnTo: null })).json()).data.redirectTo).toBe("/signin?welcome=1");
  });

  it("refuses a returnTo that is not a short string with 400, before Turnstile and Firebase", async () => {
    for (const returnTo of [42, ["/review"], "/" + "x".repeat(2048)]) expect((await signIn({ returnTo })).status).toBe(400);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("maps the user and engineer roles", async () => {
    verifyIdToken.mockResolvedValue(decoded({ email: "someone@gmail.com" }));
    expect((await (await signIn()).json()).data.role).toBe("user");
    verifyIdToken.mockResolvedValue(decoded({ email: "ENG@example.org" }));
    expect((await (await signIn()).json()).data.role).toBe("engineer");
  });

  it.each([
    [{ email_verified: false }, "unverified", "UNVERIFIED_EMAIL", "Your Google account email is not verified."],
    [{ email: undefined }, "unverified", "UNVERIFIED_EMAIL", "Your Google account email is not verified."],
    [{ auth_time: Math.floor(Date.now() / 1000) - 301 }, "stale_auth", "STALE_SIGN_IN", "Sign-in is too old. Please sign in again."],
  ])("refuses %j with 401, audits sign_in_denied %s with no actor, and names the reason by code", async (over, outcome, code, message) => {
    verifyIdToken.mockResolvedValue(decoded(over));
    const res = await signIn();
    expect(res.status).toBe(401);
    expect(cookieOf(res, "intellidrugs_session")).toBeUndefined();
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "sign_in_denied", outcome });
    expect(await res.json()).toMatchObject({ success: false, message, errors: [{ code, message }] });
  });

  it("refuses a token firebase-admin rejects with 401 INVALID_ID_TOKEN and audits invalid", async () => {
    verifyIdToken.mockRejectedValue(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
    const res = await signIn();
    expect(res.status).toBe(401);
    expect((await res.json()).errors[0]).toEqual({ code: "INVALID_ID_TOKEN", message: "Sign-in could not be verified. Please try again." });
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "sign_in_denied", outcome: "invalid" });
  });

  it("returns 400 or 415 for a bad body without Turnstile or Firebase", async () => {
    for (const body of [{}, { idToken: "" }, { idToken: 7 }, { idToken: "x".repeat(8193) }, "not json"]) expect((await post(body)).status).toBe(400);
    for (const type of ["text/plain", "application/x-www-form-urlencoded"]) expect((await post({ idToken: "t" }, type)).status).toBe(415);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 503 when sign-in is not configured", async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    const res = await signIn();
    expect(res.status).toBe(503);
    expect((await res.json()).errors[0].code).toBe("SIGNIN_DISABLED");
  });

  it("still signs in when the audit write fails (Review Focus 5)", async () => {
    recordAudit.mockRejectedValue(new Error("audit API down"));
    const res = await signIn();
    expect(res.status).toBe(200);
    expect(cookieOf(res, "intellidrugs_session")).toBeDefined();
  });

  it("never returns or logs the email", async () => {
    const spies = (["log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(JSON.stringify(await (await signIn()).json())).not.toMatch(/pharm@/i);
    verifyIdToken.mockResolvedValue(decoded({ email_verified: false }));
    expect(JSON.stringify(await (await signIn()).json())).not.toMatch(/pharm@/i);
    expect(spies.flatMap((s) => s.mock.calls).flat().map(String).join(" ")).not.toMatch(/pharm@/i);
    spies.forEach((s) => s.mockRestore());
  });

  it("logs one request line: /api/session, POST, the status, a duration and the request id (§9.7)", async () => {
    const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await route.POST(new Request("http://localhost/api/session", { method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": RID },
      body: JSON.stringify({ idToken: "tok", turnstileToken: "ts-1" }) }));
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { msg: "request", route: "/api/session", method: "POST", status: 200, ms: expect.any(Number), requestId: RID }]);
    log.mockRestore();
  });
});

describe("sign-out is not here", () => {
  it("DELETE /api/session is gone (Next answers 405); POST /signout is the only sign-out", () => {
    expect("DELETE" in route).toBe(false);
  });
});

describe("rate limiting", () => {
  it("the shared middleware covers /api/session and /signin", () => {
    const matcher = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    expect(matcher.test("/api/session")).toBe(true);
    expect(matcher.test("/signin")).toBe(true);
  });
});
