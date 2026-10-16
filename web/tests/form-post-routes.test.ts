import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The two public write forms, "Report a problem" (§6.5) and the partner request (§6.9), post natively to route
 * handlers that answer 303 to the page with the outcome and its #anchor. A full navigation, with or without JavaScript,
 * so the browser keeps the fragment and lands on the outcome (a server action's soft navigation dropped #request and
 * #flag and unmounted the focused submit button: Task 37 fix round 1).
 */
const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const verifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: (token: unknown, ip: unknown, action: unknown) => verifyTurnstile(token, ip, action),
}));
const REQ_ID = "5f0c2d1e-7a3b-4c8d-9e1f-2a3b4c5d6e7f";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9", "x-request-id": REQ_ID }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const allowAccountAction = vi.fn((_kind: string, _email: string) => true);
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()), allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) }));

import * as flagRoute from "@/app/flag/route";
import * as partnerRoute from "@/app/partners/request/route";

const WEB = join(__dirname, "..");
const READER = { email: "reader@example.org", name: "Reader", role: "user" };
const PARTNER = { organisation: "Acme Health", kind: "EMR", use: "Check a patient's medicines at the prescribing step.", volume: "Under 1,000" };
const FLAG = { targetType: "product", targetId: "P-1", message: "Wrong company name" };

const post = (handler: (r: Request) => Promise<Response>, path: string, fields: Record<string, string>,
    origin: string | null = "http://localhost:3000") =>
  handler(new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-request-id": REQ_ID, ...(origin === null ? {} : { origin }) },
    body: new URLSearchParams({ ...fields, "cf-turnstile-response": "ts-token" }),
  }));
const partner = (fields: Record<string, string> = PARTNER, origin?: string | null) => post(partnerRoute.POST, "/partners/request", fields, origin);
const flag = (over: Record<string, string> = {}, origin?: string | null) => post(flagRoute.POST, "/flag", { ...FLAG, ...over }, origin);
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token-0123456789abcdef");
  getSession.mockReset().mockResolvedValue(READER);
  verifyTurnstile.mockReset().mockResolvedValue(true);
  allowAccountAction.mockReset().mockReturnValue(true);
  fetchMock = vi.fn().mockResolvedValue(ok({ id: 1 }, 201));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST /partners/request (§6.9)", () => {
  it("answers 303 to the outcome at #request, private and uncached, after storing the request", async () => {
    const res = await partner();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/partners?partner=sent#request");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ targetType: "other", targetId: "partner-access",
      reporterEmail: "reader@example.org" });
  });

  it("maps each refusal to its outcome code at #request", async () => {
    expect((await partner({ ...PARTNER, organisation: "A" })).headers.get("location")).toBe("/partners?partner=invalid#request");
    verifyTurnstile.mockResolvedValue(false);
    expect((await partner()).headers.get("location")).toBe("/partners?partner=captcha#request");
    getSession.mockResolvedValue(null);
    expect((await partner()).headers.get("location")).toBe("/partners?partner=forbidden#request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, "https://evil.example", "null", "https://localhost:3000", "http://localhost:3001"])(
    "refuses Origin %j with 403 (CSRF) and stores nothing", async (origin) => {
      const res = await partner(PARTNER, origin);
      expect(res.status).toBe(403);
      expect(res.headers.get("location")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(verifyTurnstile).not.toHaveBeenCalled();
    });

  it("logs the outcome as action:partner and the response as its route, never a field or the email (§9.7)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await partner();
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { msg: "request", route: "action:partner", method: "POST", status: 200, ms: expect.any(Number), requestId: REQ_ID },
      { msg: "request", route: "/partners/request", method: "POST", status: 303, ms: expect.any(Number), requestId: REQ_ID }]);
    for (const l of lines) for (const v of [...Object.values(PARTNER), "reader@example.org"]) expect(l).not.toContain(v);
  });
});

describe("POST /flag (§6.5)", () => {
  it("answers 303 back to the flagged page with the outcome at #flag", async () => {
    const res = await flag();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/products/P-1?flag=sent#flag");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await flag({ targetType: "substance", targetId: "BDS-1" })).headers.get("location")).toBe("/substances/BDS-1?flag=sent#flag");
    expect((await flag({ targetType: "check", targetId: "P-1,P 2" })).headers.get("location")).toBe("/check?ids=P-1&ids=P+2&flag=sent#flag");
    getSession.mockResolvedValue(null);
    expect((await flag()).headers.get("location")).toBe("/products/P-1?flag=forbidden#flag");
  });

  it.each([null, "https://evil.example", "http://localhost:3001"])("refuses Origin %j with 403 (CSRF) and stores nothing", async (origin) => {
    const res = await flag({}, origin);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs the outcome as action:flag and the response as its route, never the message or the email (§9.7)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await flag({ message: "Wrong company for Rahim" });
    const lines = log.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines.map((l) => [l.route, l.method, l.status])).toEqual([["action:flag", "POST", 200], ["/flag", "POST", 303]]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Rahim|reader@/);
  });
});

describe("the forms post natively, and no server action is left behind them", () => {
  it("/partners and ReportProblem post to the route handlers; partnerRequestAction and flagAction are gone", () => {
    const read = (p: string) => readFileSync(join(WEB, p), "utf8");
    expect(read("app/partners/page.tsx")).toContain('<form method="post" action="/partners/request"');
    expect(read("components/public/ReportProblem.tsx")).toContain('<form method="post" action="/flag">');
    // Every export of a "use server" module is a callable endpoint: an unused one is attack surface.
    expect(existsSync(join(WEB, "lib/public-actions.ts"))).toBe(false);
    expect(read("lib/review-actions.ts")).not.toMatch(/export async function flagAction/);
  });
});
