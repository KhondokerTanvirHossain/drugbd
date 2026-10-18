import { describe, expect, it } from "vitest";
import { TIMEOUT_MS } from "../src/client.js";
import { PREAMBLE } from "../src/preamble.js";
import { callTool } from "../src/server.js";
import { BATCH, BATCHES, CONFIG, KEY, PAIRS, PREAMBLE_TEXT, RECORDS, envelope, errorEnvelope, jsonResponse, mockFetch } from "./helpers.js";

type Result = Awaited<ReturnType<typeof callTool>>;
const texts = (r: Result) => r.content.map((c) => (c.type === "text" ? c.text : `<${c.type}>`));

/** The result never carries the key, whatever happened. */
function expectNoKey(r: Result) {
  expect(JSON.stringify(r)).not.toContain(KEY);
}

function expectRefusal(r: Result, field: string) {
  expect(r.isError).toBe(true);
  expect(texts(r)).toEqual([PREAMBLE_TEXT, `Invalid input ${field}`]);
  expectNoKey(r);
}

describe("the preamble (§7.9.8 Result)", () => {
  it("is verbatim", () => {
    expect(PREAMBLE).toBe(PREAMBLE_TEXT);
  });
});

describe("tool calls: URL, path encoding, headers (§7.9.8)", () => {
  it.each([
    ["list_batches", {}, "https://drugdb.eliooo.org/api/qa/v1/batches"],
    ["list_batches", undefined, "https://drugdb.eliooo.org/api/qa/v1/batches"],
    ["get_batch", { batchId: "0001-pilot" }, "https://drugdb.eliooo.org/api/qa/v1/batches/0001-pilot"],
    ["get_batch", { batchId: "dgda-register_2026.10" }, "https://drugdb.eliooo.org/api/qa/v1/batches/dgda-register_2026.10"],
    ["get_record", { batchId: "0001-pilot", conceptId: "186-0030-006--napa" },
      "https://drugdb.eliooo.org/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa"],
    // A real register id with "(" (§7.9.2), and ids that need encoding: each stays inside its own path segment.
    ["get_record", { batchId: "0002", conceptId: "040-090(-077--mectigen-vet-oral-solution" },
      "https://drugdb.eliooo.org/api/qa/v1/batches/0002/records/040-090(-077--mectigen-vet-oral-solution"],
    ["get_record", { batchId: "0002", conceptId: "a/b?c#d e%2F..\\" },
      "https://drugdb.eliooo.org/api/qa/v1/batches/0002/records/a%2Fb%3Fc%23d%20e%252F..%5C"],
    ["get_record", { batchId: "0002", conceptId: "নাপা" },
      "https://drugdb.eliooo.org/api/qa/v1/batches/0002/records/%E0%A6%A8%E0%A6%BE%E0%A6%AA%E0%A6%BE"],
    ["get_record", { batchId: "0002", conceptId: "..." }, "https://drugdb.eliooo.org/api/qa/v1/batches/0002/records/..."],
    ["find_records", { filter: "strength_missing" }, "https://drugdb.eliooo.org/api/qa/v1/records?filter=strength_missing"],
    ["find_records", { filter: "stage_warn", stage: "ddinter", batch: "0001-pilot", page: 3 },
      "https://drugdb.eliooo.org/api/qa/v1/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=3"],
    ["find_records", { page: 0, batch: "0003", filter: "unaligned" },
      "https://drugdb.eliooo.org/api/qa/v1/records?filter=unaligned&batch=0003&page=0"],
    ["get_pairs", { bdsId: "BDS-000003" }, "https://drugdb.eliooo.org/api/qa/v1/substances/BDS-000003/pairs"],
    ["get_pairs", { bdsId: "BDS-000003", page: 999 }, "https://drugdb.eliooo.org/api/qa/v1/substances/BDS-000003/pairs?page=999"],
  ])("%s %j → GET %s with the Bearer key, redirect error and a timeout", async (name, args, url) => {
    const m = mockFetch();
    const r = await callTool(CONFIG, name, args as Record<string, unknown> | undefined, { fetch: m.fetch });
    expect(r.isError).toBeFalsy();
    expect(m.calls).toHaveLength(1);
    const [call] = m.calls;
    expect(call!.url).toBe(url);
    expect(call!.init.method).toBe("GET");
    expect(call!.init.redirect).toBe("error");
    expect(call!.init.signal).toBeInstanceOf(AbortSignal);
    expect(call!.init.body).toBeUndefined();
    const headers = new Headers(call!.init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("accept")).toBe("application/json");
    expect([...headers.keys()].sort()).toEqual(["accept", "authorization"]);
    expectNoKey(r);
  });

  it("uses the configured origin (local testing)", async () => {
    const m = mockFetch();
    await callTool({ key: KEY, origin: "http://localhost:3000" }, "get_batch", { batchId: "0001-pilot" }, { fetch: m.fetch });
    expect(m.calls[0]!.url).toBe("http://localhost:3000/api/qa/v1/batches/0001-pilot");
  });

  it("uses the global fetch when none is injected", async () => {
    const m = mockFetch();
    const saved = globalThis.fetch;
    globalThis.fetch = m.fetch;
    try {
      await callTool(CONFIG, "list_batches", {});
    } finally {
      globalThis.fetch = saved;
    }
    expect(m.calls).toHaveLength(1);
  });

  it("the timeout is 30 seconds", () => {
    expect(TIMEOUT_MS).toBe(30_000);
  });
});

describe("success results", () => {
  it.each([
    ["list_batches", {}, BATCHES],
    ["get_batch", { batchId: "0001-pilot" }, BATCH],
    ["find_records", { filter: "stage_warn", stage: "ddinter" }, RECORDS],
    ["get_pairs", { bdsId: "BDS-000003" }, PAIRS],
  ])("%s: the preamble first, then the envelope unchanged as indented JSON", async (name, args, data) => {
    const body = envelope(data);
    const m = mockFetch(() => jsonResponse(body));
    const r = await callTool(CONFIG, name, args, { fetch: m.fetch });
    expect(r.isError).toBeFalsy();
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: JSON.stringify(body, null, 2) }]);
  });

  it("a record body (QaRecord) is passed through whole, field for field", async () => {
    const record = { batchId: "0001-pilot", conceptId: "186-0030-006--napa", displayStatus: "pending",
      source: { json: { brand_name: "Napa", generic: "Paracetamol 500mg" }, url: "https://dgda.gov.bd/x",
        link: { url: "https://dgda.gov.bd/x", label: "DGDA register (OCL)", fetchedAt: null } },
      stages: [{ stage: "clinical", status: "warn", notes: [], textMissing: [], evidence: { parsed: [{ strength_value: null }] } }] };
    const body = envelope(record);
    const m = mockFetch(() => jsonResponse(body));
    const r = await callTool(CONFIG, "get_record", { batchId: "0001-pilot", conceptId: "186-0030-006--napa" }, { fetch: m.fetch });
    expect(JSON.parse(texts(r)[1]!)).toEqual(body);
  });
});

describe("schema refusals (§7.9.2): no call is made", () => {
  const long = (n: number) => "a".repeat(n);
  it.each([
    // unknown or misplaced inputs
    ["list_batches", { batchId: "0001" }, "batchId"],
    ["get_batch", { batchId: "0001", page: 0 }, "page"],
    ["get_record", { batchId: "0001", conceptId: "x", extra: true }, "extra"],
    ["find_records", { filter: "parse_partial", sort: "asc" }, "sort"],
    ["get_pairs", { bdsId: "BDS-000003", filter: "x" }, "filter"],
    // batchId / batch: ^[A-Za-z0-9._-]{1,100}$
    ["get_batch", {}, "batchId"],
    ["get_batch", { batchId: "" }, "batchId"],
    ["get_batch", { batchId: long(101) }, "batchId"],
    ["get_batch", { batchId: "0001 pilot" }, "batchId"],
    ["get_batch", { batchId: "0001/pilot" }, "batchId"],
    ["get_batch", { batchId: "0001%2F" }, "batchId"],
    ["get_batch", { batchId: 1 }, "batchId"],
    ["get_batch", { batchId: null }, "batchId"],
    // a dot segment can never be addressed over HTTP (URL parsers collapse it), so it is refused here
    ["get_batch", { batchId: "." }, "batchId"],
    ["get_batch", { batchId: ".." }, "batchId"],
    ["get_record", { batchId: "..", conceptId: "x" }, "batchId"],
    ["find_records", { filter: "unaligned", batch: "a b" }, "batch"],
    ["find_records", { filter: "unaligned", batch: "" }, "batch"],
    ["find_records", { filter: "unaligned", batch: long(101) }, "batch"],
    // conceptId: isPathId (1–200 characters, no control character)
    ["get_record", { batchId: "0001" }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: "" }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: long(201) }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: "a\u0000b" }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: "a\nb" }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: "a\u001Fb" }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: "a\u007Fb" }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: "." }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: ".." }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: "a\uD800b" }, "conceptId"],
    ["get_record", { batchId: "0001", conceptId: 42 }, "conceptId"],
    // the batch id is checked before the concept id, as the route does
    ["get_record", { batchId: "bad id", conceptId: "" }, "batchId"],
    // bdsId: ^BDS-[0-9]{6}$
    ["get_pairs", {}, "bdsId"],
    ["get_pairs", { bdsId: "BDS-00003" }, "bdsId"],
    ["get_pairs", { bdsId: "BDS-0000031" }, "bdsId"],
    ["get_pairs", { bdsId: "bds-000003" }, "bdsId"],
    ["get_pairs", { bdsId: "BDS-00000a" }, "bdsId"],
    ["get_pairs", { bdsId: " BDS-000003" }, "bdsId"],
    ["get_pairs", { bdsId: "BDS-000003\n" }, "bdsId"],
    // filter: one of the seven
    ["find_records", {}, "filter"],
    ["find_records", { filter: "" }, "filter"],
    ["find_records", { filter: "STAGE_WARN" }, "filter"],
    ["find_records", { filter: "unknown" }, "filter"],
    ["find_records", { filter: ["stage_warn"] }, "filter"],
    // stage: one of four, only with stage_warn
    ["find_records", { filter: "stage_fail", stage: "dgda" }, "stage"],
    ["find_records", { filter: "parse_partial", stage: "ddinter" }, "stage"],
    ["find_records", { filter: "stage_warn", stage: "review" }, "stage"],
    ["find_records", { filter: "stage_warn", stage: "" }, "stage"],
    ["find_records", { filter: "stage_warn", stage: null }, "stage"],
    // page: integer 0–999
    ["find_records", { filter: "unaligned", page: -1 }, "page"],
    ["find_records", { filter: "unaligned", page: 1000 }, "page"],
    ["find_records", { filter: "unaligned", page: 1.5 }, "page"],
    ["find_records", { filter: "unaligned", page: "1" }, "page"],
    ["find_records", { filter: "unaligned", page: Number.NaN }, "page"],
    ["get_pairs", { bdsId: "BDS-000003", page: -1 }, "page"],
    ["get_pairs", { bdsId: "BDS-000003", page: 1000 }, "page"],
    ["get_pairs", { bdsId: "BDS-000003", page: "0" }, "page"],
    ["get_pairs", { bdsId: "BDS-000003", page: null }, "page"],
  ])("%s %j is refused for %s", async (name, args, field) => {
    const m = mockFetch();
    const r = await callTool(CONFIG, name, args as Record<string, unknown>, { fetch: m.fetch });
    expectRefusal(r, field);
    expect(m.calls).toEqual([]);
  });

  it("checks the find_records inputs in the route's order: unknown, filter, stage, batch, page", async () => {
    const m = mockFetch();
    const bad = { page: -1, batch: "a b", stage: "x", filter: "nope" };
    expectRefusal(await callTool(CONFIG, "find_records", { ...bad, zzz: 1 }, { fetch: m.fetch }), "zzz");
    expectRefusal(await callTool(CONFIG, "find_records", bad, { fetch: m.fetch }), "filter");
    expectRefusal(await callTool(CONFIG, "find_records", { ...bad, filter: "stage_warn" }, { fetch: m.fetch }), "stage");
    expectRefusal(await callTool(CONFIG, "find_records", { ...bad, filter: "stage_warn", stage: "dgda" }, { fetch: m.fetch }), "batch");
    expectRefusal(await callTool(CONFIG, "find_records", { ...bad, filter: "stage_warn", stage: "dgda", batch: "b" }, { fetch: m.fetch }),
      "page");
    expect(m.calls).toEqual([]);
  });

  it("a refused input name is capped, so a refusal stays small", async () => {
    const m = mockFetch();
    const r = await callTool(CONFIG, "list_batches", { ["x".repeat(500)]: 1 }, { fetch: m.fetch });
    expectRefusal(r, "x".repeat(100));
  });

  it("an unknown tool is an error with the preamble, and no call", async () => {
    const m = mockFetch();
    const r = await callTool(CONFIG, "approve_record", {}, { fetch: m.fetch });
    expect(r.isError).toBe(true);
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "Unknown tool"]);
    expect(m.calls).toEqual([]);
  });
});

describe("error results (§7.9.8 Errors)", () => {
  it.each([
    [400, "INVALID_QUERY", "batch"],
    [401, "UNAUTHORIZED", null],
    [404, "NOT_FOUND", "conceptId"],
    [429, "RATE_LIMITED", null],
    [502, "UNAVAILABLE", null],
  ])("%i %s: the preamble, then 'QA API error {status} {code}'", async (status, code, field) => {
    const m = mockFetch(() => jsonResponse(errorEnvelope(code, field), status));
    const r = await callTool(CONFIG, "get_record", { batchId: "0001-pilot", conceptId: "x" }, { fetch: m.fetch });
    expect(r.isError).toBe(true);
    expect(texts(r)).toEqual([PREAMBLE_TEXT, `QA API error ${status} ${code}`]);
    expectNoKey(r);
  });

  it("the middleware's plain-text per-IP 429 is 'QA API error 429'", async () => {
    const m = mockFetch(() => new Response("Too Many Requests", { status: 429, headers: { "Content-Type": "text/plain" } }));
    const r = await callTool(CONFIG, "list_batches", {}, { fetch: m.fetch });
    expect(r.isError).toBe(true);
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "QA API error 429"]);
  });

  it.each([
    ["an empty body", ""],
    ["a JSON array", "[]"],
    ["an envelope with no errors", JSON.stringify({ success: false, data: null, message: "x", errors: [] })],
    ["an error code that is not a code", JSON.stringify({ success: false, errors: [{ code: "x y\nQA API error 200" }] })],
    ["a success flag on an error status", JSON.stringify(envelope({}))],
  ])("an error status with %s is 'QA API error {status}'", async (_n, text) => {
    const m = mockFetch(() => new Response(text, { status: 503 }));
    const r = await callTool(CONFIG, "list_batches", {}, { fetch: m.fetch });
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "QA API error 503"]);
  });

  it.each([
    ["HTML", "<!doctype html><title>Login</title>"],
    ["an empty body", ""],
    ["JSON that is not the envelope", JSON.stringify({ batches: [] })],
    ["the error envelope", JSON.stringify(errorEnvelope("UNAVAILABLE"))],
    ["an envelope without data", JSON.stringify({ success: true, message: "OK", errors: [] })],
    ["an envelope whose errors is not a list", JSON.stringify({ success: true, data: {}, message: "OK", errors: null })],
    ["null", "null"],
  ])("a 200 whose body is %s is 'QA API error 200 invalid response'", async (_n, text) => {
    const m = mockFetch(() => new Response(text, { status: 200 }));
    const r = await callTool(CONFIG, "list_batches", {}, { fetch: m.fetch });
    expect(r.isError).toBe(true);
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "QA API error 200 invalid response"]);
  });

  it("a network error is 'QA API unreachable', and the error's own text (even one quoting the key) never surfaces", async () => {
    const m = mockFetch(() => { throw new TypeError(`fetch failed: Bearer ${KEY}`); });
    const r = await callTool(CONFIG, "list_batches", {}, { fetch: m.fetch });
    expect(r.isError).toBe(true);
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "QA API unreachable"]);
    expectNoKey(r);
  });

  it("a refused redirect (redirect: error makes fetch reject) is 'QA API unreachable'", async () => {
    const m = mockFetch((_u, init) => {
      if (init.redirect === "error") throw new TypeError("fetch failed: unexpected redirect");
      return jsonResponse(envelope({}));
    });
    const r = await callTool(CONFIG, "list_batches", {}, { fetch: m.fetch });
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "QA API unreachable"]);
  });

  it("a timeout is 'QA API unreachable'", async () => {
    const m = mockFetch((_u, init) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
    }));
    const r = await callTool(CONFIG, "list_batches", {}, { fetch: m.fetch, timeoutMs: 20 });
    expect(r.isError).toBe(true);
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "QA API unreachable"]);
  });

  it("a body that fails while being read is 'QA API unreachable'", async () => {
    const body = new ReadableStream({ start(c) { c.error(new Error(`reset ${KEY}`)); } });
    const m = mockFetch(() => new Response(body, { status: 200 }));
    const r = await callTool(CONFIG, "list_batches", {}, { fetch: m.fetch });
    expect(texts(r)).toEqual([PREAMBLE_TEXT, "QA API unreachable"]);
    expectNoKey(r);
  });
});
