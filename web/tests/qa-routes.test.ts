import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One clock for the process-wide limits, so each test starts with fresh windows (§7.9.1 60/min, §7.9.6 throttles).
const clock = vi.hoisted(() => ({ now: 1_000_000_000 }));
vi.mock("@/lib/limits", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/limits")>();
  return { ...m, LIMITS: m.createLimits(() => clock.now) };
});

import { GET as batchesGET } from "@/app/api/qa/v1/batches/route";
import { GET as batchGET } from "@/app/api/qa/v1/batches/[batchId]/route";
import { GET as recordGET } from "@/app/api/qa/v1/batches/[batchId]/records/[conceptId]/route";
import { GET as recordsGET } from "@/app/api/qa/v1/records/route";
import { GET as pairsGET } from "@/app/api/qa/v1/substances/[bdsId]/pairs/route";
import { GET as restGET } from "@/app/api/qa/[[...rest]]/route";
import { qaKeysForTests } from "@/lib/qa-api";
import { apiRecord, apiSubstance, SENTINELS } from "./fixtures/qa";

const TOKEN = "test-internal-token-0123456789abcdef";
const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const KEY = "qa-key-checker-0123456789abcdefghijklmnop", KEY2 = "qa-key-nightly-0123456789abcdefghijklmnop";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const KEYS = `checker:${sha(KEY)},nightly:${sha(KEY2)}`;

type Handler = (r: Request) => Promise<Response>;
const ROUTES: [string, Handler, string][] = [
  ["batches", batchesGET, "/api/qa/v1/batches"],
  ["batch", batchGET, "/api/qa/v1/batches/0001-pilot"],
  ["record", recordGET, "/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa"],
  ["records", recordsGET, "/api/qa/v1/records?filter=stage_warn"],
  ["pairs", pairsGET, "/api/qa/v1/substances/BDS-000003/pairs"],
];

const BATCHES = [{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 10,
  counts: { approved: 4, issue: 1, needsReview: 5, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 8 } }];
const BATCH = { batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 1,
  items: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending",
    stages: [{ stage: "dgda", status: "ok", note: "" }] }] };
const RECORDS = { filter: "stage_warn", stage: null, batch: null, page: 0, size: 100, total: 1,
  items: [{ batchId: "0001-pilot", conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending",
    stages: { dgda: "ok", substances: "ok", clinical: "ok", ddinter: "warn" } }] };

const envelope = (data: unknown) => ({ success: true, data, message: "OK", errors: [],
  metadata: { timestamp: "2026-10-18T00:00:00Z", requestId: "00000000-0000-4000-8000-000000000000" } });
const apiError = (status: number, code: string, field: string | null) => new Response(JSON.stringify({ success: false, data: null,
  message: "x", errors: [{ field, code, message: "x" }] }), { status });

/** The internal API's answers by path prefix; audit writes are recorded in `audits`. */
let upstream: (path: string) => Response | Promise<Response>;
let auditStatus: number;
let audits: Record<string, unknown>[];
let reads: { url: string; headers: Record<string, string> }[];
let fetchMock: ReturnType<typeof vi.fn>;

function defaultUpstream(path: string): Response {
  if (path === "/v1/review/batches") return new Response(JSON.stringify(envelope(BATCHES)));
  if (path.startsWith("/v1/qa/batches/")) return new Response(JSON.stringify(envelope(BATCH)));
  if (path.startsWith("/v1/review/batches/")) return new Response(JSON.stringify(envelope(apiRecord())));
  if (path.startsWith("/v1/qa/records")) return new Response(JSON.stringify(envelope(RECORDS)));
  if (path.startsWith("/v1/review/substances/")) return new Response(JSON.stringify(envelope(apiSubstance())));
  return apiError(404, "NOT_FOUND", null);
}

beforeEach(() => {
  clock.now += 3_600_000;
  qaKeysForTests.reset();
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  vi.stubEnv("QA_API_KEYS", KEYS);
  upstream = defaultUpstream;
  auditStatus = 201;
  audits = [];
  reads = [];
  fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api:8080", "");
    if (path === "/v1/audit-events" && init.method === "POST") {
      audits.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ success: true, data: { id: audits.length } }), { status: auditStatus });
    }
    reads.push({ url: path, headers: init.headers as Record<string, string> });
    return upstream(path);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const call = (handler: Handler, path: string, headers: Record<string, string> = {}) => handler(new Request(`http://localhost${path}`,
  { headers: { authorization: `Bearer ${KEY}`, "x-request-id": RID, "x-forwarded-for": "203.0.113.9", ...headers } }));
const anon = (handler: Handler, path: string, headers: Record<string, string> = {}) => handler(new Request(`http://localhost${path}`,
  { headers: { "x-request-id": RID, "x-forwarded-for": "203.0.113.9", ...headers } }));

function expectQaHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(res.headers.get("content-type")).toBe("application/json");
  expect([...res.headers.keys()].filter((h) => h.toLowerCase().startsWith("access-control-"))).toEqual([]);
}

async function expectError(res: Response, status: number, code: string, field: string | null) {
  expect(res.status).toBe(status);
  expectQaHeaders(res);
  const body = await res.json();
  const message = { INVALID_QUERY: "Invalid query", UNAUTHORIZED: "Unauthorized", NOT_FOUND: "Not found", RATE_LIMITED: "Too many requests",
    UNAVAILABLE: "Unavailable" }[code];
  expect(body).toEqual({ success: false, data: null, message, errors: [{ field, code, message }],
    metadata: { timestamp: expect.any(String), requestId: RID } });
}

describe("no disabled QA API any more (§7.9.1 as amended by the QA portal, D68)", () => {
  it.each([["unset", undefined], ["empty", ""], ["blank", "  "], ["invalid", `Checker:${sha(KEY)}`]])(
    "%s QA_API_KEYS: every QA route is 401 for an env key, never 404, and reads nothing; the catch-all stays 404", async (_n, value) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      if (value === undefined) vi.stubEnv("QA_API_KEYS", undefined as unknown as string);
      else vi.stubEnv("QA_API_KEYS", value);
      for (const [route, handler, path] of ROUTES) {
        await expectError(await call(handler, path), 401, "UNAUTHORIZED", null);
        expect(audits.filter((a) => a.targetId === route)).toEqual([expect.objectContaining({ outcome: "unauthorized" })]);
      }
      audits = [];
      await expectError(await call(restGET, "/api/qa"), 404, "NOT_FOUND", null);
      expect(reads).toEqual([]);
      expect(audits).toEqual([]);
    });

  it("an unknown QA path is the same 404 while enabled, with or without a key, and writes nothing", async () => {
    for (const path of ["/api/qa", "/api/qa/v1", "/api/qa/v2/batches", "/api/qa/v1/batches/0001-pilot/records", "/api/qa/v1/substances/BDS-000003"]) {
      await expectError(await call(restGET, path), 404, "NOT_FOUND", null);
      await expectError(await anon(restGET, path), 404, "NOT_FOUND", null);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("auth (§7.9.1)", () => {
  it.each([
    ["no header", {}],
    ["another scheme", { authorization: `Basic ${KEY}` }],
    ["a short key", { authorization: "Bearer short-key" }],
    ["an unknown key", { authorization: `Bearer ${"u".repeat(40)}` }],
    ["the key's hash", { authorization: `Bearer ${sha(KEY)}` }],
  ])("%s is 401 with WWW-Authenticate: Bearer and no detail, before any read", async (_n, headers) => {
    for (const [, handler, path] of ROUTES) {
      const res = await anon(handler, path, headers);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      await expectError(res, 401, "UNAUTHORIZED", null);
    }
    expect(reads).toEqual([]);
  });

  it("a reviewer's session cookie or an X-Internal-Token alone never authorises a QA call", async () => {
    await expectError(await anon(recordsGET, "/api/qa/v1/records?filter=stage_warn", { cookie: "intellidrugs_session=abc" }), 401, "UNAUTHORIZED", null);
    await expectError(await anon(recordsGET, "/api/qa/v1/records?filter=stage_warn", { "x-internal-token": TOKEN }), 401, "UNAUTHORIZED", null);
    expect(reads).toEqual([]);
  });

  it("a bad input from an unauthenticated caller is 401, not 400", async () => {
    await expectError(await anon(recordsGET, "/api/qa/v1/records?filter=nope"), 401, "UNAUTHORIZED", null);
  });

  it("both configured keys work, and the scheme is case-insensitive", async () => {
    expect((await call(batchesGET, "/api/qa/v1/batches", { authorization: `bearer ${KEY2}` })).status).toBe(200);
    expect(audits.at(-1)?.targetId).toBe("nightly/batches");
  });
});

describe("rate limit (§7.9.1)", () => {
  it("the 61st request in a minute for one label is 429 with Retry-After: 60; another label is unaffected; 400s count", async () => {
    for (let i = 0; i < 30; i++) expect((await call(batchesGET, "/api/qa/v1/batches")).status).toBe(200);
    for (let i = 0; i < 30; i++) expect((await call(recordsGET, "/api/qa/v1/records?filter=nope")).status).toBe(400);
    const readsBefore = reads.length;
    const res = await call(batchesGET, "/api/qa/v1/batches");
    expect(res.headers.get("retry-after")).toBe("60");
    await expectError(res, 429, "RATE_LIMITED", null);
    expect(reads.length).toBe(readsBefore);
    expect((await call(batchesGET, "/api/qa/v1/batches", { authorization: `Bearer ${KEY2}` })).status).toBe(200);
    clock.now += 60_000;
    expect((await call(batchesGET, "/api/qa/v1/batches")).status).toBe(200);
  });
});

describe("input validation (§7.9.2): 400 INVALID_QUERY with the field, after auth, never reaching the API", () => {
  it.each([
    [batchesGET, "/api/qa/v1/batches?page=1", "page"],
    [batchGET, "/api/qa/v1/batches/bad%20batch", "batchId"],
    [batchGET, `/api/qa/v1/batches/${"b".repeat(101)}`, "batchId"],
    [batchGET, "/api/qa/v1/batches/a%2Fb", "batchId"],
    [batchGET, "/api/qa/v1/batches/%E0%A4%A", "batchId"],
    [batchGET, "/api/qa/v1/batches/0001-pilot?x=1", "x"],
    [recordGET, "/api/qa/v1/batches/bad!/records/N-1", "batchId"],
    [recordGET, "/api/qa/v1/batches/0001-pilot/records/%E0%A4%A", "conceptId"],
    [recordGET, "/api/qa/v1/batches/0001-pilot/records/a%00b", "conceptId"],
    [recordGET, `/api/qa/v1/batches/0001-pilot/records/${"c".repeat(201)}`, "conceptId"],
    [recordGET, "/api/qa/v1/batches/0001-pilot/records/N-1?page=0", "page"],
    [recordsGET, "/api/qa/v1/records", "filter"],
    [recordsGET, "/api/qa/v1/records?filter=", "filter"],
    [recordsGET, "/api/qa/v1/records?filter=STAGE_WARN", "filter"],
    [recordsGET, "/api/qa/v1/records?filter=stage_fail&stage=ddinter", "stage"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&stage=evidence", "stage"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&stage", "stage"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&batch=", "batch"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&batch=a%2Fb", "batch"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&page=1000", "page"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&page=-1", "page"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&page=1.5", "page"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&page=", "page"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&size=10", "size"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&filter=stage_fail", "filter"],
    [recordsGET, "/api/qa/v1/records?filter=stage_warn&page=0&page=1", "page"],
    [pairsGET, "/api/qa/v1/substances/BDS-1/pairs", "bdsId"],
    [pairsGET, "/api/qa/v1/substances/bds-000003/pairs", "bdsId"],
    [pairsGET, "/api/qa/v1/substances/BDS-000003/pairs?page=abc", "page"],
    [pairsGET, "/api/qa/v1/substances/BDS-000003/pairs?pairs=applies", "pairs"],
  ] as [Handler, string, string][])("%#: %s", async (handler, path, field) => {
    await expectError(await call(handler, path), 400, "INVALID_QUERY", field);
    expect(reads).toEqual([]);
    expect(audits).toEqual([expect.objectContaining({ event: "qa_read", outcome: "invalid_query" })]);
  });
});

describe("internal API reads", () => {
  it("each route reads its endpoint with the internal token, ids encoded, and never forwards the caller's headers", async () => {
    await call(batchesGET, "/api/qa/v1/batches");
    await call(batchGET, "/api/qa/v1/batches/0001-pilot");
    await call(recordGET, "/api/qa/v1/batches/0001-pilot/records/040-090(-077--mectigen-vet-oral-solution");
    await call(recordGET, "/api/qa/v1/batches/0001-pilot/records/a%20b%3Fc");
    await call(recordsGET, "/api/qa/v1/records?page=007&batch=0001-pilot&stage=ddinter&filter=stage_warn");
    await call(recordsGET, "/api/qa/v1/records?filter=unaligned");
    await call(pairsGET, "/api/qa/v1/substances/BDS-000003/pairs?page=2");
    expect(reads.map((r) => r.url)).toEqual([
      "/v1/review/batches",
      "/v1/qa/batches/0001-pilot/items",
      "/v1/review/batches/0001-pilot/items/040-090(-077--mectigen-vet-oral-solution",
      "/v1/review/batches/0001-pilot/items/a%20b%3Fc",
      "/v1/qa/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=7",
      "/v1/qa/records?filter=unaligned&page=0",
      "/v1/review/substances/BDS-000003?pairs=all&page=2&size=50",
    ]);
    for (const r of reads) expect(r.headers).toEqual({ "X-Internal-Token": TOKEN });
  });

  it("an API 404 is a 404 with the route's id field", async () => {
    upstream = () => apiError(404, "NOT_FOUND", "batchId");
    await expectError(await call(batchGET, "/api/qa/v1/batches/nope"), 404, "NOT_FOUND", "batchId");
    await expectError(await call(recordGET, "/api/qa/v1/batches/nope/records/N-1"), 404, "NOT_FOUND", "batchId");
    upstream = () => apiError(404, "NOT_FOUND", "conceptId");
    await expectError(await call(recordGET, "/api/qa/v1/batches/0001-pilot/records/nope"), 404, "NOT_FOUND", "conceptId");
    upstream = () => apiError(404, "NOT_FOUND", "batch");
    await expectError(await call(recordsGET, "/api/qa/v1/records?filter=stage_warn&batch=nope"), 404, "NOT_FOUND", "batch");
    upstream = () => apiError(404, "NOT_FOUND", "bdsId");
    await expectError(await call(pairsGET, "/api/qa/v1/substances/BDS-999999/pairs"), 404, "NOT_FOUND", "bdsId");
    expect(audits.map((a) => a.outcome)).toEqual(["not_found", "not_found", "not_found", "not_found", "not_found"]);
  });

  it("an API 400 is passed on as a 400 with its field", async () => {
    upstream = () => apiError(400, "INVALID_QUERY", "page");
    await expectError(await call(recordsGET, "/api/qa/v1/records?filter=stage_warn&page=3"), 400, "INVALID_QUERY", "page");
  });

  it.each([
    ["an API 500", () => apiError(500, "INTERNAL_ERROR", null)],
    ["an API 503 with no body", () => new Response("", { status: 503 })],
    ["an API 401 (a wrong internal token)", () => apiError(401, "UNAUTHORIZED", null)],
    ["an API 404 with no id field (an endpoint this API lacks)", () => apiError(404, "NOT_FOUND", null)],
    ["a timeout", () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a body that is not JSON", () => new Response("<html>")],
    ["an envelope without data", () => new Response(JSON.stringify({ success: true, data: null }))],
    ["a body of the wrong shape", () => new Response(JSON.stringify(envelope({ unexpected: true })))],
  ] as [string, () => Response | Promise<Response>][])("%s is 502 UNAVAILABLE on every route, never 500", async (_n, answer) => {
    upstream = answer;
    for (const [, handler, path] of ROUTES) await expectError(await call(handler, path), 502, "UNAVAILABLE", null);
    expect(audits.map((a) => a.outcome)).toEqual(Array(ROUTES.length).fill("unavailable"));
  });

  it("no internal token configured is 502", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    await expectError(await call(batchesGET, "/api/qa/v1/batches"), 502, "UNAVAILABLE", null);
  });
});

describe("success (§7.9.1, §7.9.3)", () => {
  it("is the platform envelope with the request id, the QA headers and no CORS header", async () => {
    const res = await call(batchesGET, "/api/qa/v1/batches");
    expect(res.status).toBe(200);
    expectQaHeaders(res);
    expect(await res.json()).toEqual({ success: true, message: "OK", errors: [], metadata: { timestamp: expect.any(String), requestId: RID },
      data: { batches: [{ batchId: "0001-pilot", status: "in_review", itemCount: 10, approvedCount: 4, runAt: "2026-10-11T21:27:17.629Z" }] } });
  });

  it("every route answers its §7.9.3 shape", async () => {
    expect((await (await call(batchGET, "/api/qa/v1/batches/0001-pilot")).json()).data).toEqual(BATCH);
    expect((await (await call(recordsGET, "/api/qa/v1/records?filter=stage_warn")).json()).data).toEqual(RECORDS);
    const record = (await (await call(recordGET, "/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa")).json()).data;
    expect(record.conceptId).toBe("186-0030-006--napa");
    expect(record.extraction.ingredients[0].strengthValue).toBe(500);
    const pairs = (await (await call(pairsGET, "/api/qa/v1/substances/BDS-000003/pairs?page=1")).json()).data;
    expect(pairs).toMatchObject({ bdsId: "BDS-000003", page: 1, size: 50, total: 3 });
  });

  it("no route's body carries an email, a note, mine, a version token or a content hash (deep scan)", async () => {
    const bodies: string[] = [];
    for (const [, handler, path] of ROUTES) bodies.push(await (await call(handler, path)).text());
    const all = bodies.join("\n");
    // a batch item's stage keeps its stored pipeline "note" (§7.9.3); every reviewer note text is still refused
    for (const s of SENTINELS.filter((x) => x !== "\"note\"")) expect(all, `a QA response contains ${s}`).not.toContain(s);
  });

  it("the 200 is sent only after its qa_read row is written, with the label and route and no actor", async () => {
    for (const [route, handler, path] of ROUTES) {
      audits = [];
      expect((await call(handler, path)).status).toBe(200);
      expect(audits).toEqual([{ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: `checker/${route}`,
        outcome: "ok", requestId: RID }]);
    }
  });

  it("a 200 whose audit write fails becomes 502 with no data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auditStatus = 500;
    for (const [, handler, path] of ROUTES) await expectError(await call(handler, path), 502, "UNAVAILABLE", null);
  });

  it("every other outcome's audit row is best effort: the answer stands when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auditStatus = 500;
    await expectError(await call(recordsGET, "/api/qa/v1/records?filter=nope"), 400, "INVALID_QUERY", "filter");
    await expectError(await anon(recordsGET, "/api/qa/v1/records?filter=stage_warn"), 401, "UNAUTHORIZED", null);
    upstream = () => apiError(404, "NOT_FOUND", "batchId");
    await expectError(await call(batchGET, "/api/qa/v1/batches/nope"), 404, "NOT_FOUND", "batchId");
  });
});

describe("qa_read audit rows (§7.9.6)", () => {
  it("unauthorized rows: at most one per minute per (route, IP); the target is the route alone", async () => {
    await anon(recordsGET, "/api/qa/v1/records?filter=stage_warn");
    await anon(recordsGET, "/api/qa/v1/records?filter=stage_warn");
    await anon(batchesGET, "/api/qa/v1/batches");
    await anon(recordsGET, "/api/qa/v1/records?filter=stage_warn", { "x-forwarded-for": "198.51.100.7" });
    expect(audits).toEqual([
      { event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: "records", outcome: "unauthorized", requestId: RID },
      { event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: "batches", outcome: "unauthorized", requestId: RID },
      { event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: "records", outcome: "unauthorized", requestId: RID },
    ]);
    clock.now += 60_000;
    await anon(recordsGET, "/api/qa/v1/records?filter=stage_warn");
    expect(audits).toHaveLength(4);
  });

  it("rate_limited rows: one per minute per label", async () => {
    for (let i = 0; i < 60; i++) await call(batchesGET, "/api/qa/v1/batches");
    audits = [];
    for (let i = 0; i < 5; i++) expect((await call(recordsGET, "/api/qa/v1/records?filter=stage_warn")).status).toBe(429);
    expect(audits).toEqual([{ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: "checker/records",
      outcome: "rate_limited", requestId: RID }]);
  });

  it("a request without a valid x-request-id gets a fresh UUID, the same in the envelope and the row", async () => {
    const res = await call(batchesGET, "/api/qa/v1/batches", { "x-request-id": "chosen-by-caller" });
    const id = (await res.json()).metadata.requestId;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(audits.at(-1)?.requestId).toBe(id);
  });
});

describe("logs (§7.9.7)", () => {
  it("one request line per call with the route template; never the key, its hash, the label, an id or a query value", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await call(recordGET, "/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa");
    await call(recordsGET, "/api/qa/v1/records?filter=stage_warn&batch=0001-pilot");
    await anon(pairsGET, "/api/qa/v1/substances/BDS-000003/pairs");
    auditStatus = 500;
    await call(batchesGET, "/api/qa/v1/batches");
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { msg: "request", route: "/api/qa/v1/batches/[batchId]/records/[conceptId]", method: "GET", status: 200, ms: expect.any(Number), requestId: RID },
      { msg: "request", route: "/api/qa/v1/records", method: "GET", status: 200, ms: expect.any(Number), requestId: RID },
      { msg: "request", route: "/api/qa/v1/substances/[bdsId]/pairs", method: "GET", status: 401, ms: expect.any(Number), requestId: RID },
      { msg: "request", route: "/api/qa/v1/batches", method: "GET", status: 502, ms: expect.any(Number), requestId: RID },
    ]);
    const all = JSON.stringify([log.mock.calls, error.mock.calls]);
    for (const s of [KEY, sha(KEY), "checker", "0001-pilot", "186-0030-006", "BDS-000003", "stage_warn"]) expect(all).not.toContain(s);
  });
});
