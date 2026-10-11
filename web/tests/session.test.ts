import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import {
  SESSION_COOKIE, SESSION_TTL_SECONDS, assertSessionSecret, createSessionCookie, getSession, sessionCookieOptions,
  verifySessionToken,
} from "../lib/session";

const SECRET = "s".repeat(32);
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist,eng@example.org:engineer");
  cookieStore.get.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const payloadOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

describe("session cookie", () => {
  it("is named bddrug_session and lasts 8 hours", () => {
    expect(SESSION_COOKIE).toBe("bddrug_session");
    expect(SESSION_TTL_SECONDS).toBe(8 * 3600);
  });

  it("signs {email, role} with an 8 h expiry and verifies back", async () => {
    const jwt = await createSessionCookie({ email: "pharm@example.org", role: "pharmacist" });
    const p = payloadOf(jwt);
    expect(p.email).toBe("pharm@example.org");
    expect(p.role).toBe("pharmacist");
    expect(p.exp - p.iat).toBe(8 * 3600);
    expect(JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString()).alg).toBe("HS256");
    expect(await verifySessionToken(jwt)).toEqual({ email: "pharm@example.org", role: "pharmacist" });
  });

  it("returns null once the session has expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    const jwt = await createSessionCookie({ email: "pharm@example.org", role: "pharmacist" });
    vi.setSystemTime(new Date("2026-10-12T07:59:00Z"));
    expect(await verifySessionToken(jwt)).not.toBeNull();
    vi.setSystemTime(new Date("2026-10-12T08:00:01Z"));
    expect(await verifySessionToken(jwt)).toBeNull();
  });

  it("returns null for a tampered payload (role escalated)", async () => {
    const jwt = await createSessionCookie({ email: "someone@gmail.com", role: "user" });
    const [h, , s] = jwt.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payloadOf(jwt), role: "pharmacist" })).toString("base64url");
    expect(await verifySessionToken(`${h}.${forged}.${s}`)).toBeNull();
  });

  it("returns null for a token signed with another secret", async () => {
    const jwt = await new SignJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h")
      .sign(new TextEncoder().encode("x".repeat(32)));
    expect(await verifySessionToken(jwt)).toBeNull();
  });

  it("returns null for an unsigned (alg none) token", async () => {
    const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(JSON.stringify({ email: "pharm@example.org", role: "pharmacist",
      exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    expect(await verifySessionToken(`${h}.${p}.`)).toBeNull();
  });

  it("returns null for a token without an expiry", async () => {
    const jwt = await new SignJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(jwt)).toBeNull();
  });

  it("returns null for garbage and for a payload with a bad shape", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    const jwt = await new SignJWT({ email: 42, role: "pharmacist" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(jwt)).toBeNull();
    const badRole = await new SignJWT({ email: "pharm@example.org", role: "admin" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(badRole)).toBeNull();
  });

  it("drops a reviewer to user when REVIEWERS no longer gives them that role", async () => {
    const jwt = await createSessionCookie({ email: "pharm@example.org", role: "pharmacist" });
    vi.stubEnv("REVIEWERS", "eng@example.org:engineer");
    expect(await verifySessionToken(jwt)).toEqual({ email: "pharm@example.org", role: "user" });
    vi.stubEnv("REVIEWERS", "pharm@example.org:engineer");
    expect(await verifySessionToken(jwt)).toEqual({ email: "pharm@example.org", role: "user" });
  });

  it("never raises a user session to a reviewer role", async () => {
    const jwt = await createSessionCookie({ email: "pharm@example.org", role: "user" });
    expect(await verifySessionToken(jwt)).toEqual({ email: "pharm@example.org", role: "user" });
  });
});

describe("SESSION_SECRET", () => {
  it("refuses a secret shorter than 32 characters", async () => {
    vi.stubEnv("SESSION_SECRET", "s".repeat(31));
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET must be at least 32 characters/);
    await expect(createSessionCookie({ email: "a@x.org", role: "user" })).rejects.toThrow(/SESSION_SECRET/);
  });

  it("refuses an unset secret", () => {
    vi.stubEnv("SESSION_SECRET", undefined as unknown as string);
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET/);
  });

  it("never puts the secret in the error message", () => {
    vi.stubEnv("SESSION_SECRET", "short-secret-value");
    expect(() => assertSessionSecret()).toThrow(expect.objectContaining({
      message: expect.not.stringContaining("short-secret-value") }));
  });

  it("accepts a 32-character secret", () => {
    expect(() => assertSessionSecret()).not.toThrow();
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly, SameSite=Lax, Path=/ and 8 h; Secure only in production", () => {
    expect(sessionCookieOptions()).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 28800 });
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });
});

describe("getSession", () => {
  it("returns null without a cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
    expect(cookieStore.get).toHaveBeenCalledWith("bddrug_session");
  });

  it("returns the session for a valid cookie", async () => {
    const jwt = await createSessionCookie({ email: "eng@example.org", role: "engineer" });
    cookieStore.get.mockReturnValue({ name: SESSION_COOKIE, value: jwt });
    expect(await getSession()).toEqual({ email: "eng@example.org", role: "engineer" });
  });

  it("returns null for an invalid cookie", async () => {
    cookieStore.get.mockReturnValue({ name: SESSION_COOKIE, value: "forged.token.value" });
    expect(await getSession()).toBeNull();
  });
});
