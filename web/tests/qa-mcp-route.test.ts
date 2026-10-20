import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * §7.10.6 (D69), §11.1 "Hosted MCP": POST /api/qa/mcp, MCP Streamable HTTP, stateless, JSON responses only. Each check of
 * the §7.10.6 table in order, every JSON-RPC method and error, and tool calls through the shared QA query code (answerQa),
 * the shared per-key limit and the same qa_read rows as the equivalent GET.
 */

const clock = vi.hoisted(() => ({ now: 3_000_000_000 }));
vi.mock("@/lib/limits", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/limits")>();
  return { ...m, LIMITS: m.createLimits(() => clock.now) };
});
const spies = vi.hoisted(() => ({ answerQa: null as unknown as ReturnType<typeof import("vitest").vi.fn> }));
vi.mock("@/lib/qa-query", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/qa-query")>();
  const { vi: v } = await import("vitest");
  spies.answerQa = v.fn(m.answerQa);
  return { ...m, answerQa: spies.answerQa };
});

import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/qa/mcp/route";
import { GET as batchesGET } from "@/app/api/qa/v1/batches/route";
import { GET as batchGET } from "@/app/api/qa/v1/batches/[batchId]/route";
import { GET as recordGET } from "@/app/api/qa/v1/batches/[batchId]/records/[conceptId]/route";
import { GET as recordsGET } from "@/app/api/qa/v1/records/route";
import { GET as pairsGET } from "@/app/api/qa/v1/substances/[bdsId]/pairs/route";
import { qaKeysForTests } from "@/lib/qa-api";
import { DEFAULT_PROTOCOL_VERSION } from "@/lib/qa-mcp";
import { GUIDE, GUIDE_TOPICS, guideBody, guideResources } from "@/lib/qa-guide";
import { PREAMBLE, SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS } from "@/lib/qa-mcp-tools";
import { apiRecord, apiSubstance, SENTINELS } from "./fixtures/qa";

const TOKEN = "test-internal-token-0123456789abcdef";
const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const HOST = "drugdb.example.org";
const ORIGIN = `https://${HOST}`;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const KEY = "qa-key-checker-0123456789abcdefghijklmnop";
const DB_KEY = `idqa_${randomBytes(32).toString("base64url")}`;
const OWNER = "qa.owner@example.org";

const envelope = (data: unknown) => ({ success: true, data, message: "OK", errors: [],
  metadata: { timestamp: "2026-10-18T00:00:00Z", requestId: "00000000-0000-4000-8000-000000000000" } });
const BATCHES = [{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 10, counts: { approved: 4 } }];
const BATCH = { batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 1,
  items: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending", stages: [{ stage: "dgda", status: "ok", note: "" }] }] };
const RECORDS = { filter: "stage_warn", stage: null, batch: null, page: 0, size: 100, total: 0, items: [] };

let audits: Record<string, unknown>[];
let reads: string[];
let siteCalls: string[];
let upstream: (path: string) => Response | Promise<Response>;
let verifyAnswer: (() => Response | Promise<Response>) | null;

function defaultUpstream(path: string): Response {
  if (path === "/v1/review/batches") return new Response(JSON.stringify(envelope(BATCHES)));
  if (path.startsWith("/v1/qa/batches/")) return new Response(JSON.stringify(envelope(BATCH)));
  if (path.startsWith("/v1/review/batches/")) return new Response(JSON.stringify(envelope(apiRecord())));
  if (path.startsWith("/v1/qa/records")) return new Response(JSON.stringify(envelope(RECORDS)));
  if (path.startsWith("/v1/review/substances/")) return new Response(JSON.stringify(envelope(apiSubstance())));
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
  clock.now += 3_600_000;
  qaKeysForTests.reset();
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  vi.stubEnv("SITE_HOST", HOST);
  vi.stubEnv("QA_API_KEYS", `checker:${sha(KEY)}`);
  vi.stubEnv("REVIEWERS", `${OWNER}:qa,pharm@example.org:pharmacist`);
  audits = [];
  reads = [];
  siteCalls = [];
  upstream = defaultUpstream;
  verifyAnswer = null;
  spies.answerQa.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    if (!url.startsWith("http://api:8080")) {
      siteCalls.push(url);
      return new Response("{}", { status: 599 });
    }
    const path = url.replace("http://api:8080", "");
    if (path === "/v1/audit-events" && init.method === "POST") {
      audits.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ success: true, data: { id: audits.length } }), { status: 201 });
    }
    if (path === "/v1/qa-keys/verify" && init.method === "POST") {
      if (verifyAnswer) return verifyAnswer();
      const { keyHash } = JSON.parse(String(init.body));
      return keyHash === sha(DB_KEY) ? new Response(JSON.stringify(envelope({ keyId: 12, ownerEmail: OWNER })))
        : new Response(JSON.stringify({ success: false, errors: [{ field: "keyHash", code: "NOT_FOUND" }] }), { status: 404 });
    }
    if (/^\/v1\/qa-keys\/[0-9]+\/used$/.test(path)) return new Response(null, { status: 204 });
    reads.push(path);
    return upstream(path);
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type Init = { headers?: Record<string, string | null>; body?: BodyInit | null; method?: string; key?: string | null };
const BASE_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "x-request-id": RID,
  "x-forwarded-for": "203.0.113.9" };

function request({ headers = {}, body = null, method = "POST", key = KEY }: Init = {}): Request {
  const h: Record<string, string> = { ...BASE_HEADERS, ...(key === null ? {} : { authorization: `Bearer ${key}` }) };
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) delete h[k];
    else h[k] = v;
  }
  return new Request("http://localhost/api/qa/mcp", { method, headers: h, body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
}

const rpc = (method: string, params?: unknown, id: string | number | null = 1) =>
  JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, ...(params === undefined ? {} : { params }) });
const send = (body: BodyInit, init: Init = {}) => POST(request({ ...init, body }));
const callTool = (name: string, args?: unknown, init: Init = {}) =>
  send(rpc("tools/call", { name, ...(args === undefined ? {} : { arguments: args }) }), init);

function expectMcpHeaders(res: Response, body = true) {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(res.headers.get("content-type")).toBe(body ? "application/json" : null);
  const names = [...res.headers.keys()];
  expect(names.filter((h) => h.startsWith("access-control-"))).toEqual([]);
  expect(names).not.toContain("mcp-session-id");
}

async function expectRpcError(res: Response, status: number, code: number, message: string, id: string | number | null = null) {
  expect(res.status).toBe(status);
  expectMcpHeaders(res);
  expect(await res.json()).toEqual({ jsonrpc: "2.0", id, error: { code, message } });
}

async function result(res: Response, id: string | number = 1) {
  expect(res.status).toBe(200);
  expectMcpHeaders(res);
  const body = await res.json();
  expect(body.jsonrpc).toBe("2.0");
  expect(body.id).toBe(id);
  expect(body.error).toBeUndefined();
  return body.result;
}

describe("the §7.10.6 checks, in order", () => {
  it("1: GET, DELETE, PUT and PATCH are 405 with Allow: POST, before any auth", async () => {
    for (const handler of [GET, DELETE, PUT, PATCH]) {
      const res = await handler(request({ method: handler === GET ? "GET" : "DELETE", key: null }));
      expect(res.headers.get("allow")).toBe("POST");
      await expectRpcError(res, 405, -32000, "Method not allowed");
    }
    expect(audits).toEqual([]);
  });

  it("2: a foreign Origin and the null origin are 403; none and the site's own origin pass", async () => {
    for (const origin of ["https://evil.example", "null", `http://${HOST}`, `${ORIGIN}:8443`, `${ORIGIN}/`, "https://drugdb.example.org.evil"]) {
      await expectRpcError(await send(rpc("ping"), { headers: { origin }, key: null }), 403, -32002, "Forbidden");
    }
    expect(audits).toEqual([]);
    await result(await send(rpc("ping")));
    await result(await send(rpc("ping"), { headers: { origin: ORIGIN } }));
  });

  it("3: no key, a bad key or a session cookie is 401 with WWW-Authenticate: Bearer and one throttled `mcp` row", async () => {
    for (const init of [{ key: null }, { key: "u".repeat(40) }, { key: sha(KEY) }, { key: null, headers: { cookie: "intellidrugs_session=abc" } },
      { key: null, headers: { "x-internal-token": TOKEN } }] as Init[]) {
      const res = await send(rpc("tools/list"), init);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      await expectRpcError(res, 401, -32001, "Unauthorized");
    }
    expect(audits).toEqual([{ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: "mcp",
      outcome: "unauthorized", requestId: RID }]);
    expect(reads).toEqual([]);
  });

  it("3: a DB key authenticates as key.{id}; a failed verify call is 502 -32004 with an `unavailable` mcp row", async () => {
    expect((await result(await callTool("list_batches", {}, { key: DB_KEY }))).isError).toBeUndefined();
    expect(audits.map((a) => a.targetId)).toEqual(["key.12/batches"]);
    audits = [];
    verifyAnswer = () => new Response("oops", { status: 503 });
    await expectRpcError(await send(rpc("tools/list"), { key: DB_KEY }), 502, -32004, "Unavailable");
    expect(audits).toEqual([expect.objectContaining({ targetId: "mcp", outcome: "unavailable" })]);
  });

  it("3: a DB key whose owner no longer holds a QA role is 401", async () => {
    vi.stubEnv("REVIEWERS", `${OWNER}:pharmacist`);
    await expectRpcError(await send(rpc("tools/list"), { key: DB_KEY }), 401, -32001, "Unauthorized");
  });

  it("4: every authenticated MCP request counts once (415, 406 and parse errors too), shared with the QA API; the 61st is 429 with Retry-After: 60", async () => {
    for (let i = 0; i < 20; i++) await send(rpc("ping"));
    for (let i = 0; i < 10; i++) await send("{", {});                                 // parse errors count too
    for (let i = 0; i < 5; i++) expect((await send(rpc("ping"), { headers: { "content-type": "text/plain" } })).status).toBe(415);
    for (let i = 0; i < 5; i++) expect((await send(rpc("ping"), { headers: { accept: "text/html" } })).status).toBe(406);
    for (let i = 0; i < 20; i++) expect((await batchesGET(new Request("http://localhost/api/qa/v1/batches",
      { headers: { authorization: `Bearer ${KEY}`, "x-request-id": RID } }))).status).toBe(200);
    audits = [];
    const res = await send(rpc("ping"));
    expect(res.headers.get("retry-after")).toBe("60");
    await expectRpcError(res, 429, -32003, "Too many requests");
    await expectRpcError(await send(rpc("ping")), 429, -32003, "Too many requests");
    expect(audits).toEqual([{ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: "checker/mcp",
      outcome: "rate_limited", requestId: RID }]);
    clock.now += 60_000;
    await result(await send(rpc("ping")));
  });

  /** A body far over 64 KiB that counts its pulls; highWaterMark 0, so nothing is pulled until the handler reads. */
  function countedStream() {
    const chunk = new TextEncoder().encode("x".repeat(16_384));
    const counter = { pulls: 0 };
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (counter.pulls++ < 10) c.enqueue(chunk); else c.close(); } },
      { highWaterMark: 0 });
    return { stream, counter };
  }

  it("3 before 5–7: with no key, a bad Content-Type, a bad Accept or an oversized body is still 401, and no body is read", async () => {
    for (const headers of [{ "content-type": "text/plain" }, { "content-type": null }, { accept: "text/html" },
      { "content-type": "text/plain", accept: "text/html" }]) {
      const res = await send(rpc("ping"), { key: null, headers });
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      await expectRpcError(res, 401, -32001, "Unauthorized");
    }
    for (const key of [null, "u".repeat(40)]) {
      const { stream, counter } = countedStream();
      await expectRpcError(await send(stream, { key, headers: { "content-type": "text/plain", accept: "text/html" } }),
        401, -32001, "Unauthorized");
      expect(counter.pulls).toBe(0);
    }
    expect(audits.map((a) => a.outcome)).toEqual(["unauthorized"]);
    expect(reads).toEqual([]);
  });

  it("4 before 5–7: a key already at its limit gets 429 for a bad Content-Type, a bad Accept or an oversized body", async () => {
    for (let i = 0; i < 60; i++) await send(rpc("ping"));
    for (const headers of [{ "content-type": "text/plain" }, { "content-type": null }, { accept: "text/html" }]) {
      const res = await send(rpc("ping"), { headers });
      expect(res.headers.get("retry-after")).toBe("60");
      await expectRpcError(res, 429, -32003, "Too many requests");
    }
    const { stream, counter } = countedStream();
    await expectRpcError(await send(stream), 429, -32003, "Too many requests");
    expect(counter.pulls).toBe(0);
  });

  it("5: a Content-Type other than application/json is 415; parameters are allowed", async () => {
    for (const ct of ["text/plain", "application/json-seq", "multipart/form-data", null]) {
      await expectRpcError(await send(rpc("ping"), { headers: { "content-type": ct } }), 415, -32000, "Unsupported media type");
    }
    await result(await send(rpc("ping"), { headers: { "content-type": "Application/JSON; charset=utf-8" } }));
  });

  it("6: an Accept that does not allow application/json is 406; absent, application/*, */* pass", async () => {
    // The most specific range that covers application/json decides (RFC 9110 §12.5.1): an explicit q=0 is a refusal.
    for (const accept of ["text/event-stream", "text/html", "application/xml", "application/json;q=0",
      "application/json;q=0, */*", "*/*, application/json; q=0", "application/*;q=0, */*", "application/json;q=0, application/*"]) {
      await expectRpcError(await send(rpc("ping"), { headers: { accept } }), 406, -32000, "Not acceptable");
    }
    for (const accept of [null, "application/*", "*/*", "text/html, */*;q=0.1", "application/json",
      "*/*;q=0, application/json", "application/*;q=0, application/json;q=0.5", "Application/JSON;Q=1"]) {
      await result(await send(rpc("ping"), { headers: { accept } }));
    }
  });

  it("7: a body over 64 KiB is 413, counted while reading whatever Content-Length says", async () => {
    const pad = (n: number) => `{"jsonrpc":"2.0","id":1,"method":"ping","params":{"p":"${"x".repeat(n)}"}}`;
    const base = pad(0).length;
    await result(await send(pad(65_536 - base)));
    await expectRpcError(await send(pad(65_537 - base)), 413, -32000, "Request too large");
    const chunk = new TextEncoder().encode("x".repeat(16_384));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ < 10) c.enqueue(chunk); else c.close(); } });
    await expectRpcError(await send(stream, { headers: { "content-length": "10" } }), 413, -32000, "Request too large");
    expect(sent).toBeLessThan(10);
  });

  it("8: a body that is not JSON is 400 -32700", async () => {
    for (const body of ["{", "", "nope", "ÿ"]) await expectRpcError(await send(body), 400, -32700, "Parse error");
    await expectRpcError(await send(new Uint8Array([0x7b, 0xff, 0x7d])), 400, -32700, "Parse error");
  });

  it("9: not one JSON-RPC 2.0 object is 400 -32600 (a batch array, a bad jsonrpc, a bad method or id)", async () => {
    for (const body of [
      `[${rpc("ping")}]`, "[]", "null", "1", "\"ping\"",
      JSON.stringify({ id: 1, method: "ping" }),
      JSON.stringify({ jsonrpc: "1.0", id: 1, method: "ping" }),
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: 7 }),
      JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" }),
      JSON.stringify({ jsonrpc: "2.0", id: null, method: "ping" }),
      JSON.stringify({ jsonrpc: "2.0", id: true, method: "ping" }),
      JSON.stringify({ jsonrpc: "2.0", id: 1 }),
      JSON.stringify({ jsonrpc: "2.0" }),
    ]) await expectRpcError(await send(body), 400, -32600, "Invalid Request");
  });

  it("10: an unsupported MCP-Protocol-Version is 400; absent means 2025-03-26; initialize ignores the header", async () => {
    await expectRpcError(await send(rpc("tools/list", undefined, 5), { headers: { "mcp-protocol-version": "2024-11-05" } }),
      400, -32600, "Unsupported protocol version", 5);
    await expectRpcError(await send(rpc("notifications/initialized", undefined, null), { headers: { "mcp-protocol-version": "x" } }),
      400, -32600, "Unsupported protocol version");
    for (const v of ["2025-11-25", "2025-06-18", "2025-03-26", null]) {
      await result(await send(rpc("ping"), { headers: { "mcp-protocol-version": v } }));
    }
    const init = await result(await send(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {},
      clientInfo: { name: "t", version: "1" } }), { headers: { "mcp-protocol-version": "1999-01-01" } }));
    expect(init.protocolVersion).toBe("2025-06-18");
  });

  it("DEFAULT_PROTOCOL_VERSION (exported for the QA API reference, §5.18) is the version an absent header speaks", () => {
    expect(DEFAULT_PROTOCOL_VERSION).toBe("2025-03-26");
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(DEFAULT_PROTOCOL_VERSION);
  });
});

describe("methods", () => {
  it("initialize echoes each supported version, answers 2025-11-25 otherwise, with serverInfo and the preamble", async () => {
    for (const [asked, answered] of [["2025-11-25", "2025-11-25"], ["2025-06-18", "2025-06-18"], ["2025-03-26", "2025-03-26"],
      ["2024-11-05", "2025-11-25"], ["next", "2025-11-25"]]) {
      expect(await result(await send(rpc("initialize", { protocolVersion: asked, capabilities: {}, clientInfo: { name: "c", version: "0" } }))))
        .toEqual({ protocolVersion: answered,
          capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: PREAMBLE });
    }
    expect(SERVER_NAME).toBe("intellidrugs-qa");
    expect(SERVER_VERSION).toBe("1.1.0");
  });

  it("initialize without a string protocolVersion is -32602 Invalid params (HTTP 200)", async () => {
    for (const params of [undefined, null, [], {}, { protocolVersion: 20250618 }]) {
      await expectRpcError(await send(rpc("initialize", params, "a")), 200, -32602, "Invalid params", "a");
    }
  });

  it("ping is {}; ids may be strings or numbers and are echoed", async () => {
    expect(await result(await send(rpc("ping", undefined, "req-1")), "req-1")).toEqual({});
    expect(await result(await send(rpc("ping", undefined, 0)), 0)).toEqual({});
  });

  it("tools/list is exactly the shared list; a cursor is ignored", async () => {
    const expected = TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
      annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));
    expect(await result(await send(rpc("tools/list")))).toEqual({ tools: expected });
    expect(await result(await send(rpc("tools/list", { cursor: "abc" })))).toEqual({ tools: expected });
  });

  it("a notification (no id) and a client response are 202 with no body", async () => {
    for (const body of [rpc("notifications/initialized", undefined, null), rpc("notifications/cancelled", { requestId: 1 }, null),
      rpc("tools/call", { name: "list_batches" }, null),
      JSON.stringify({ jsonrpc: "2.0", id: 9, result: {} }), JSON.stringify({ jsonrpc: "2.0", id: "x", error: { code: 1, message: "m" } })]) {
      const res = await send(body);
      expect(res.status).toBe(202);
      expectMcpHeaders(res, false);
      expect(await res.text()).toBe("");
    }
    expect(reads).toEqual([]);
    expect(spies.answerQa).not.toHaveBeenCalled();
  });

  it("an unknown method is -32601 Method not found", async () => {
    for (const m of ["resources/subscribe", "resources/unsubscribe", "prompts/list", "tools/delete", "sampling/createMessage", ""]) {
      await expectRpcError(await send(rpc(m, undefined, 3)), 200, -32601, "Method not found", 3);
    }
  });

  it("tools/call without a string name or with non-object arguments is -32602", async () => {
    for (const params of [undefined, null, {}, { name: 1 }, { name: "list_batches", arguments: [] },
      { name: "list_batches", arguments: null }, { name: "list_batches", arguments: "x" }]) {
      await expectRpcError(await send(rpc("tools/call", params, 4)), 200, -32602, "Invalid params", 4);
    }
    expect(reads).toEqual([]);
  });

  it("a thrown error is -32603 Internal error with HTTP 200 and no detail", async () => {
    spies.answerQa.mockImplementationOnce(async () => { throw new Error("secret detail"); });
    const res = await callTool("list_batches");
    await expectRpcError(res, 200, -32603, "Internal error", 1);
  });
});

describe("tools/call through the shared QA query code (§7.10.5)", () => {
  const CASES: [string, Record<string, unknown>, Record<string, unknown>, string, string][] = [
    ["list_batches", {}, { route: "batches" }, "batches", "/api/qa/v1/batches"],
    ["get_batch", { batchId: "0001-pilot" }, { route: "batch", batchId: "0001-pilot" }, "batch", "/api/qa/v1/batches/0001-pilot"],
    ["get_record", { batchId: "0001-pilot", conceptId: "186-0030-006--napa" },
      { route: "record", batchId: "0001-pilot", conceptId: "186-0030-006--napa" }, "record",
      "/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa"],
    ["find_records", { filter: "stage_warn" }, { route: "records", filter: "stage_warn", page: 0 }, "records",
      "/api/qa/v1/records?filter=stage_warn"],
    ["get_pairs", { bdsId: "BDS-000003", page: 1 }, { route: "pairs", bdsId: "BDS-000003", page: 1 }, "pairs",
      "/api/qa/v1/substances/BDS-000003/pairs?page=1"],
  ];

  it.each(CASES)("%s: answerQa with the mapped input, the GET's qa_read row, the preamble then the indented envelope",
    async (name, args, input, route, getPath) => {
      const r = await result(await callTool(name, args));
      expect(spies.answerQa).toHaveBeenCalledWith(input, "checker", RID);
      expect(siteCalls).toEqual([]);
      expect(r.isError).toBeUndefined();
      expect(r.content).toHaveLength(2);
      expect(r.content[0]).toEqual({ type: "text", text: PREAMBLE });
      expect(r.content[1].type).toBe("text");
      const env = JSON.parse(r.content[1].text);
      expect(r.content[1].text).toBe(JSON.stringify(env, null, 2));
      expect(env.success).toBe(true);
      expect(env.metadata.requestId).toBe(RID);
      const mcpRow = audits.at(-1);
      expect(mcpRow).toEqual({ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: `checker/${route}`,
        outcome: "ok", requestId: RID });

      // The equivalent GET answers the same data and writes the same row.
      const handler = { batches: batchesGET, batch: batchGET, record: recordGET, records: recordsGET, pairs: pairsGET }[route]!;
      const get = await handler(new Request(`http://localhost${getPath}`,
        { headers: { authorization: `Bearer ${KEY}`, "x-request-id": RID } }));
      const getBody = await get.json();
      expect(env.data).toEqual(getBody.data);
      expect({ ...env, metadata: null }).toEqual({ ...getBody, metadata: null });
      expect(audits.at(-1)).toEqual(mcpRow);
    });

  it.each([
    ["a 404", () => new Response(JSON.stringify({ success: false, errors: [{ field: "batchId", code: "NOT_FOUND" }] }), { status: 404 }),
      "QA API error 404 NOT_FOUND", "not_found"],
    ["an API 400", () => new Response(JSON.stringify({ success: false, errors: [{ field: "page", code: "INVALID_QUERY" }] }), { status: 400 }),
      "QA API error 400 INVALID_QUERY", "invalid_query"],
    ["an API failure", () => new Response("<html>", { status: 500 }), "QA API error 502 UNAVAILABLE", "unavailable"],
  ] as [string, () => Response, string, string][])("%s is a tool error: the preamble, then the status and code", async (_n, answer, text, outcome) => {
    upstream = answer;
    const r = await result(await callTool("get_batch", { batchId: "0001-pilot" }));
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: PREAMBLE }, { type: "text", text }] });
    expect(audits).toEqual([expect.objectContaining({ targetId: "checker/batch", outcome })]);
  });

  it("a 200 whose row cannot be written is the 502 tool error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) =>
      url.endsWith("/v1/audit-events") && init.method === "POST" ? new Response("{}", { status: 500 }) : defaultUpstream(url.replace("http://api:8080", ""))));
    const r = await result(await callTool("list_batches"));
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: PREAMBLE }, { type: "text", text: "QA API error 502 UNAVAILABLE" }] });
  });

  it("a refused input is \"Invalid input {name}\" with an invalid_query row for the tool's route, and no read", async () => {
    for (const [name, args, field, route] of [
      ["get_batch", { batchId: ".." }, "batchId", "batch"],
      ["get_record", { batchId: "0001-pilot", conceptId: "a\uD800" }, "conceptId", "record"],
      ["find_records", { filter: "stage_fail", stage: "ddinter" }, "stage", "records"],
      ["get_pairs", { bdsId: "BDS-000003", size: 5 }, "size", "pairs"],
      ["list_batches", { page: 1 }, "page", "batches"],
    ] as [string, Record<string, unknown>, string, string][]) {
      audits = [];
      const r = await result(await callTool(name, args));
      expect(r).toEqual({ isError: true, content: [{ type: "text", text: PREAMBLE }, { type: "text", text: `Invalid input ${field}` }] });
      expect(audits).toEqual([{ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route", targetId: `checker/${route}`,
        outcome: "invalid_query", requestId: RID }]);
    }
    expect(reads).toEqual([]);
    expect(spies.answerQa).not.toHaveBeenCalled();
  });

  it("an unknown tool is \"Unknown tool\" with no row", async () => {
    const r = await result(await callTool("delete_record", {}));
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: PREAMBLE }, { type: "text", text: "Unknown tool" }] });
    expect(audits).toEqual([]);
  });

  it("arguments may be absent", async () => {
    expect((await result(await callTool("list_batches"))).isError).toBeUndefined();
  });
});

describe("the QA guide (§7.11, §11.1 \"Hosted guide\")", () => {
  const row = (outcome: string) => ({ event: "qa_read", actorEmail: null, actorRole: null, targetType: "qa_route",
    targetId: "checker/guide", outcome, requestId: RID });
  const guideText = (topic: (typeof GUIDE_TOPICS)[number] | null) =>
    ({ content: [{ type: "text", text: PREAMBLE }, { type: "text", text: JSON.stringify(guideBody(topic), null, 2) }] });

  it("tools/list has six tools, get_qa_guide last", async () => {
    const { tools } = await result(await send(rpc("tools/list")));
    expect(tools.map((t: { name: string }) => t.name)).toEqual(["list_batches", "get_batch", "get_record", "find_records", "get_pairs",
      "get_qa_guide"]);
  });

  it("get_qa_guide with no arguments, {} or each topic: the preamble, then the guide JSON, with a guide row; no internal read", async () => {
    for (const [args, topic] of [[undefined, null], [{}, null], ...GUIDE_TOPICS.map((t) => [{ topic: t }, t])] as
      [Record<string, unknown> | undefined, (typeof GUIDE_TOPICS)[number] | null][]) {
      audits = [];
      expect(await result(await callTool("get_qa_guide", args))).toEqual(guideText(topic));
      expect(audits).toEqual([row("ok")]);
    }
    expect(reads).toEqual([]);
    expect(spies.answerQa).not.toHaveBeenCalled();
  });

  it("a refused input is \"Invalid input {field}\" with an invalid_query guide row, an unknown input first", async () => {
    for (const [args, field] of [[{ topic: "nope" }, "topic"], [{ topic: "Overview" }, "topic"], [{ topic: null }, "topic"],
      [{ topic: 1 }, "topic"], [{ x: 1, topic: "nope" }, "x"], [{ topic: "checks", page: 0 }, "page"]] as [Record<string, unknown>, string][]) {
      audits = [];
      expect(await result(await callTool("get_qa_guide", args)))
        .toEqual({ isError: true, content: [{ type: "text", text: PREAMBLE }, { type: "text", text: `Invalid input ${field}` }] });
      expect(audits).toEqual([row("invalid_query")]);
    }
    expect(reads).toEqual([]);
  });

  it("resources/list is the six topics; resources/templates/list is empty; neither writes a row; a cursor is ignored", async () => {
    expect(await result(await send(rpc("resources/list")))).toEqual({ resources: guideResources() });
    expect(await result(await send(rpc("resources/list", { cursor: "abc" })))).toEqual({ resources: guideResources() });
    expect(guideResources().map((r) => r.uri)).toEqual(GUIDE_TOPICS.map((t) => `intellidrugs://qa-guide/${t}`));
    expect(await result(await send(rpc("resources/templates/list")))).toEqual({ resourceTemplates: [] });
    expect(audits).toEqual([]);
    expect(reads).toEqual([]);
  });

  it("resources/read of each uri is its Markdown text, with a guide row", async () => {
    for (const t of GUIDE_TOPICS) {
      audits = [];
      const uri = `intellidrugs://qa-guide/${t}`;
      expect(await result(await send(rpc("resources/read", { uri }))))
        .toEqual({ contents: [{ uri, mimeType: "text/markdown", text: GUIDE[t].text }] });
      expect(audits).toEqual([row("ok")]);
    }
    expect(reads).toEqual([]);
  });

  it("an unknown uri is HTTP 200, -32002 Resource not found with no data, and a not_found guide row", async () => {
    for (const uri of ["intellidrugs://qa-guide/OVERVIEW", "intellidrugs://qa-guide/overview/", "intellidrugs://qa-guide/overview?x=1",
      "intellidrugs://qa-guide/", "intellidrugs://qa-guide", "file:///etc/passwd", ""]) {
      audits = [];
      const res = await send(rpc("resources/read", { uri }, 7));
      await expectRpcError(res, 200, -32002, "Resource not found", 7);
      expect(audits).toEqual([row("not_found")]);
    }
  });

  it("resources/read without a string params.uri is -32602 Invalid params, with no row", async () => {
    for (const params of [undefined, null, [], {}, { uri: 1 }, { uri: null }]) {
      await expectRpcError(await send(rpc("resources/read", params, 8)), 200, -32602, "Invalid params", 8);
    }
    expect(audits).toEqual([]);
  });

  it("with the audit write failing, every guide answer still succeeds (best effort)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) =>
      url.endsWith("/v1/audit-events") && init.method === "POST" ? new Response("{}", { status: 500 }) : defaultUpstream(url.replace("http://api:8080", ""))));
    expect(await result(await callTool("get_qa_guide", { topic: "checks" }))).toEqual(guideText("checks"));
    expect(await result(await send(rpc("resources/read", { uri: "intellidrugs://qa-guide/sources" }))))
      .toEqual({ contents: [{ uri: "intellidrugs://qa-guide/sources", mimeType: "text/markdown", text: GUIDE.sources.text }] });
    expect((await result(await callTool("get_qa_guide", { topic: "nope" }))).isError).toBe(true);
    await expectRpcError(await send(rpc("resources/read", { uri: "intellidrugs://qa-guide/nope" })), 200, -32002, "Resource not found", 1);
  });

  it("guide requests and data requests share the key's limit: the 61st in a minute, mixing both, is 429", async () => {
    for (let i = 0; i < 20; i++) await callTool("get_qa_guide");
    for (let i = 0; i < 20; i++) await send(rpc("resources/read", { uri: "intellidrugs://qa-guide/pitfalls" }));
    for (let i = 0; i < 10; i++) await send(rpc("resources/list"));
    for (let i = 0; i < 10; i++) expect((await batchesGET(new Request("http://localhost/api/qa/v1/batches",
      { headers: { authorization: `Bearer ${KEY}`, "x-request-id": RID } }))).status).toBe(200);
    await expectRpcError(await callTool("get_qa_guide"), 429, -32003, "Too many requests");
    await expectRpcError(await send(rpc("resources/read", { uri: "intellidrugs://qa-guide/pitfalls" })), 429, -32003, "Too many requests");
  });

  it("a DB key's guide rows carry its key label", async () => {
    await result(await callTool("get_qa_guide", { topic: "overview" }, { key: DB_KEY }));
    expect(audits.at(-1)).toEqual({ ...row("ok"), targetId: "key.12/guide" });
  });
});

describe("never leaked (§7.10.6, §7.9.7)", () => {
  it("no answer carries the key, its hash, the owner's email, a note or the request headers; logs are the request line only", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const bodies: string[] = [];
    const toolBodies: string[] = [];
    const keep = async (res: Response, tool = false) => {
      const text = await res.text();
      bodies.push(JSON.stringify([...res.headers]), text);
      if (tool) toolBodies.push(text);
    };
    await keep(await send(rpc("initialize", { protocolVersion: "2025-11-25" }), { key: DB_KEY }));
    await keep(await send(rpc("tools/list"), { key: DB_KEY }));
    for (const [name, args] of [["list_batches", {}], ["get_batch", { batchId: "0001-pilot" }],
      ["get_record", { batchId: "0001-pilot", conceptId: "186-0030-006--napa" }], ["find_records", { filter: "stage_warn" }],
      ["get_pairs", { bdsId: "BDS-000003" }], ["get_batch", { batchId: ".." }], ["nope", {}], ["get_qa_guide", {}],
      ["get_qa_guide", { topic: "nope" }]] as [string, unknown][]) {
      await keep(await callTool(name, args, { key: DB_KEY }), true);
    }
    await keep(await send(rpc("ping"), { key: "u".repeat(40) }));
    const all = bodies.join("\n");
    for (const s of [DB_KEY, sha(DB_KEY), KEY, sha(KEY), OWNER, "x-forwarded-for", "203.0.113.9"]) expect(all).not.toContain(s);
    // initialize's serverInfo has a protocol "version"; the tool bodies carry no version token, note, email or hash.
    for (const s of SENTINELS.filter((x) => x !== "\"note\"")) expect(toolBodies.join("\n"), s).not.toContain(s);
    const lines = log.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines.every((l) => l.msg === "request" && l.route === "/api/qa/mcp" && l.method === "POST")).toBe(true);
    const logged = JSON.stringify(lines);
    for (const s of [DB_KEY, KEY, OWNER, "tools/call", "get_batch", "0001-pilot", "key.12"]) expect(logged).not.toContain(s);
  });
});
