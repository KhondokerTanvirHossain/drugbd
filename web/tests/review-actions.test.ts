import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
const verifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: (token: unknown, ip: unknown) => verifyTurnstile(token, ip),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import { submitFlag, submitResolve, submitReview } from "@/lib/actions-core";
import { flagAction, resolveFlagAction, reviewAction } from "@/lib/review-actions";

const TOKEN = "test-internal-token-0123456789abcdef";
const PHARMACIST = { email: "pharm@example.org", role: "pharmacist" };
const ENGINEER = { email: "eng@example.org", role: "engineer" };
const USER = { email: "someone@gmail.com", role: "user" };
const REQ = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const review = (over: Record<string, string> = {}) => form({ batchId: "0001-pilot", conceptId: "N-1", decision: "ok",
  note: "", extractedAt: "2026-10-12T09:00:00Z", expectedLastDecisionId: "41", requestId: REQ,
  "cf-turnstile-response": "ts-token", ...over });
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
  fetchMock = vi.fn().mockResolvedValue(ok({ review: "ok", batchStatus: "approved" }, 201));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("submitReview (review decision server action)", () => {
  it("rejects a visitor without a session with 403 and makes no API call", async () => {
    getSession.mockResolvedValue(null);
    expect(await submitReview(review())).toMatchObject({ status: 403, code: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("rejects a signed-in user with role user with 403 and makes no API call", async () => {
    getSession.mockResolvedValue(USER);
    expect(await submitReview(review())).toMatchObject({ status: 403, code: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a failed or missing Turnstile check with 403 and makes no API call", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    verifyTurnstile.mockResolvedValue(false);
    expect(await submitReview(review())).toMatchObject({ status: 403, code: "captcha" });
    expect(await submitReview(review({ "cf-turnstile-response": "" }))).toMatchObject({ status: 403, code: "captcha" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(verifyTurnstile).toHaveBeenCalledWith("ts-token", "203.0.113.9");
  });

  it("a pharmacist's OK calls the API with the token, the session's email and role, then revalidates the page", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    expect(await submitReview(review())).toMatchObject({ status: 200, code: "saved" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/batches/0001-pilot/items/N-1/decisions");
    expect(init.method).toBe("POST");
    const h = new Headers(init.headers);
    expect(h.get("X-Internal-Token")).toBe(TOKEN);
    expect(h.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ decision: "ok", note: "", reviewerEmail: "pharm@example.org",
      reviewerRole: "pharmacist", extractedAt: "2026-10-12T09:00:00Z", expectedLastDecisionId: 41, requestId: REQ });
    expect(revalidatePath).toHaveBeenCalledWith("/batches/0001-pilot");
  });

  it("takes the reviewer's email and role from the session, never from the form", async () => {
    getSession.mockResolvedValue(ENGINEER);
    await submitReview(review({ reviewerEmail: "forged@evil.test", reviewerRole: "pharmacist", decision: "issue",
      note: "  Strength is 250 mg, not 500 mg  " }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: "issue", note: "Strength is 250 mg, not 500 mg",
      reviewerEmail: "eng@example.org", reviewerRole: "engineer", extractedAt: "2026-10-12T09:00:00Z",
      expectedLastDecisionId: 41, requestId: REQ });
  });

  it("sends extractedAt as null when the item has none, and refuses a form without the field", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    expect(await submitReview(review({ extractedAt: "" }))).toMatchObject({ status: 200 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).extractedAt).toBeNull();
    const fd = review(); fd.delete("extractedAt");
    expect(await submitReview(fd)).toMatchObject({ status: 400, code: "invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an issue without a 5-1000 character note, an unknown decision or a missing item, with no API call", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    for (const bad of [{ decision: "issue", note: "bad" }, { decision: "issue", note: "x".repeat(1001) },
      { decision: "ok", note: "x".repeat(1001) }, { decision: "approve" }, { conceptId: "" }, { batchId: "" }])
      expect(await submitReview(review(bad))).toMatchObject({ status: 400, code: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 409 from the API (record re-run since the page loaded) to stale, other failures to failed", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ message: "re-run" }] }), { status: 409 }));
    expect(await submitReview(review())).toMatchObject({ status: 409, code: "stale" });
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    expect(await submitReview(review())).toMatchObject({ status: 502, code: "failed" });
    expect(revalidatePath).toHaveBeenCalledTimes(1);   // only after the stale reply, which changes what the page shows
  });

  it("reviewAction redirects back to the item with the outcome code", async () => {
    getSession.mockResolvedValue(null);
    await expect(reviewAction(review())).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/batches/0001-pilot?review=forbidden&item=N-1#N-1");
    expect(fetchMock).not.toHaveBeenCalled();
    getSession.mockResolvedValue(PHARMACIST);
    await expect(reviewAction(review({ batchId: "a b/c" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/batches/a%20b%2Fc?review=saved&item=N-1#N-1");
  });

  it("sends expectedLastDecisionId as null when the item has no decision, and refuses a malformed one or requestId", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    expect(await submitReview(review({ expectedLastDecisionId: "" }))).toMatchObject({ status: 200 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedLastDecisionId).toBeNull();
    for (const bad of [{ expectedLastDecisionId: "abc" }, { expectedLastDecisionId: "0" }, { expectedLastDecisionId: "-1" },
      { expectedLastDecisionId: "1".repeat(16) }, { requestId: "" }, { requestId: "not-a-uuid" }])
      expect(await submitReview(review(bad))).toMatchObject({ status: 400, code: "invalid" });
    const noId = review(); noId.delete("expectedLastDecisionId");
    expect(await submitReview(noId)).toMatchObject({ status: 400, code: "invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a replayed decision (the same form sent again) is reported as saved", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    fetchMock.mockResolvedValue(ok({ review: "ok", displayStatus: "approved", batchStatus: "approved", replayed: true }, 200));
    expect(await submitReview(review())).toMatchObject({ status: 200, code: "saved" });
  });

  it("maps each 409 field from the API to its own outcome code", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    const cases: [string, string, string][] = [
      ["extractedAt", "This record was re-run after the page was loaded; reload it and review again", "stale"],
      ["lastDecisionId", "Another reviewer decided on this record after the page was loaded; reload it and review again", "decided"],
      ["stages", "A check failed on this record. It returns to review after the fix and re-run.", "checks"],
      ["review", "An issue is open on this record. It returns to review after the fix and re-run.", "issue_open"],
      ["review", "This record is already approved by a pharmacist", "approved"],
      ["review", "Your check is already recorded for this record", "checked"],
      ["conceptId", "This record was removed from the batch file", "removed"],
    ];
    for (const [field, message, code] of cases) {
      fetchMock.mockResolvedValueOnce(new Response(
        JSON.stringify({ success: false, errors: [{ field, code: "CONFLICT", message }] }), { status: 409 }));
      expect(await submitReview(review())).toMatchObject({ status: 409, code });
    }
  });
});

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
      reporterEmail: "someone@gmail.com" });
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

  it("a reviewer resolves with the token and the session's email, then revalidates /flags", async () => {
    getSession.mockResolvedValue(ENGINEER);
    fetchMock.mockResolvedValue(ok({ id: 3, status: "resolved" }));
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" }))).toMatchObject({ status: 200, code: "resolved" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/flags/3/resolve");
    expect(new Headers(init.headers).get("X-Internal-Token")).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ resolvedBy: "eng@example.org" });
    expect(revalidatePath).toHaveBeenCalledWith("/flags");
  });

  it("maps an unknown or already-resolved flag (404/409) to invalid", async () => {
    getSession.mockResolvedValue(ENGINEER);
    fetchMock.mockImplementation(async () => new Response("{}", { status: 409 }));
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" }))).toMatchObject({ status: 400, code: "invalid" });
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    expect(await submitResolve(form({ flagId: "3", "cf-turnstile-response": "t" }))).toMatchObject({ status: 400, code: "invalid" });
  });

  it("resolveFlagAction redirects to /flags with the outcome", async () => {
    getSession.mockResolvedValue(USER);
    await expect(resolveFlagAction(form({ flagId: "3" }))).rejects.toSatisfy((e) =>
      redirectTarget(e) === "/flags?resolve=forbidden");
  });
});
