import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));

import * as route from "@/app/signout/route";

const PHARMACIST = { email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" };
const signOut = ({ origin = "http://localhost:3000", form = {} }: { origin?: string | null; form?: Record<string, string> } = {}) =>
  route.POST(new Request("http://localhost:3000/signout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin === null ? {} : { origin }) },
    body: new URLSearchParams(form),
  }));
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  getSession.mockReset().mockResolvedValue(PHARMACIST);
  recordAudit.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /signout (§9.6)", () => {
  it.each([null, "https://evil.example", "null", "https://localhost:3000", "http://localhost:3001"])(
    "refuses Origin %j with 403 and changes nothing", async (origin) => {
      const res = await signOut({ origin });
      expect(res.status).toBe(403);
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(recordAudit).not.toHaveBeenCalled();
    });

  it("clears both cookies, sends Clear-Site-Data: \"storage\", audits sign_out and answers 303 to /", async () => {
    const res = await signOut();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("clear-site-data")).toBe('"storage"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(cookieOf(res, "intellidrugs_session")).toMatch(/^intellidrugs_session=;.*Max-Age=0/);
    expect(cookieOf(res, "intellidrugs_session")).toMatch(/HttpOnly/i);
    expect(cookieOf(res, "bddrug_session")).toMatch(/Max-Age=0/);
    expect(recordAudit).toHaveBeenCalledWith({ event: "sign_out", actorEmail: "pharm@example.org", actorRole: "pharmacist", outcome: "ok" });
  });

  it("goes to /signin?returnTo=… for 'Use another Google account' when the path is safe", async () => {
    expect((await signOut({ form: { returnTo: "/review/0001-pilot" } })).headers.get("location"))
      .toBe("/signin?returnTo=%2Freview%2F0001-pilot");
    expect((await signOut({ form: { returnTo: "/\\evil.com" } })).headers.get("location")).toBe("/");
    expect((await signOut({ form: { returnTo: "//evil.com" } })).headers.get("location")).toBe("/");
  });

  it("writes no audit event when there was no session", async () => {
    getSession.mockResolvedValue(null);
    expect((await signOut()).status).toBe(303);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("still signs out when the audit write fails (Review Focus 5)", async () => {
    recordAudit.mockRejectedValue(new Error("audit API down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await signOut();
    expect(res.status).toBe(303);
    expect(cookieOf(res, "intellidrugs_session")).toMatch(/Max-Age=0/);
    expect(error.mock.calls.flat().map(String).join(" ")).not.toContain("pharm@");
    error.mockRestore();
  });

  it("in production checks Origin against https://SITE_HOST and clears the __Host- cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org");
    expect((await signOut({ origin: "http://localhost:3000" })).status).toBe(403);
    const res = await signOut({ origin: "https://drugdb.eliooo.org" });
    expect(res.status).toBe(303);
    expect(cookieOf(res, "__Host-intellidrugs_session")).toMatch(/Secure/i);
  });

  it("answers POST only", () => {
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });
});
