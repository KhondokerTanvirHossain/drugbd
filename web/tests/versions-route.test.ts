import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getReviewVersions = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ getReviewVersions: (b: string) => getReviewVersions(b) }));

import { GET } from "@/app/review/[batchId]/versions/route";

const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const get = (path: string) => GET(new Request(`http://localhost${path}`, { headers: { "x-request-id": RID } }));
const call = (batchId = "0001-pilot") => get(`/review/${encodeURIComponent(batchId)}/versions`);
beforeEach(() => { getSession.mockReset(); getReviewVersions.mockReset(); });

describe("GET /review/[batchId]/versions", () => {
  it("returns only the version fields, privately", async () => {
    getSession.mockResolvedValue({ email: "pharm@e2e.test", role: "pharmacist", name: "" });
    getReviewVersions.mockResolvedValue([{ conceptId: "a", extractedAt: "t", lastDecisionId: 3, displayStatus: "pending", extra: "x" }]);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual([{ conceptId: "a", extractedAt: "t", lastDecisionId: 3, displayStatus: "pending" }]);
  });

  it("401 without a session, 403 for a reader, and the API is never called", async () => {
    getSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    getSession.mockResolvedValue({ email: "reader@e2e.test", role: "user", name: "" });
    expect((await call()).status).toBe(403);
    expect(getReviewVersions).not.toHaveBeenCalled();
  });

  it("404 for an unknown batch and 502 when the API fails", async () => {
    getSession.mockResolvedValue({ email: "eng@e2e.test", role: "engineer", name: "" });
    getReviewVersions.mockResolvedValue(null);
    expect((await call("nope")).status).toBe(404);
    getReviewVersions.mockRejectedValue(new Error("API error 500"));
    expect((await call()).status).toBe(502);
  });

  it("reads the batch id from the path, decoded; a malformed encoding is a 404 with no API call", async () => {
    getSession.mockResolvedValue({ email: "eng@e2e.test", role: "engineer", name: "" });
    getReviewVersions.mockResolvedValue([]);
    await call("0001 pilot");
    expect(getReviewVersions).toHaveBeenCalledWith("0001 pilot");
    getReviewVersions.mockClear();
    expect((await get("/review/%E0%A4%A/versions")).status).toBe(404);
    expect(getReviewVersions).not.toHaveBeenCalled();
  });

  it("logs one request line with the route template and the request id, never the batch id or an email (P1A Task 25)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    getSession.mockResolvedValue(null);
    await call("0001-pilot");
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([{ msg: "request", route: "/review/[batchId]/versions",
      method: "GET", status: 401, ms: expect.any(Number), requestId: RID }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/0001-pilot|@e2e/);
    log.mockRestore();
  });
});
