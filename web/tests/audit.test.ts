import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hdrs = { current: new Headers() };
vi.mock("next/headers", () => ({ headers: async () => hdrs.current }));

import { recordAudit } from "@/lib/audit";
import { requestId } from "@/lib/request-id";

const TOKEN = "test-internal-token-0123456789abcdef";
const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  hdrs.current = new Headers({ "x-request-id": RID });
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 1 } }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("requestId", () => {
  it("is the middleware's x-request-id", async () => {
    expect(await requestId()).toBe(RID);
  });
  it("is a fresh UUID when the header is missing or not a UUID", async () => {
    hdrs.current = new Headers({ "x-request-id": "client-chosen" });
    const id = await requestId();
    expect(id).toMatch(UUID);
    hdrs.current = new Headers();
    expect(await requestId()).toMatch(UUID);
  });
});

describe("recordAudit (§5.15)", () => {
  it("posts the event to /v1/audit-events with the token and the request id; absent fields are null", async () => {
    expect(await recordAudit({ event: "sign_in", actorEmail: "pharm@example.org", actorRole: "pharmacist", outcome: "ok" })).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/audit-events");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Internal-Token"]).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ event: "sign_in", actorEmail: "pharm@example.org", actorRole: "pharmacist",
      targetType: null, targetId: null, outcome: "ok", requestId: RID });
  });

  it("never throws; on failure it logs the event, status and request id, never the email", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = { event: "sign_out" as const, actorEmail: "pharm@example.org", actorRole: "pharmacist" as const, outcome: "ok" };
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    expect(await recordAudit(e)).toBe(false);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await recordAudit(e)).toBe(false);
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    expect(await recordAudit(e)).toBe(false);
    const logged = error.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain(`audit write failed: event=sign_out status=500 requestId=${RID}`);
    expect(logged).not.toContain("pharm@");
    error.mockRestore();
  });
});
