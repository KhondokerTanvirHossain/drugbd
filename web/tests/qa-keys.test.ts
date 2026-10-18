import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * §7.10.2, §7.10.5, §11.1 "QA keys": the create and revoke cores behind the /review/qa server actions. In order: the session
 * and its role (canUseQa), input validation, the web limiter, Turnstile (action qakey), then the API with the session's own
 * email and role. A refused request never generates a key; the key is in a `created` result and nowhere else.
 */

const getSession = vi.fn();
const allowAccountAction = vi.fn((_k: string, _e: string) => true);
const verifyTurnstile = vi.fn(async (_t: unknown, _ip: unknown, _a: string) => true);
const createQaKey = vi.fn();
const revokeQaKey = vi.fn();
const revalidatePath = vi.fn();
const logRequest = vi.fn();
const { randomBytes } = vi.hoisted(() => ({ randomBytes: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/limits", () => ({ allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) }));
vi.mock("@/lib/turnstile", () => ({ TURNSTILE_RESPONSE_FIELD: "cf-turnstile-response",
  verifyTurnstile: (t: unknown, ip: unknown, a: string) => verifyTurnstile(t, ip, a) }));
vi.mock("@/lib/api", () => ({ createQaKey: (c: unknown) => createQaKey(c), revokeQaKey: (id: number, r: unknown) => revokeQaKey(id, r) }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/request-log", () => ({ logRequest: (l: unknown) => logRequest(l) }));
vi.mock("@/lib/request-id", () => ({ requestId: async () => "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  randomBytes.mockImplementation((n: number) => real.randomBytes(n));
  return { ...real, randomBytes: (n: number) => randomBytes(n) };
});

import { generateQaKey, hashQaKey, runCreateQaKey, runRevokeQaKey } from "@/lib/qa-key-core";
import { createQaKeyAction, revokeQaKeyAction } from "@/lib/qa-key-actions";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile-actions";
import { validQaKeyName } from "@/lib/qa-key-types";

const ENG = { email: "eng@e2e.test", name: "E", role: "engineer" as const };
const ROW = { id: 7, name: "CI laptop", createdAt: "2026-10-18T09:00:00Z", expiresAt: "2027-01-16T09:00:00Z", lastUsedAt: null,
  revokedAt: null, status: "active" };
const VIEW = { id: 7, name: "CI laptop", createdAt: "2026-10-18T09:00:00Z", expiresAt: "2027-01-16T09:00:00Z", lastUsedAt: null, status: "active" };
const KEY = /^idqa_[A-Za-z0-9_-]{43}$/;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const createForm = (over: Record<string, string> = {}) => form({ name: "CI laptop", "cf-turnstile-response": "tok", ...over });
const revokeForm = (over: Record<string, string> = {}) => form({ keyId: "7", "cf-turnstile-response": "tok", ...over });

beforeEach(() => {
  for (const f of [getSession, allowAccountAction, verifyTurnstile, createQaKey, revokeQaKey, revalidatePath, logRequest]) f.mockClear();
  randomBytes.mockClear();
  getSession.mockResolvedValue(ENG);
  allowAccountAction.mockReturnValue(true);
  verifyTurnstile.mockResolvedValue(true);
  createQaKey.mockResolvedValue({ ok: true, data: ROW });
  revokeQaKey.mockResolvedValue({ ok: true, data: { ...ROW, revokedAt: "2026-10-18T10:00:00Z", status: "revoked" } });
});

describe("key format and hash (§7.10.2)", () => {
  it("idqa_ plus 43 base64url characters of 32 random bytes; the hash is the SHA-256 hex of the whole key", () => {
    const key = generateQaKey();
    expect(key).toMatch(KEY);
    expect(key).toHaveLength(48);
    expect(Buffer.from(key.slice(5), "base64url")).toHaveLength(32);
    expect(randomBytes).toHaveBeenCalledWith(32);
    expect(hashQaKey(key)).toBe(createHash("sha256").update(key, "utf8").digest("hex"));
    expect(hashQaKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(generateQaKey()).not.toBe(key);
  });

  it("the name rule: trimmed, 1 to 40 code points, no control character; Bengali allowed", () => {
    expect(validQaKeyName("  CI laptop \n")).toBe("CI laptop");
    expect(validQaKeyName("ল্যাপটপ")).toBe("ল্যাপটপ");
    expect(validQaKeyName("😀".repeat(40))).toBe("😀".repeat(40));
    for (const bad of ["", "   ", "x".repeat(41), "a\u0007b", "a\u007Fb", "a\u0085b", "a\u009Fb", 3, null])
      expect(validQaKeyName(bad)).toBeNull();
  });
});

describe("createQaKeyAction (§7.10.5)", () => {
  it("an engineer's key is created with the session's email and role, only the hash goes to the API, and the key comes back once", async () => {
    const r = await runCreateQaKey(createForm({ ownerEmail: "forged@x.org", ownerRole: "qa" }));
    expect(r.code).toBe("created");
    if (r.code !== "created") throw new Error("unreachable");
    expect(r.key).toMatch(KEY);
    expect(r.row).toEqual(VIEW);
    expect(createQaKey).toHaveBeenCalledTimes(1);
    const sent = createQaKey.mock.calls[0][0];
    expect(sent).toEqual({ ownerEmail: "eng@e2e.test", ownerRole: "engineer", name: "CI laptop", keyHash: hashQaKey(r.key),
      requestId: "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" });
    expect(JSON.stringify(sent)).not.toContain(r.key);
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "203.0.113.9", "qakey");
    expect(allowAccountAction).toHaveBeenCalledWith("qaKeyCreate", "eng@e2e.test");
    expect(revalidatePath).toHaveBeenCalledWith("/review/qa");
  });

  it("qa and senior may create; the trimmed name is sent", async () => {
    for (const role of ["qa", "senior"] as const) {
      getSession.mockResolvedValueOnce({ ...ENG, role });
      expect((await runCreateQaKey(createForm({ name: "  Cursor  " }))).code).toBe("created");
      expect(createQaKey.mock.lastCall?.[0]).toMatchObject({ ownerRole: role, name: "Cursor" });
    }
  });

  it("no session is unauthenticated; a pharmacist or a reader is forbidden; nothing is generated or called", async () => {
    getSession.mockResolvedValueOnce(null);
    expect(await runCreateQaKey(createForm())).toEqual({ code: "unauthenticated" });
    for (const role of ["pharmacist", "user"]) {
      getSession.mockResolvedValueOnce({ ...ENG, role });
      expect(await runCreateQaKey(createForm())).toEqual({ code: "forbidden" });
    }
    expect(randomBytes).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(createQaKey).not.toHaveBeenCalled();
  });

  it.each([["empty", ""], ["blank", "   "], ["41 characters", "x".repeat(41)], ["a control character", "lap\u0000top"],
    ["missing", null]])("a bad name (%s) is invalid before the limiter, the bot check or a key", async (_n, name) => {
    const fd = createForm();
    if (name === null) fd.delete("name"); else fd.set("name", name);
    expect(await runCreateQaKey(fd)).toEqual({ code: "invalid" });
    expect(allowAccountAction).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(randomBytes).not.toHaveBeenCalled();
    expect(createQaKey).not.toHaveBeenCalled();
  });

  it("the web limiter is daily_limit, then a failed bot check is captcha; neither generates a key", async () => {
    allowAccountAction.mockReturnValueOnce(false);
    expect(await runCreateQaKey(createForm())).toEqual({ code: "daily_limit" });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    verifyTurnstile.mockResolvedValueOnce(false);
    expect(await runCreateQaKey(createForm())).toEqual({ code: "captcha" });
    expect(randomBytes).not.toHaveBeenCalled();
    expect(createQaKey).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, status: 409, error: "", field: "activeKeys" }, "active_limit"],
    [{ ok: false, status: 409, error: "", field: "createdToday" }, "daily_limit"],
    [{ ok: false, status: 409, error: "", field: "keyHash" }, "failed"],
    [{ ok: false, status: 400, error: "", field: "name" }, "failed"],
    [{ ok: false, status: 0, error: "", field: null }, "failed"],
    [{ ok: false, status: 503, error: "", field: null }, "failed"],
    [{ ok: false, status: 502, error: "", field: null }, "failed"],
  ])("API answer %j is %s, with no key in the result", async (answer, code) => {
    createQaKey.mockResolvedValueOnce(answer);
    const r = await runCreateQaKey(createForm());
    expect(r).toEqual({ code });
  });

  it("a created key whose row cannot be read is still shown once (row null)", async () => {
    createQaKey.mockResolvedValueOnce({ ok: true, data: { id: "x" } });
    const r = await runCreateQaKey(createForm());
    expect(r).toMatchObject({ code: "created", row: null });
  });

  it("the action logs its name, status and duration only, never the key or the name", async () => {
    const r = await createQaKeyAction(createForm());
    expect(r.code).toBe("created");
    expect(logRequest).toHaveBeenCalledWith(expect.objectContaining({ route: "action:qa-key-create", method: "POST", status: 201,
      requestId: "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" }));
    const line = JSON.stringify(logRequest.mock.calls);
    expect(line).not.toContain("idqa_");
    expect(line).not.toContain("CI laptop");
    expect(line).not.toContain("eng@e2e.test");
  });
});

describe("revokeQaKeyAction (§7.10.5)", () => {
  it("revokes the owner's key with the session's email and role", async () => {
    const r = await runRevokeQaKey(revokeForm({ ownerEmail: "forged@x.org" }));
    expect(r).toEqual({ code: "revoked", row: { ...VIEW, status: "revoked" } });
    expect(revokeQaKey).toHaveBeenCalledWith(7, { ownerEmail: "eng@e2e.test", ownerRole: "engineer",
      requestId: "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f" });
    expect(allowAccountAction).toHaveBeenCalledWith("qaKeyRevoke", "eng@e2e.test");
    expect(verifyTurnstile).toHaveBeenCalledWith("tok", "203.0.113.9", "qakey");
    expect(revalidatePath).toHaveBeenCalledWith("/review/qa");
  });

  it("the §7.10.5 order: session, role, input, limiter, bot check", async () => {
    getSession.mockResolvedValueOnce(null);
    expect(await runRevokeQaKey(revokeForm())).toEqual({ code: "unauthenticated" });
    getSession.mockResolvedValueOnce({ ...ENG, role: "pharmacist" });
    expect(await runRevokeQaKey(revokeForm())).toEqual({ code: "forbidden" });
    for (const keyId of ["0", "x", "01", "1".repeat(19), ""])
      expect(await runRevokeQaKey(revokeForm({ keyId }))).toEqual({ code: "invalid" });
    expect(allowAccountAction).not.toHaveBeenCalled();
    allowAccountAction.mockReturnValueOnce(false);
    expect(await runRevokeQaKey(revokeForm())).toEqual({ code: "rate_limited" });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    verifyTurnstile.mockResolvedValueOnce(false);
    expect(await runRevokeQaKey(revokeForm())).toEqual({ code: "captcha" });
    expect(revokeQaKey).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, status: 409, error: "", field: "status" }, "already_revoked"],
    [{ ok: false, status: 404, error: "", field: "id" }, "not_found"],
    [{ ok: false, status: 400, error: "", field: "id" }, "invalid"],
    [{ ok: false, status: 0, error: "", field: null }, "failed"],
    [{ ok: false, status: 500, error: "", field: null }, "failed"],
  ])("API answer %j is %s", async (answer, code) => {
    revokeQaKey.mockResolvedValueOnce(answer);
    expect(await runRevokeQaKey(revokeForm())).toEqual({ code });
  });

  it("the action logs its name and status", async () => {
    await revokeQaKeyAction(revokeForm());
    expect(logRequest).toHaveBeenCalledWith(expect.objectContaining({ route: "action:qa-key-revoke", method: "POST", status: 200 }));
  });
});

describe("configuration (§7.10.5, §9.2)", () => {
  it("TURNSTILE_ACTIONS includes qakey", () => {
    expect(TURNSTILE_ACTIONS).toContain("qakey");
  });
  it("next.config.ts sets no serverActions.allowedOrigins, so Next's own origin check refuses a foreign POST", () => {
    const src = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/serverActions/);
    expect(src).not.toMatch(/allowedOrigins/);
  });
  it("the actions module exports only the two actions and no server-only import (the island imports it)", () => {
    const src = readFileSync(new URL("../lib/qa-key-actions.ts", import.meta.url), "utf8");
    expect(src.startsWith('"use server";')).toBe(true);
    expect(src).not.toMatch(/import\s+["']server-only["']/);
    expect([...src.matchAll(/^export\s+(?:async\s+)?(\w+)\s+(\w+)/gm)].map((m) => m[2])).toEqual(["createQaKeyAction", "revokeQaKeyAction"]);
  });
});
