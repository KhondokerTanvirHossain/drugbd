import { hkdfSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptJWT, SignJWT } from "jose";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { LEGACY_SESSION_COOKIE, decryptSession, encryptSession, sessionCookieName, sessionKey } from "../lib/session-crypto";
import {
  SESSION_TTL_SECONDS, assertSessionSecret, createSessionCookie, getSession, sessionCookieOptions, verifySessionToken,
} from "../lib/session";

const SECRET = "s".repeat(32);
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist,eng@example.org:engineer");
  cookieStore.get.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const b64 = (s: string) => Buffer.from(s, "base64url").toString("latin1");
const FARHANA = { email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" as const };

describe("session cookie (JWE, §9.6)", () => {
  it("is __Host-intellidrugs_session in production, intellidrugs_session in development, and lasts 8 hours", () => {
    expect(sessionCookieName(true)).toBe("__Host-intellidrugs_session");
    expect(sessionCookieName(false)).toBe("intellidrugs_session");
    expect(LEGACY_SESSION_COOKIE).toBe("bddrug_session");
    expect(SESSION_TTL_SECONDS).toBe(8 * 3600);
  });

  it("derives the key with HKDF-SHA256 of SESSION_SECRET, info intellidrugs-session-v1, 32 bytes", () => {
    expect(sessionKey(SECRET)).toEqual(new Uint8Array(hkdfSync("sha256", SECRET, new Uint8Array(0), "intellidrugs-session-v1", 32)));
  });

  it("is an encrypted JWT (dir + A256GCM): five parts, and the email cannot be read from it", async () => {
    const jwe = await createSessionCookie(FARHANA);
    const parts = jwe.split(".");
    expect(parts).toHaveLength(5);
    expect(JSON.parse(b64(parts[0]))).toEqual({ alg: "dir", enc: "A256GCM", typ: "JWT" });
    expect(parts.map(b64).join(" ")).not.toContain("pharm@");
    expect(parts.map(b64).join(" ")).not.toContain("Farhana");
  });

  it("round-trips {email, name, role} with an 8 h expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    const jwe = await createSessionCookie(FARHANA);
    expect(await decryptSession(jwe)).toEqual({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    expect(await verifySessionToken(jwe)).toEqual(FARHANA);
    vi.setSystemTime(new Date("2026-10-12T07:59:00Z"));
    expect(await verifySessionToken(jwe)).not.toBeNull();
    vi.setSystemTime(new Date("2026-10-12T08:00:01Z"));
    expect(await verifySessionToken(jwe)).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const jwe = await createSessionCookie(FARHANA);
    const parts = jwe.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(await verifySessionToken(parts.join("."))).toBeNull();
  });

  it("returns null for a token encrypted under another secret (a rotated SESSION_SECRET)", async () => {
    const other = await encryptSession({ email: "pharm@example.org", name: "", role: "pharmacist" }, "x".repeat(32));
    expect(await verifySessionToken(other)).toBeNull();
  });

  it("returns null for the old HS256 bddrug_session token", async () => {
    const old = await new SignJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(old)).toBeNull();
  });

  it("returns null for garbage, a missing expiry and a bad payload shape", async () => {
    expect(await verifySessionToken("not-a-jwe")).toBeNull();
    const key = sessionKey(SECRET);
    const noExp = await new EncryptJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().encrypt(key);
    expect(await verifySessionToken(noExp)).toBeNull();
    for (const payload of [{ email: 42, role: "pharmacist" }, { email: "pharm@example.org", role: "admin" }, { email: "no-at", role: "user" }]) {
      const bad = await new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt()
        .setExpirationTime("8h").encrypt(key);
      expect(await verifySessionToken(bad)).toBeNull();
    }
  });

  it("drops a reviewer to user when REVIEWERS no longer gives them that role, and never raises a user", async () => {
    const jwe = await createSessionCookie(FARHANA);
    vi.stubEnv("REVIEWERS", "eng@example.org:engineer");
    expect((await verifySessionToken(jwe))?.role).toBe("user");
    vi.stubEnv("REVIEWERS", "pharm@example.org:engineer");
    expect((await verifySessionToken(jwe))?.role).toBe("user");
    vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist");
    const user = await createSessionCookie({ email: "pharm@example.org", role: "user" });
    expect(await verifySessionToken(user)).toEqual({ email: "pharm@example.org", name: "", role: "user" });
  });
});

describe("SESSION_SECRET", () => {
  it("refuses a secret shorter than 32 characters, without putting it in the message", async () => {
    vi.stubEnv("SESSION_SECRET", "short-secret-value");
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET must be at least 32 characters/);
    expect(() => assertSessionSecret()).toThrow(expect.objectContaining({ message: expect.not.stringContaining("short-secret-value") }));
    await expect(createSessionCookie({ email: "a@x.org", role: "user" })).rejects.toThrow(/SESSION_SECRET/);
  });
  it("refuses an unset secret and accepts 32 characters", () => {
    vi.stubEnv("SESSION_SECRET", undefined as unknown as string);
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(() => assertSessionSecret()).not.toThrow();
  });
});

describe("sessionCookieOptions", () => {
  it("is HttpOnly, SameSite=Lax, Path=/, 8 h, no Domain; Secure only in production", () => {
    expect(sessionCookieOptions()).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 28800 });
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });
});

describe("getSession", () => {
  it("reads the new cookie and ignores the old bddrug_session cookie", async () => {
    const jwe = await createSessionCookie({ email: "eng@example.org", name: "Eng", role: "engineer" });
    cookieStore.get.mockImplementation((name: string) => (name === "intellidrugs_session" ? { name, value: jwe } : undefined));
    expect(await getSession()).toEqual({ email: "eng@example.org", name: "Eng", role: "engineer" });
    cookieStore.get.mockImplementation((name: string) => (name === "bddrug_session" ? { name, value: jwe } : undefined));
    expect(await getSession()).toBeNull();
  });
});
