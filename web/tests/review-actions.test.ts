import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
const verifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: (token: unknown, ip: unknown, action: unknown) => verifyTurnstile(token, ip, action),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1",
  "x-request-id": "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" }) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
const allowAccountAction = vi.fn((_kind: string, _email: string) => true);
vi.mock("@/lib/limits", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/limits")>();
  return { ...real, allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) };
});

import { submitFlag, submitResolve } from "@/lib/actions-core";
import { flagAction, resolveFlagAction } from "@/lib/review-actions";

const TOKEN = "test-internal-token-0123456789abcdef";
const PHARMACIST = { email: "pharm@example.org", role: "pharmacist" };
const ENGINEER = { email: "eng@example.org", role: "engineer" };
const USER = { email: "someone@gmail.com", role: "user" };
const REQ_ID = "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f";   // the x-request-id in the next/headers mock above

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const flag = (over: Record<string, string> = {}) => form({ targetType: "product", targetId: "P-1",
  message: "Wrong company name", "cf-turnstile-response": "ts-token", ...over });
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const redirectTarget = (e: unknown) => String((e as { digest?: string }).digest).split(";")[2];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  getSession.mockReset();
  verifyTurnstile.mockReset();
  verifyTurnstile.mockResolvedValue(true);
  revalidatePath.mockReset();
  allowAccountAction.mockReset(); allowAccountAction.mockReturnValue(true);
  fetchMock = vi.fn().mockResolvedValue(ok({ review: "ok", batchStatus: "approved" }, 201));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("submitFlag (flag a problem server action)", () => {
  it("rejects a visitor without a session with 403 and makes no API call", async () => {
    getSession.mockResolvedValue(null);
    expect(await submitFlag(flag())).toMatchObject({ status: 403, code: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets any signed-in user (role user) flag, with the session's email", async () => {
    getSession.mockResolvedValue(USER);
    fetchMock.mockResolvedValue(ok({ id: 1 }, 201));
    expect(await submitFlag(flag())).toMatchObject({ status: 200, code: "sent" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags");
    expect(new Headers(init.headers).get("X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ targetType: "product", targetId: "P-1", message: "Wrong company name",
      reporterEmail: "someone@gmail.com", requestId: REQ_ID });
  });

  it("validates the message length (5-2000 characters after trimming) before any API call", async () => {
    getSession.mockResolvedValue(USER);
    for (const message of ["", "abcd", "   abcd   ", "x".repeat(2001)])
      expect(await submitFlag(flag({ message }))).toMatchObject({ status: 400, code: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(ok({ id: 1 }, 201));
    expect(await submitFlag(flag({ message: "abcde" }))).toMatchObject({ code: "sent" });
    expect(await submitFlag(flag({ message: "x".repeat(2000) }))).toMatchObject({ code: "sent" });
  });

  it("accepts only product, substance and check targets", async () => {
    getSession.mockResolvedValue(USER);
    expect(await submitFlag(flag({ targetType: "batch" }))).toMatchObject({ status: 400 });
    expect(await submitFlag(flag({ targetId: "" }))).toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a failed Turnstile check with 403 and makes no API call", async () => {
    getSession.mockResolvedValue(USER);
    verifyTurnstile.mockResolvedValue(false);
    expect(await submitFlag(flag())).toMatchObject({ status: 403, code: "captcha" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flagAction redirects back to the flagged page with the outcome", async () => {
    getSession.mockResolvedValue(null);
    await expect(flagAction(flag({ targetType: "substance", targetId: "BDS-1" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/substances/BDS-1?flag=forbidden#flag");
    getSession.mockResolvedValue(USER);
    fetchMock.mockResolvedValue(ok({ id: 1 }, 201));
    await expect(flagAction(flag())).rejects.toSatisfy((e) => redirectTarget(e) === "/products/P-1?flag=sent#flag");
    await expect(flagAction(flag({ targetType: "check", targetId: "P-1,P 2" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/check?ids=P-1&ids=P+2&flag=sent#flag");
  });
});

describe("submitResolve (resolve flag server action)", () => {
  it("rejects role user and anonymous visitors with 403 and makes no API call", async () => {
    for (const s of [null, USER]) {
      getSession.mockResolvedValue(s);
      expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" }))).toMatchObject({ status: 403 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a failed Turnstile check and a bad id with no API call", async () => {
    getSession.mockResolvedValue(ENGINEER);
    expect(await submitResolve(form({ flagId: "abc", "cf-turnstile-response": "t" }))).toMatchObject({ status: 400 });
    verifyTurnstile.mockResolvedValue(false);
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" }))).toMatchObject({ status: 403, code: "captcha" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a reviewer resolves with the token, the session's email and the web request id, then revalidates /review/flags", async () => {
    getSession.mockResolvedValue(ENGINEER);
    fetchMock.mockResolvedValue(ok({ id: 3, status: "resolved" }));
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" })))
      .toMatchObject({ status: 200, code: "resolved" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags/3/resolve");
    expect(new Headers(init.headers).get("X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ resolvedBy: "eng@example.org", requestId: REQ_ID });
    expect(revalidatePath).toHaveBeenCalledWith("/review/flags");
  });

  it("a request id in the form is ignored; the audit row carries the web request id (§5.15)", async () => {
    getSession.mockResolvedValue(ENGINEER);
    fetchMock.mockResolvedValue(ok({ id: 3, status: "resolved" }));
    await submitResolve(form({ flagId: "3", requestId: "'; drop table flags; --", "cf-turnstile-response": "t" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ resolvedBy: "eng@example.org", requestId: REQ_ID });
    getSession.mockResolvedValue(USER);
    fetchMock.mockResolvedValue(ok({ id: 9 }, 201));
    await submitFlag(flag({ requestId: "0c6f7a49-8f1b-4c62-9d0e-0a3f5a9a1b22" }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).requestId).toBe(REQ_ID);
  });

  it("maps an unknown or already-resolved flag (404/409) to invalid", async () => {
    getSession.mockResolvedValue(ENGINEER);
    fetchMock.mockImplementation(async () => new Response("{}", { status: 409 }));
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" }))).toMatchObject({ status: 400, code: "invalid" });
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" }))).toMatchObject({ status: 400, code: "invalid" });
  });

  it("resolveFlagAction redirects to /review/flags with the outcome and the kind", async () => {
    getSession.mockResolvedValue(USER);
    await expect(resolveFlagAction(form({ flagId: "3", kind: "partner" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/review/flags?resolve=forbidden&kind=partner");
    await expect(resolveFlagAction(form({ flagId: "3", kind: "<x>" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/review/flags?resolve=forbidden&kind=reports");
  });

  it("resolveFlagAction keeps P1A's log line: one action:resolve line with the status, never an email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    getSession.mockResolvedValue(USER);
    await resolveFlagAction(form({ flagId: "3", kind: "partner" })).catch(() => {});
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0]))).map((l) => [l.route, l.method, l.status]))
      .toEqual([["action:resolve", "POST", 403]]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("someone@");
    log.mockRestore();
  });
});

describe("per-account action limits (§9.3)", () => {
  it("over 10 flags an hour: the flag outcome is failed", async () => {
    getSession.mockResolvedValue(USER);
    allowAccountAction.mockReturnValue(false);
    expect(await submitFlag(flag())).toEqual({ status: 429, code: "failed" });
    expect(allowAccountAction).toHaveBeenCalledWith("flag", "someone@gmail.com");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Turnstile actions (§9.2)", () => {
  it("flags check action=flag and resolve checks action=resolve", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    await submitFlag(flag());
    expect(verifyTurnstile).toHaveBeenLastCalledWith("ts-token", "203.0.113.9", "flag");
    fetchMock.mockResolvedValue(ok({ id: 1, status: "resolved" }));
    await submitResolve(form({ flagId: "7", "cf-turnstile-response": "ts-token" }));
    expect(verifyTurnstile).toHaveBeenLastCalledWith("ts-token", "203.0.113.9", "resolve");
  });
});

describe("server action log line (§5.15, §9.7)", () => {
  it("logs action:flag and action:resolve with their status, never a message or an email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    getSession.mockResolvedValue(PHARMACIST);
    await flagAction(flag({ message: "Wrong company for Rahim" })).catch(() => {});
    fetchMock.mockResolvedValue(ok({ id: 1, status: "resolved" }));
    await resolveFlagAction(form({ flagId: "7", "cf-turnstile-response": "ts-token" })).catch(() => {});
    const lines = log.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines.map((l) => [l.route, l.method, typeof l.status, typeof l.ms])).toEqual([
      ["action:flag", "POST", "number", "number"], ["action:resolve", "POST", "number", "number"]]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Rahim|pharm@/);
    log.mockRestore();
  });
});
