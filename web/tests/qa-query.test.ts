import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerQa, checkQaInput, runQa, type QaInput } from "@/lib/qa-query";
import { apiRecord, apiSubstance } from "./fixtures/qa";

/*
 * §7.10.5: the shared QA query code. The five QA API routes and the hosted MCP's tool calls both reach the internal API
 * through runQa and answer through answerQa, so the reads, the allowlist maps, the qa_read row and the 200-only-after-its-row
 * rule are one piece of code (no HTTP self-call). The route-level behaviour stays pinned by qa-routes.test.ts.
 */

const TOKEN = "test-internal-token-0123456789abcdef";
const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const envelope = (data: unknown) => ({ success: true, data, message: "OK", errors: [],
  metadata: { timestamp: "2026-10-18T00:00:00Z", requestId: "00000000-0000-4000-8000-000000000000" } });
const BATCHES = [{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 10,
  counts: { approved: 4 } }];
const BATCH = { batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 0, items: [] };
const RECORDS = { filter: "stage_warn", stage: "ddinter", batch: "0001-pilot", page: 7, size: 100, total: 0, items: [] };

let reads: string[];
let audits: Record<string, unknown>[];
let auditStatus: number;
let upstream: (path: string) => Response | Promise<Response>;

function defaultUpstream(path: string): Response {
  if (path === "/v1/review/batches") return new Response(JSON.stringify(envelope(BATCHES)));
  if (path.startsWith("/v1/qa/batches/")) return new Response(JSON.stringify(envelope(BATCH)));
  if (path.startsWith("/v1/review/batches/")) return new Response(JSON.stringify(envelope(apiRecord())));
  if (path.startsWith("/v1/qa/records")) return new Response(JSON.stringify(envelope(RECORDS)));
  if (path.startsWith("/v1/review/substances/")) return new Response(JSON.stringify(envelope(apiSubstance())));
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  reads = [];
  audits = [];
  auditStatus = 201;
  upstream = defaultUpstream;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api:8080", "");
    if (path === "/v1/audit-events" && init.method === "POST") {
      audits.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ success: true, data: { id: audits.length } }), { status: auditStatus });
    }
    reads.push(path);
    return upstream(path);
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("checkQaInput (§7.9.2 value rules, in each route's order)", () => {
  it.each([
    [{ route: "batches" }, null],
    [{ route: "batch", batchId: "0001-pilot" }, null],
    [{ route: "batch", batchId: "bad batch" }, "batchId"],
    [{ route: "batch", batchId: "b".repeat(101) }, "batchId"],
    [{ route: "record", batchId: "bad!", conceptId: "a\u0000" }, "batchId"],
    [{ route: "record", batchId: "0001-pilot", conceptId: "" }, "conceptId"],
    [{ route: "record", batchId: "0001-pilot", conceptId: "c".repeat(201) }, "conceptId"],
    [{ route: "record", batchId: "0001-pilot", conceptId: "a\u007fb" }, "conceptId"],
    [{ route: "record", batchId: "0001-pilot", conceptId: "040-090(-077--mectigen-vet-oral-solution" }, null],
    [{ route: "records", filter: "STAGE_WARN", stage: "nope", page: 1000 }, "filter"],
    [{ route: "records", filter: "stage_fail", stage: "ddinter", page: 0 }, "stage"],
    [{ route: "records", filter: "stage_warn", stage: "evidence", page: 0 }, "stage"],
    [{ route: "records", filter: "stage_warn", batch: "a/b", page: 1000 }, "batch"],
    [{ route: "records", filter: "stage_warn", page: 1000 }, "page"],
    [{ route: "records", filter: "stage_warn", page: -1 }, "page"],
    [{ route: "records", filter: "stage_warn", page: 1.5 }, "page"],
    [{ route: "records", filter: "stage_warn", stage: "ddinter", batch: "0001-pilot", page: 999 }, null],
    [{ route: "pairs", bdsId: "bds-000003", page: -1 }, "bdsId"],
    [{ route: "pairs", bdsId: "BDS-000003", page: Number.NaN }, "page"],
    [{ route: "pairs", bdsId: "BDS-000003", page: 2 }, null],
  ] as [QaInput, string | null][])("%#: %j → %s", (input, field) => {
    expect(checkQaInput(input)).toBe(field);
  });
});

describe("runQa: the internal API read and the allowlist map", () => {
  it("reads each route's endpoint, ids encoded, and maps the body", async () => {
    expect(await runQa({ route: "batches" })).toEqual({ ok: true, data: { batches: [
      { batchId: "0001-pilot", status: "in_review", itemCount: 10, approvedCount: 4, runAt: "2026-10-11T21:27:17.629Z" }] } });
    expect(await runQa({ route: "batch", batchId: "0001-pilot" })).toEqual({ ok: true, data: BATCH });
    const record = await runQa({ route: "record", batchId: "0001-pilot", conceptId: "a b?c" });
    expect(record.ok && (record.data as { conceptId: string }).conceptId).toBe("186-0030-006--napa");
    expect(await runQa({ route: "records", filter: "stage_warn", stage: "ddinter", batch: "0001-pilot", page: 7 }))
      .toEqual({ ok: true, data: RECORDS });
    const pairs = await runQa({ route: "pairs", bdsId: "BDS-000003", page: 2 });
    expect(pairs.ok && pairs.data).toMatchObject({ bdsId: "BDS-000003", page: 2, size: 50 });
    await runQa({ route: "records", filter: "unaligned", page: 0 });
    expect(reads).toEqual([
      "/v1/review/batches",
      "/v1/qa/batches/0001-pilot/items",
      "/v1/review/batches/0001-pilot/items/a%20b%3Fc",
      "/v1/qa/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=7",
      "/v1/review/substances/BDS-000003?pairs=all&page=2&size=50",
      "/v1/qa/records?filter=unaligned&page=0",
    ]);
  });

  it("refuses a bad input before any read", async () => {
    expect(await runQa({ route: "batch", batchId: "a/b" })).toEqual({ ok: false, code: "INVALID_QUERY", field: "batchId" });
    expect(reads).toEqual([]);
  });

  it("an API 404 with the route's id field is NOT_FOUND; anything unexpected is UNAVAILABLE; a throw is UNAVAILABLE", async () => {
    upstream = () => new Response(JSON.stringify({ success: false, errors: [{ field: "batch", code: "NOT_FOUND" }] }), { status: 404 });
    expect(await runQa({ route: "records", filter: "stage_warn", batch: "nope", page: 0 }))
      .toEqual({ ok: false, code: "NOT_FOUND", field: "batch" });
    upstream = () => new Response("<html>", { status: 500 });
    expect(await runQa({ route: "batches" })).toEqual({ ok: false, code: "UNAVAILABLE", field: null });
    upstream = () => { throw new Error("boom"); };
    expect(await runQa({ route: "batches" })).toEqual({ ok: false, code: "UNAVAILABLE", field: null });
  });
});

describe("answerQa: the envelope, the qa_read row and the 200-only-after-its-row rule (§7.9.6)", () => {
  it("a 200 is the platform envelope with the request id, written after its row ({label}/{route}, no actor)", async () => {
    const a = await answerQa({ route: "batches" }, "key.12", RID);
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ success: true, message: "OK", errors: [], metadata: { timestamp: expect.any(String), requestId: RID },
      data: { batches: [expect.objectContaining({ batchId: "0001-pilot" })] } });
    expect(audits).toEqual([{ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: "key.12/batches",
      outcome: "ok", requestId: RID }]);
  });

  it("a 200 whose row cannot be written is 502 UNAVAILABLE with no data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auditStatus = 500;
    const a = await answerQa({ route: "batch", batchId: "0001-pilot" }, "checker", RID);
    expect(a).toEqual({ status: 502, body: { success: false, data: null, message: "Unavailable",
      errors: [{ field: null, code: "UNAVAILABLE", message: "Unavailable" }], metadata: { timestamp: expect.any(String), requestId: RID } } });
  });

  it("an error is its envelope and status, with a best-effort row of the lower-cased code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = await answerQa({ route: "pairs", bdsId: "BDS-1", page: 0 }, "checker", RID);
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual([{ field: "bdsId", code: "INVALID_QUERY", message: "Invalid query" }]);
    upstream = () => new Response(JSON.stringify({ success: false, errors: [{ field: "conceptId", code: "NOT_FOUND" }] }), { status: 404 });
    auditStatus = 500;
    const missing = await answerQa({ route: "record", batchId: "0001-pilot", conceptId: "nope" }, "checker", RID);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, data: null, message: "Not found",
      errors: [{ field: "conceptId", code: "NOT_FOUND", message: "Not found" }] });
    expect(audits.map((x) => [x.targetId, x.outcome])).toEqual([["checker/pairs", "invalid_query"], ["checker/record", "not_found"]]);
  });
});
