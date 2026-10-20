import { createHash, randomBytes } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * §5.18 section 3, §11.1 "Reference accuracy" (QA API reference, D72): the /review/qa API reference is pinned to the code it
 * documents. (a) every example answer is what the real route handler (or the hosted MCP server) answers for the panel's own
 * command, and its shape is the mappers' shape; (b) every documented rule equals the validators' constants and behaviour;
 * (c) no example, command or body carries an email, a person, a note, a token or a key; and the code text keeps its budget.
 */

// One clock for the process-wide limits, so each test starts with fresh windows (§7.9.1).
const clock = vi.hoisted(() => ({ now: 7_000_000_000 }));
vi.mock("@/lib/limits", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/limits")>();
  return { ...m, LIMITS: m.createLimits(() => clock.now) };
});
/** The internal API: qaUpstream answers by the test's `upstream`; verifyQaKey by `verify`. */
const api = vi.hoisted(() => ({
  upstream: (_path: string): unknown => ({ ok: false, status: 0, field: null }),
  verify: (_hash: string): unknown => ({ ok: false, status: 404 }),
  paths: [] as string[],
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/api")>();
  return { ...m, qaUpstream: async (path: string) => { api.paths.push(path); return api.upstream(path); },
    verifyQaKey: async (hash: string) => api.verify(hash) };
});
vi.mock("@/lib/audit", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/audit")>();
  return { ...m, recordAudit: async () => true };
});
const spies = vi.hoisted(() => ({ answerQa: null as unknown as ReturnType<typeof import("vitest").vi.fn> }));
vi.mock("@/lib/qa-query", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/qa-query")>();
  const { vi: v } = await import("vitest");
  spies.answerQa = v.fn(m.answerQa);
  return { ...m, answerQa: spies.answerQa };
});

import { GET as batchesGET } from "@/app/api/qa/v1/batches/route";
import { GET as batchGET } from "@/app/api/qa/v1/batches/[batchId]/route";
import { GET as recordGET } from "@/app/api/qa/v1/batches/[batchId]/records/[conceptId]/route";
import { GET as recordsGET } from "@/app/api/qa/v1/records/route";
import { GET as pairsGET } from "@/app/api/qa/v1/substances/[bdsId]/pairs/route";
import { GET as restGET } from "@/app/api/qa/[[...rest]]/route";
import { GET as mcpGET, POST as mcpPOST } from "@/app/api/qa/mcp/route";
import ApiReference from "@/app/review/qa/ApiReference";
import { QA_RATE_LIMIT } from "@/lib/limits";
import { ID_MAX } from "@/lib/public-params";
import { qaKeysForTests } from "@/lib/qa-api";
import * as EX from "@/lib/qa-api-examples";
import { EXAMPLE_NULLS, KEY_VARIABLE, codeBlocks, qaReference, type RefEndpoint } from "@/lib/qa-api-reference";
import { QA_PAIRS_SIZE, QA_RECORDS_SIZE, mapBatch, mapBatches, mapPairs, mapRecord, mapRecords } from "@/lib/qa-map";
import { DEFAULT_PROTOCOL_VERSION, MCP_MAX_BODY } from "@/lib/qa-mcp";
import { GUIDE, GUIDE_TOPICS, GUIDE_URI_PREFIX, guideResources } from "@/lib/qa-guide";
import { SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS, TOOL_ROUTES } from "@/lib/qa-mcp-tools";
import { BATCH_ID, BDS_ID, PAGE_MAX, QA_FILTERS, QA_STAGES, type QaRoute } from "@/lib/qa-query";
import { apiBatchItems, apiBatches, apiRecord, apiRecords, apiSubstance } from "./fixtures/qa";
import type { StageKey } from "@/lib/review-types";

const WEB = join(__dirname, "..");
const HOST = "drugdb.example.org";
const KEY = randomBytes(32).toString("base64url");   // a test key, generated here; never in the reference
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const REF = qaReference(HOST);
const ROUTES: QaRoute[] = ["batches", "batch", "record", "records", "pairs"];
const endpoint = (route: QaRoute): RefEndpoint => REF.endpoints.find((e) => e.route === route)!;
type Handler = (r: Request) => Promise<Response>;
const HANDLERS: Record<QaRoute, Handler> = { batches: batchesGET, batch: batchGET, record: recordGET, records: recordsGET, pairs: pairsGET };
/** The internal read each panel's example body stands for (lib/api.ts qaPath), for the command's ids and query. */
const UPSTREAM_PATH: Record<QaRoute, string> = {
  batches: "/v1/review/batches",
  batch: "/v1/qa/batches/0001-pilot/items",
  record: "/v1/review/batches/0001-pilot/items/186-0030-006--napa",
  records: "/v1/qa/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=0",
  pairs: "/v1/review/substances/BDS-000003?pairs=all&page=0&size=50",
};

const okUpstream = (route: QaRoute) => () => ({ ok: true, data: structuredClone(endpoint(route).example.upstream) });

beforeEach(() => {
  clock.now += 3_600_000;
  qaKeysForTests.reset();
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("SITE_HOST", HOST);
  vi.stubEnv("QA_API_KEYS", `reference:${sha(KEY)}`);
  api.upstream = () => ({ ok: false, status: 0, field: null });
  api.verify = () => ({ ok: false, status: 404 });
  api.paths = [];
  spies.answerQa.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(EX.EXAMPLE_TIMESTAMP));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

/** A command as curl would send it: its URL, its -H headers in order, and its -d body. */
function parseCurl(text: string) {
  const line = text.replace(/ \\\n\s*/g, " ");
  expect(line.startsWith("curl ")).toBe(true);
  const url = /"(https:\/\/[^"]+)"/.exec(line)![1];
  const headers = [...line.matchAll(/-H "([^"]+)"/g)].map((m) => {
    const at = m[1].indexOf(": ");
    return [m[1].slice(0, at), m[1].slice(at + 2)] as [string, string];
  });
  const body = /-d '([^']*)'/.exec(line)?.[1] ?? null;
  return { url, headers, body };
}
/** The command's headers with the key variable replaced by the test key (the only change a reader makes). */
function sendHeaders(headers: [string, string][]): Record<string, string> {
  const out: Record<string, string> = { "x-request-id": EX.EXAMPLE_REQUEST_ID };
  for (const [name, value] of headers) {
    if (name === "Authorization") {
      expect(value).toBe(`Bearer ${KEY_VARIABLE}`);
      out[name] = `Bearer ${KEY}`;
    } else out[name] = value;
  }
  return out;
}
const get = (route: QaRoute, path: string, headers: Record<string, string> = {}) => HANDLERS[route](new Request(`https://${HOST}${path}`,
  { headers: { authorization: `Bearer ${KEY}`, "x-request-id": EX.EXAMPLE_REQUEST_ID, "x-forwarded-for": "203.0.113.9", ...headers } }));

/** A URL for the endpoint: each path parameter from `values` or its example; the query parameters given, raw, in order. */
function urlFor(e: RefEndpoint, values: Record<string, string> = {}, query: [string, string][] = []): string {
  let path = e.request.slice("GET ".length);
  for (const p of e.params.filter((x) => x.in === "path")) path = path.replace(`{${p.name}}`, values[p.name] ?? p.example);
  return query.length === 0 ? path : `${path}?${query.map(([k, v]) => `${k}=${v}`).join("&")}`;
}
/** The endpoint's required query parameters with their examples: the least a valid URL carries. */
const requiredQuery = (e: RefEndpoint): [string, string][] => e.params.filter((p) => p.in === "query" && p.required).map((p) => [p.name, p.example]);

async function expectError(res: Response, status: number, code: string, field: string | null) {
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.errors).toEqual([{ field, code, message: body.message }]);
}

// ---- key trees (§11.1 "Shape")

/** Opaque values: passed through as stored (pipeline output), so their inner keys are not the API's shape. */
const OPAQUE = new Set(["source.json", "stages[].evidence"]);
type Tree = Map<string, Set<string>>;
/** Every path of a JSON value (`a.b[]` for an array's elements: the union of its elements) with the JSON types seen there. */
function tree(v: unknown, path = "", out: Tree = new Map()): Tree {
  const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  if (path) {
    if (!out.has(path)) out.set(path, new Set());
    out.get(path)!.add(t);
  }
  if (OPAQUE.has(path)) return out;
  if (Array.isArray(v)) for (const e of v) tree(e, `${path}[]`, out);
  else if (t === "object") for (const [k, x] of Object.entries(v as object)) tree(x, path ? `${path}.${k}` : k, out);
  return out;
}
const parentOf = (p: string): string | null => {
  if (p.endsWith("[]")) return p.slice(0, -2);
  const at = p.lastIndexOf(".");
  return at < 0 ? null : p.slice(0, at);
};
/** A path the fixture never reached: its nearest recorded ancestor was only ever null, or an array with no element. */
function unobserved(fixture: Tree, p: string): boolean {
  let a = parentOf(p);
  while (a !== null && !fixture.has(a)) a = parentOf(a);
  if (a === null) return false;
  const types = fixture.get(a)!;
  return [...types].every((t) => t === "null") || (types.has("array") && !fixture.has(`${a}[]`));
}

/** §7.9.3, the field paths of each endpoint's `data`, pinned: a field added, removed or renamed fails until spec, example and test change. */
const PINNED: Record<QaRoute, string[]> = {
  batches: ["batches", "batches[]", "batches[].batchId", "batches[].status", "batches[].itemCount", "batches[].approvedCount", "batches[].runAt"],
  batch: ["batchId", "status", "runAt", "itemCount", "items", "items[]", "items[].conceptId", "items[].tradeName", "items[].displayStatus",
    "items[].stages", "items[].stages[]", "items[].stages[].stage", "items[].stages[].status", "items[].stages[].note"],
  records: ["filter", "stage", "batch", "page", "size", "total", "items", "items[]", "items[].batchId", "items[].conceptId",
    "items[].tradeName", "items[].displayStatus", "items[].stages", "items[].stages.dgda", "items[].stages.substances",
    "items[].stages.clinical", "items[].stages.ddinter"],
  pairs: ["bdsId", "name", "page", "size", "total", "pairs", "pairs[]", "pairs[].ddinterA", "pairs[].ddinterB", "pairs[].entry",
    "pairs[].entry.name", "pairs[].entry.routeScope", "pairs[].partner", "pairs[].partner.bdsId", "pairs[].partner.name",
    "pairs[].partner.entry", "pairs[].partner.entry.name", "pairs[].partner.entry.routeScope", "pairs[].severity", "pairs[].actions",
    "pairs[].actions[]", "pairs[].interaction", "pairs[].management", "pairs[].link", "pairs[].link.url", "pairs[].link.label",
    "pairs[].link.fetchedAt", "pairs[].applies", "pairs[].review", "pairs[].review.state", "pairs[].review.at", "pairs[].changes",
    "pairs[].changes[]", "pairs[].changes[].field", "pairs[].changes[].atReview", "pairs[].changes[].now"],
  record: [],   // filled below: QaRecord is long
};
const LINK = (p: string) => [p, `${p}.url`, `${p}.label`, `${p}.fetchedAt`];
const PARTNERS_IN = (p: string) => [`${p}.partners`, `${p}.partners[]`, `${p}.partners[].conceptId`, `${p}.partners[].tradeName`,
  `${p}.partners[].index`];
const PARTNERS_OTHER = (p: string) => [`${p}.partners`, `${p}.partners[]`, `${p}.partners[].conceptId`, `${p}.partners[].tradeName`,
  `${p}.partners[].batchId`, `${p}.partners[].approved`];
const QA_PAIR = (p: string, other: boolean) => [p, `${p}[]`, ...["ddinterA", "ddinterB", "nameA", "nameB", "substance", "partnerSubstance",
  ...(other ? ["partnerBdsId"] : []), "severity", "actions"].map((k) => `${p}[].${k}`), `${p}[].actions[]`, ...LINK(`${p}[].link`),
  `${p}[].textMissing`, `${p}[].textMissing.interaction`, `${p}[].textMissing.management`, `${p}[].review`, `${p}[].review.state`,
  `${p}[].review.at`, ...(other ? PARTNERS_OTHER(`${p}[]`) : PARTNERS_IN(`${p}[]`)), ...(other ? [`${p}[].partnerCount`] : [])];
const NOT_CHECKED = (p: string, other: boolean) => [p, `${p}[]`, `${p}[].substance`, `${p}[].partnerSubstance`,
  ...(other ? [`${p}[].partnerBdsId`] : []), ...(other ? PARTNERS_OTHER(`${p}[]`) : PARTNERS_IN(`${p}[]`)),
  ...(other ? [`${p}[].partnerCount`] : []), `${p}[].reason`, `${p}[].side`, `${p}[].route`];
const ING = "extraction.ingredients[]";
PINNED.record = [
  "batchId", "conceptId", "displayStatus", "review", "extractedAt", "batch", "batch.status", "batch.runAt", "batch.itemCount",
  "source", "source.json", "source.url", ...LINK("source.link"),
  "extraction", ...["tradeName", "company", "dosageForm", "darNumber", "genericContentRaw", "qualityFlag", "parseStatus", "parseNote"]
    .map((k) => `extraction.${k}`),
  "extraction.dgdaIngredients", "extraction.dgdaIngredients[]", "extraction.dgdaIngredients[].xmCode", "extraction.dgdaIngredients[].name",
  "extraction.ingredients", ING, ...["bdsId", "name", "raw", "strengthValue", "strengthUnit", "perValue", "perUnit"].map((k) => `${ING}.${k}`),
  `${ING}.names`, `${ING}.names[]`, `${ING}.names[].name`, `${ING}.names[].type`, `${ING}.names[].source`,
  `${ING}.coverage`, `${ING}.coverageNote`,
  `${ING}.codes`, `${ING}.codes[]`, ...["system", "code", "routeScope", "method", "confidence"].map((k) => `${ING}.codes[].${k}`),
  ...LINK(`${ING}.codes[].link`),
  `${ING}.ddinter`, `${ING}.ddinter.chosen`, `${ING}.ddinter.chosen[]`,
  ...["ddinterId", "name", "routeScope", "routeAssumed"].map((k) => `${ING}.ddinter.chosen[].${k}`),
  `${ING}.ddinter.entries`, `${ING}.ddinter.entries[]`, ...["ddinterId", "name", "routeScope"].map((k) => `${ING}.ddinter.entries[].${k}`),
  `${ING}.ddinter.entries[].counts`, ...["major", "moderate", "minor", "unknown", "total"].map((k) => `${ING}.ddinter.entries[].counts.${k}`),
  ...LINK(`${ING}.ddinter.entries[].link`),
  "extraction.clinicalDrug", ...["bdcId", "displayName", "doseForm", "route", "signature"].map((k) => `extraction.clinicalDrug.${k}`),
  "ddinterRoute", "ddinterRoute.route", "ddinterRoute.routeAssumed",
  "stages", "stages[]", "stages[].stage", "stages[].status", "stages[].notes", "stages[].notes[]", "stages[].notes[].kind",
  "stages[].notes[].text", "stages[].notes[].ddinterId", "stages[].notes[].route", "stages[].textMissing", "stages[].textMissing[]",
  ...["ddinterA", "nameA", "ddinterB", "nameB", "severity", "inBatch", "partnerScope"].map((k) => `stages[].textMissing[].${k}`),
  "stages[].evidence",
  "pairs", "pairs.inBatch", "pairs.inBatch.totalBatchPairs", ...QA_PAIR("pairs.inBatch.pairs", false), ...NOT_CHECKED("pairs.inBatch.notChecked", false),
  "pairs.otherBatches", "pairs.otherBatches.batches", ...QA_PAIR("pairs.otherBatches.pairs", true),
  ...NOT_CHECKED("pairs.otherBatches.notChecked", true),
  "history", "history[]", "history[].kind", "history[].at", "history[].reason", "history[].role", "history[].decision", "history[].counts",
];
/** The same mapper over the real fixtures of tests/fixtures/qa.ts. */
const FIXTURE_DATA: Record<QaRoute, () => unknown> = {
  batches: () => mapBatches(apiBatches()), batch: () => mapBatch(apiBatchItems()), record: () => mapRecord(apiRecord()),
  records: () => mapRecords(apiRecords()), pairs: () => mapPairs(apiSubstance(), "BDS-000003", 0),
};

// ---- (a)

describe("(a) every example answer is the real answer to its panel's command (§11.1)", () => {
  it.each(ROUTES)("%s: the route handler, fed the example API body, answers the example exactly", async (route) => {
    const e = endpoint(route);
    api.upstream = okUpstream(route);
    const c = parseCurl(e.command.text);
    expect(c.url).toBe(`https://${HOST}${e.example.url}`);
    expect(c.body).toBeNull();
    const res = await HANDLERS[route](new Request(c.url, { headers: sendHeaders(c.headers) }));
    expect(res.status).toBe(200);
    expect(api.paths).toEqual([UPSTREAM_PATH[route]]);
    const body = await res.json();
    expect(body).toEqual(e.example.body);
    expect(e.answer.text).toBe(JSON.stringify(body, null, 2));
  });

  it("the error example is the real answer to filter=nope", async () => {
    const res = await get("records", "/api/qa/v1/records?filter=nope");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual(REF.common.errorBody);
    expect(REF.common.error.text).toBe(JSON.stringify(body, null, 2));
    expect(api.paths).toEqual([]);
  });

  it.each([["initialize", REF.mcp.initialize], ["tools/call", REF.mcp.call], ["resources/list", REF.mcp.guide]] as const)(
    "MCP %s: the hosted server, given the command's method, headers and body, answers the example exactly", async (_n, ex) => {
      api.upstream = okUpstream("batches");
      const c = parseCurl(ex.command.text);
      expect(c.url).toBe(`https://${HOST}/api/qa/mcp`);
      expect(JSON.parse(c.body!)).toEqual(ex.message);
      const res = await mcpPOST(new Request(c.url, { method: "POST", headers: sendHeaders(c.headers), body: c.body }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(ex.body);
      expect(ex.answer.text).toBe(JSON.stringify(body, null, 2));
    });

  it("the initialize example carries the real capabilities and version (§7.10.6, QA guide)", () => {
    const body = REF.mcp.initialize.body as { result: { capabilities: unknown; serverInfo: { version: string } } };
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } });
    expect(body.result.serverInfo.version).toBe(SERVER_VERSION);
    expect(SERVER_VERSION).toBe("1.1.0");
  });

  it("the resources/list example is the six guide topics: uris, titles and summaries, never the guide's text", () => {
    expect(REF.mcp.guide.message).toEqual({ jsonrpc: "2.0", id: 3, method: "resources/list" });
    expect(REF.mcp.guide.body).toEqual({ jsonrpc: "2.0", id: 3, result: { resources: guideResources() } });
    expect(REF.mcp.guide.command.text).toContain('  -H "MCP-Protocol-Version: 2025-11-25" \\');
    expect(REF.mcp.guide.command.region).toBe("Command for resources/list");
    expect(REF.mcp.guide.answer.region).toBe("Answer for resources/list");
    for (const t of GUIDE_TOPICS) expect(REF.mcp.guide.answer.text).not.toContain(GUIDE[t].text.split("\n")[0]);
  });

  it("the tools/call answer's second block is the batches example envelope, indented as the server indents it", () => {
    const body = REF.mcp.call.body as { result: { content: { type: string; text: string }[] } };
    expect(body.result.content.map((c) => c.type)).toEqual(["text", "text"]);
    expect(body.result.content[1].text).toBe(endpoint("batches").answer.text);
  });
});

describe("(a) shape: each example's key tree is the mappers' shape (§11.1)", () => {
  it.each(ROUTES)("%s: the tree equals the pinned §7.9.3 paths", (route) => {
    expect([...tree(endpoint(route).example.body.data).keys()].sort()).toEqual([...PINNED[route]].sort());
  });

  it.each(ROUTES)("%s: the tree agrees with the same mapper's output for the real fixtures", (route) => {
    const ex = tree(endpoint(route).example.body.data), fx = tree(FIXTURE_DATA[route]());
    const history = (p: string) => route === "record" && p.startsWith("history[].");
    for (const p of fx.keys()) if (!history(p)) expect(ex.has(p), `${p}: in the fixture's output, not in the example`).toBe(true);
    for (const p of ex.keys()) {
      if (fx.has(p)) continue;
      expect(unobserved(fx, p), `${p}: in the example, not in the fixture's output`).toBe(true);
    }
    for (const [p, types] of ex) {
      const f = fx.get(p);
      if (!f) continue;
      const a = [...types].filter((t) => t !== "null").sort(), b = [...f].filter((t) => t !== "null").sort();
      if (a.length > 0 && b.length > 0) expect(a, `${p}: JSON types`).toEqual(b);
    }
    if (route === "record") {
      const keys = (t: Tree) => [...t.keys()].filter(history).map((p) => p.slice("history[].".length));
      for (const k of keys(ex)) expect(keys(fx)).toContain(k);
      expect(keys(ex)).toEqual(expect.arrayContaining(["kind", "at", "role", "decision", "counts"]));
    }
  });

  it.each(ROUTES)("%s: a null leaf only at an EXAMPLE_NULLS path, and every array has an element", (route) => {
    const t = tree(endpoint(route).example.body.data);
    const nulls = [...t].filter(([, types]) => types.has("null")).map(([p]) => p);
    expect(nulls.sort()).toEqual([...EXAMPLE_NULLS[route]].sort());
    for (const [p, types] of t) if (types.has("array")) expect(t.has(`${p}[]`), `${p} has no element`).toBe(true);
  });

  it.each(ROUTES)("%s: every key-fields path resolves in its example", (route) => {
    const t = tree(endpoint(route).example.body.data);
    for (const f of endpoint(route).keyFields) expect(t.has(f.path), f.path).toBe(true);
  });
});

describe("(a) the examples agree with one another (§5.18 Example content)", () => {
  const data = (route: QaRoute) => endpoint(route).example.body.data as Record<string, any>;

  it("every command uses the pilot ids: batch 0001-pilot, record Napa, substance Warfarin", () => {
    expect(endpoint("batch").example.url).toBe("/api/qa/v1/batches/0001-pilot");
    expect(endpoint("record").example.url).toBe("/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa");
    expect(endpoint("records").example.url).toBe("/api/qa/v1/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=0");
    expect(endpoint("pairs").example.url).toBe("/api/qa/v1/substances/BDS-000003/pairs?page=0");
    expect(data("record").extraction.tradeName).toBe("Napa");
    expect(data("pairs")).toMatchObject({ bdsId: "BDS-000003", name: "Warfarin", page: 0, size: QA_PAIRS_SIZE });
  });

  it("the batches list has 0001-pilot with 10 items and the batch's approved count", () => {
    const pilot = data("batches").batches.find((b: { batchId: string }) => b.batchId === "0001-pilot");
    const items = data("batch").items as { displayStatus: string }[];
    expect(pilot.itemCount).toBe(10);
    expect(data("batch").itemCount).toBe(10);
    expect(items).toHaveLength(10);
    expect(pilot.approvedCount).toBe(items.filter((i) => i.displayStatus === "approved").length);
    expect(pilot.status).toBe(data("batch").status);
    expect(data("record").batch).toEqual({ status: pilot.status, runAt: pilot.runAt, itemCount: 10 });
  });

  it("Napa's row and record agree on display status and every stage's status", () => {
    const row = data("batch").items.find((i: { conceptId: string }) => i.conceptId === "186-0030-006--napa");
    const record = data("record");
    expect(record.displayStatus).toBe(row.displayStatus);
    expect(record.stages.map((s: { stage: string; status: string }) => [s.stage, s.status]))
      .toEqual(row.stages.map((s: { stage: string; status: string }) => [s.stage, s.status]));
  });

  it("the records example is exactly the batch's records whose ddinter stage warns, with total equal to their number", () => {
    const warned = (data("batch").items as { conceptId: string; tradeName: string; displayStatus: string;
      stages: { stage: string; status: string }[] }[]).filter((i) => i.stages.find((s) => s.stage === "ddinter")?.status === "warn");
    const records = data("records");
    expect(records).toMatchObject({ filter: "stage_warn", stage: "ddinter", batch: "0001-pilot", page: 0, size: QA_RECORDS_SIZE });
    expect(records.items).toEqual(warned.map((i) => ({ batchId: "0001-pilot", conceptId: i.conceptId, tradeName: i.tradeName,
      displayStatus: i.displayStatus, stages: Object.fromEntries(i.stages.map((s) => [s.stage, s.status])) })));
    expect(records.total).toBe(records.items.length);
  });

  it("the pairs example's total is the number of pairs shown, each with Warfarin as this substance", () => {
    expect(data("pairs").total).toBe(data("pairs").pairs.length);
    for (const p of data("pairs").pairs) expect(p.partner.bdsId === "BDS-000003" ? p.entry.name : p.partner.bdsId).not.toBe("BDS-000003");
  });

  it("a stage's note is always a string: an ok stage's is \"\", as the ETL stores it (ops.stage_result.note is TEXT NOT NULL)", () => {
    expect(readFileSync(join(WEB, "..", "db/migrations/V3__pipeline.sql"), "utf8"))
      .toMatch(/CREATE TABLE ops\.stage_result \([^;]*?\bnote TEXT NOT NULL,/);
    expect(EXAMPLE_NULLS.batch).toEqual([]);
    const stages = (data("batch").items as { stages: { status: string; note: unknown }[] }[]).flatMap((i) => i.stages);
    for (const s of stages) expect(typeof s.note, JSON.stringify(s)).toBe("string");
    for (const s of stages.filter((x) => x.status === "ok")) expect(s.note).toBe("");
    for (const s of stages.filter((x) => x.status !== "ok")) expect(s.note).not.toBe("");
  });
});

/*
 * §5.18 "Example content", §7.9.3 "evidence as stored": the record example's stages[].evidence is opaque to the shape test, so
 * its keys are pinned here to the ETL builders that write ops.stage_result.evidence. Each entry names a path in the example's
 * evidence ("" the object itself, "x[]" the elements of array x) and the dict literal in the ETL source that builds it, found by
 * a sequence of anchors; the dict's top-level keys must equal the example's keys there, and no other object in the example's
 * evidence may go unpinned.
 */
const ETL = (f: string) => readFileSync(join(WEB, "..", "etl/src/bddrug_etl", f), "utf8");
/** The top-level keys of the Python dict literal at the first `{` after the anchors, found in order. */
function pyDictKeys(src: string, anchors: string[]): string[] {
  let at = 0;
  for (const a of anchors) {
    const i = src.indexOf(a, at);
    expect(i, `anchor ${a}`).toBeGreaterThanOrEqual(0);
    at = i;
  }
  const open = src.indexOf("{", at);
  const keys: string[] = [];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      const key = /^\s*:/.test(src.slice(end + 1)) && depth === 1;
      if (key) keys.push(src.slice(i + 1, end));
      i = end;
    } else if ("{[(".includes(c)) depth++;
    else if ("}])".includes(c) && --depth === 0) break;
  }
  return keys.sort();
}
const EVIDENCE: Record<StageKey, { path: string; file: string; anchors: string[] }[]> = {
  dgda: [{ path: "", file: "load/batches.py", anchors: ["def _dgda_results", 'StageResult(cid, "ok", ""'] }],
  substances: [
    { path: "", file: "stages/substances.py", anchors: ['evidence = {"substances"'] },
    { path: "substances[]", file: "stages/substances.py", anchors: ["def _evidence_for", "return {"] },
  ],
  clinical: [
    { path: "", file: "stages/clinical.py", anchors: ["def _evidence(", "return {"] },
    { path: "parsed[]", file: "stages/clinical.py", anchors: ["def _evidence(", '"parsed": ['] },
    { path: "aligned[]", file: "stages/clinical.py", anchors: ["def _evidence(", '"aligned": ['] },
  ],
  ddinter: [
    { path: "", file: "stages/ddinter.py", anchors: ["def _process(", "evidence = {"] },
    { path: "mappings[]", file: "stages/ddinter.py", anchors: ["def _process(", "mappings.append({"] },
    { path: "coverage[]", file: "stages/ddinter.py", anchors: ["def _process(", "coverage.append({"] },
    { path: "chosen[]", file: "stages/ddinter.py", anchors: ["def _process(", "chosen.append({"] },
  ],
};
/** Every object path of an evidence value, with the union of its key sets. */
function objectKeys(v: unknown, path = "", out = new Map<string, Set<string>>()): Map<string, Set<string>> {
  if (Array.isArray(v)) v.forEach((e) => objectKeys(e, `${path}[]`, out));
  else if (v !== null && typeof v === "object") {
    if (!out.has(path)) out.set(path, new Set());
    for (const [k, x] of Object.entries(v)) { out.get(path)!.add(k); objectKeys(x, path ? `${path}.${k}` : k, out); }
  }
  return out;
}

describe("(a) the record example's stage evidence is what the pipeline writes (§5.18, §7.9.3)", () => {
  const stages = EX.RECORD_BODY.stages as { stage: StageKey; evidence: unknown }[];

  it.each(Object.keys(EVIDENCE) as StageKey[])("%s: every object's keys are the ETL builder's keys, and none is unpinned", (stage) => {
    const evidence = stages.find((s) => s.stage === stage)!.evidence;
    const keys = objectKeys(evidence);
    for (const { path, file, anchors } of EVIDENCE[stage]) {
      expect([...(keys.get(path) ?? [])].sort(), `${stage} ${path || "(top)"}`).toEqual(pyDictKeys(ETL(file), anchors));
    }
    expect([...keys.keys()].sort()).toEqual(EVIDENCE[stage].map((e) => e.path).sort());
  });

  it("the values have the ETL's types and agree with the rest of the record", () => {
    const ev = Object.fromEntries(stages.map((s) => [s.stage, s.evidence])) as Record<StageKey, any>;
    const r = EX.RECORD_BODY;
    expect(ev.dgda).toEqual({ source: "DGDA-Drugs", concept_class: r.sourceJson.concept_class });
    const ing = r.ingredients[0];
    expect(ev.substances.substances).toEqual([expect.objectContaining({ bds_id: ing.bdsId, name: ing.name, xm: r.dgdaIngredients[0].xmCode,
      rxcui: ing.codes.find((c) => c.system === "RXCUI")!.code })]);
    for (const [k, system] of [["atc", "ATC"], ["drugbank", "DRUGBANK"]] as const) {
      expect(ev.substances.substances[0][k]).toEqual(ing.codes.filter((c) => c.system === system).map((c) => c.code));
    }
    // clinical: strengths are strings (_str), the raw text and the clinical drug are the record's own
    expect(ev.clinical).toMatchObject({ raw: r.brand.genericContentRaw, parse_status: r.brand.parseStatus, bdc_id: r.clinicalDrug.bdcId,
      signature: r.clinicalDrug.signature });
    for (const p of ev.clinical.parsed) {
      expect(typeof p.strength_value).toBe("string");
      expect(p.strength_value).toBe(String(ing.strengthValue));
      expect(p.per_value === null || typeof p.per_value === "string").toBe(true);
    }
    expect(ev.clinical.aligned.map((a: { bds_id: string }) => a.bds_id)).toEqual([ing.bdsId]);
    // ddinter: the route view the key fields tell QA to compare with ddinterRoute
    const chosen = ing.ddinter.chosen[0];
    expect(ev.ddinter).toMatchObject({ route: r.clinicalDrug.route, route_assumed: chosen.routeAssumed, pair_count: ing.ddinter.entries[0].counts.total,
      disease_count: ing.ddinter.entries[0].diseaseCount, food_count: ing.ddinter.entries[0].foodCount,
      chosen: [{ bds_id: ing.bdsId, ddinter_id: chosen.ddinterId, route_scope: chosen.routeScope, route_assumed: chosen.routeAssumed }] });
    expect(ev.ddinter.text_missing).toEqual(r.stages.find((s) => s.stage === "ddinter")!.textMissing.map((t) => [t.ddinterA, t.ddinterB]));
  });

  // The guide's dgda check (§7.11.8, guide 1.1.0) names the register keys each brand field comes from; the example's
  // source.json must carry those keys, so the page and the guide never disagree (ocl/transform.py concept_to_product).
  it("source.json is a register record as the pipeline reads it: its extras and mappings give the record's brand fields", () => {
    const r = EX.RECORD_BODY;
    const src = r.sourceJson as { extras: Record<string, string>; mappings: { map_type: string; to_concept_code: string;
      to_concept_name: string; retired: boolean }[] };
    const transform = ETL("ocl/transform.py");
    for (const k of Object.keys(src.extras)) expect(transform, `extras.${k}`).toContain(`extras.get("${k}")`);
    const clean = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
    expect({ darNumber: clean(src.extras.dar_number), tradeName: clean(src.extras.trade_name), company: clean(src.extras.company),
      dosageForm: clean(src.extras.dosage_form), genericContentRaw: clean(src.extras.generic_content_raw) })
      .toEqual({ darNumber: r.brand.darNumber, tradeName: r.brand.tradeName, company: r.brand.company, dosageForm: r.brand.dosageForm,
        genericContentRaw: r.brand.genericContentRaw });
    expect(transform).toContain('if m.get("map_type") != "Has-active-ingredient" or m.get("retired"):');
    expect(src.mappings.filter((m) => m.map_type === "Has-active-ingredient" && !m.retired)
      .map((m) => ({ xmCode: m.to_concept_code, name: m.to_concept_name }))).toEqual(r.dgdaIngredients);
  });
});

// ---- (b)

describe("(b) every documented rule equals the validators (§11.1)", () => {
  const facts = (route: QaRoute, name: string) => endpoint(route).params.find((p) => p.name === name)!;

  it("each panel's parameters, where they go and whether they are required, as §5.18's table", () => {
    expect(Object.fromEntries(ROUTES.map((r) => [r, endpoint(r).params.map((p) => [p.name, p.in, p.required])]))).toEqual({
      batches: [],
      batch: [["batchId", "path", true]],
      record: [["batchId", "path", true], ["conceptId", "path", true]],
      records: [["filter", "query", true], ["stage", "query", false], ["batch", "query", false], ["page", "query", false]],
      pairs: [["bdsId", "path", true], ["page", "query", false]],
    });
  });

  it("batchId and batch: BATCH_ID's own pattern, whose length limit is the documented max (100)", () => {
    for (const p of [facts("batch", "batchId"), facts("record", "batchId"), facts("records", "batch")]) {
      expect(p.facts.pattern).toBe(BATCH_ID.source);
      expect(BATCH_ID.source).toBe(`^[A-Za-z0-9._-]{1,${p.facts.max}}$`);
      expect(p.facts.max).toBe(100);
      expect(p.rule.fills.pattern).toEqual({ code: BATCH_ID.source });
    }
    expect(facts("batch", "batchId").rule.fills.max).toBe("100");
  });

  it("conceptId: ID_MAX; bdsId: BDS_ID; filter: QA_FILTERS; stage: QA_STAGES with stage_warn only; page: PAGE_MAX and the page size", () => {
    expect(facts("record", "conceptId").facts.max).toBe(ID_MAX);
    expect(facts("record", "conceptId").rule.fills.max).toBe(String(ID_MAX));
    expect(facts("pairs", "bdsId").facts.pattern).toBe(BDS_ID.source);
    expect(facts("pairs", "bdsId").rule.fills.pattern).toEqual({ code: BDS_ID.source });
    expect(facts("records", "filter").facts.values).toEqual(QA_FILTERS);
    expect(facts("records", "filter").rule.fills.values).toEqual({ codes: QA_FILTERS });
    expect(facts("records", "stage").facts).toEqual({ values: QA_STAGES, only: "stage_warn" });
    expect(facts("records", "stage").rule.fills.values).toEqual({ codes: QA_STAGES });
    expect(facts("records", "page").facts).toEqual({ pageMax: PAGE_MAX, size: QA_RECORDS_SIZE });
    expect(facts("pairs", "page").facts).toEqual({ pageMax: PAGE_MAX, size: QA_PAIRS_SIZE });
    for (const r of ["records", "pairs"] as const) expect(facts(r, "page").rule.fills.max).toBe(String(PAGE_MAX));
    expect(facts("records", "page").rule.fills.size).toBe(String(QA_RECORDS_SIZE));
    expect(facts("pairs", "page").rule.fills.size).toBe(String(QA_PAIRS_SIZE));
  });

  it("each panel's 400 row names exactly its parameters, its 404 row exactly its id fields, and every row has its status", () => {
    const rows = (r: QaRoute) => endpoint(r).errors.map((e) => [e.status, e.code, e.fields]);
    expect(Object.fromEntries(ROUTES.map((r) => [r, rows(r)]))).toEqual({
      batches: [[400, "INVALID_QUERY", []], [401, "UNAUTHORIZED", []], [429, "RATE_LIMITED", []], [502, "UNAVAILABLE", []]],
      batch: [[400, "INVALID_QUERY", ["batchId"]], [401, "UNAUTHORIZED", []], [404, "NOT_FOUND", ["batchId"]], [429, "RATE_LIMITED", []],
        [502, "UNAVAILABLE", []]],
      record: [[400, "INVALID_QUERY", ["batchId", "conceptId"]], [401, "UNAUTHORIZED", []], [404, "NOT_FOUND", ["batchId", "conceptId"]],
        [429, "RATE_LIMITED", []], [502, "UNAVAILABLE", []]],
      records: [[400, "INVALID_QUERY", ["filter", "stage", "batch", "page"]], [401, "UNAUTHORIZED", []], [404, "NOT_FOUND", ["batch"]],
        [429, "RATE_LIMITED", []], [502, "UNAVAILABLE", []]],
      pairs: [[400, "INVALID_QUERY", ["bdsId", "page"]], [401, "UNAUTHORIZED", []], [404, "NOT_FOUND", ["bdsId"]], [429, "RATE_LIMITED", []],
        [502, "UNAVAILABLE", []]],
    });
    for (const r of ROUTES) expect(endpoint(r).errors[0].fields).toEqual(endpoint(r).params.map((p) => p.name));
    for (const r of ROUTES) expect(endpoint(r).errors.find((e) => e.status === 429)!.when.fills.limit).toBe(String(QA_RATE_LIMIT));
  });
});

describe("(b) by behaviour, on every route", () => {
  it.each(ROUTES)("%s: an undocumented parameter x is 400 with field x", async (route) => {
    const e = endpoint(route);
    await expectError(await get(route, urlFor(e, {}, [...requiredQuery(e), ["x", "1"]])), 400, "INVALID_QUERY", "x");
  });

  it.each(ROUTES)("%s: each documented query parameter sent twice is 400 with its name", async (route) => {
    const e = endpoint(route);
    for (const p of e.params.filter((x) => x.in === "query")) {
      const q = [...requiredQuery(e).filter(([n]) => n !== p.name), [p.name, p.example], [p.name, p.example]] as [string, string][];
      await expectError(await get(route, urlFor(e, {}, q)), 400, "INVALID_QUERY", p.name);
    }
  });

  /** For each documented parameter: values its rule allows (accepted) and values it refuses (400 with its name). */
  const CASES: Record<QaRoute, { name: string; ok: string[]; bad: string[]; query?: [string, string][] }[]> = {
    batches: [],
    batch: [{ name: "batchId", ok: ["a", "b".repeat(100), "A.b_c-9"], bad: ["b".repeat(101), "bad%20batch", "a%2Fb", "x!"] }],
    record: [
      { name: "batchId", ok: ["b".repeat(100)], bad: ["b".repeat(101), "bad!"] },
      { name: "conceptId", ok: ["c".repeat(ID_MAX), "040-090(-077--mectigen-vet-oral-solution", "a%20b"],
        bad: ["c".repeat(ID_MAX + 1), "a%00b", "a%7Fb"] },
    ],
    records: [
      { name: "filter", ok: [...QA_FILTERS], bad: ["nope", "STAGE_WARN", ""] },
      { name: "stage", ok: [...QA_STAGES], bad: ["evidence", ""], query: [["filter", "stage_warn"]] },
      { name: "batch", ok: ["b".repeat(100)], bad: ["b".repeat(101), "a%2Fb", ""] },
      { name: "page", ok: ["0", String(PAGE_MAX)], bad: [String(PAGE_MAX + 1), "-1", "1.5", "x", ""] },
    ],
    pairs: [
      { name: "bdsId", ok: ["BDS-000003", "BDS-999999"], bad: ["BDS-1", "bds-000003", "BDS-0000031"] },
      { name: "page", ok: ["0", String(PAGE_MAX)], bad: [String(PAGE_MAX + 1), "-1"] },
    ],
  };

  it.each(ROUTES)("%s: each rule's allowed values are accepted and each value breaking it is 400 with its name", async (route) => {
    const e = endpoint(route);
    api.upstream = okUpstream(route);
    expect(CASES[route].map((c) => c.name)).toEqual(e.params.map((p) => p.name));
    for (const c of CASES[route]) {
      const p = e.params.find((x) => x.name === c.name)!;
      const url = (v: string) => p.in === "path" ? urlFor(e, { [c.name]: v }, requiredQuery(e))
        : urlFor(e, {}, [...(c.query ?? requiredQuery(e)).filter(([n]) => n !== c.name), [c.name, v]]);
      for (const v of c.ok) expect((await get(route, url(v))).status, `${c.name}=${v}`).toBe(200);
      for (const v of c.bad) await expectError(await get(route, url(v)), 400, "INVALID_QUERY", c.name);
    }
  });

  it("stage is refused with any filter but stage_warn", async () => {
    const e = endpoint("records");
    for (const f of QA_FILTERS.filter((x) => x !== "stage_warn")) {
      await expectError(await get("records", urlFor(e, {}, [["filter", f], ["stage", "ddinter"]])), 400, "INVALID_QUERY", "stage");
    }
  });

  it.each(ROUTES)("%s: an API 404 for each documented id field is 404 with it; any other field is 502", async (route) => {
    const e = endpoint(route);
    const fields404 = e.errors.find((x) => x.status === 404)?.fields ?? [];
    for (const field of fields404) {
      api.upstream = () => ({ ok: false, status: 404, field });
      await expectError(await get(route, e.example.url), 404, "NOT_FOUND", field);
    }
    for (const field of ["x", ...e.params.map((p) => p.name).filter((n) => !fields404.includes(n))]) {
      api.upstream = () => ({ ok: false, status: 404, field });
      await expectError(await get(route, e.example.url), 502, "UNAVAILABLE", null);
    }
  });

  it.each(ROUTES)("%s: 401 with WWW-Authenticate: Bearer; 502 when the API fails", async (route) => {
    const e = endpoint(route);
    const res = await HANDLERS[route](new Request(`https://${HOST}${e.example.url}`, { headers: { "x-request-id": EX.EXAMPLE_REQUEST_ID } }));
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    await expectError(res, 401, "UNAUTHORIZED", null);
    api.upstream = () => ({ ok: false, status: 500, field: null });
    await expectError(await get(route, e.example.url), 502, "UNAVAILABLE", null);
  });

  it(`the (QA_RATE_LIMIT + 1)th request in a minute is 429 with Retry-After: 60`, async () => {
    api.upstream = okUpstream("batches");
    for (let i = 0; i < QA_RATE_LIMIT; i++) expect((await get("batches", "/api/qa/v1/batches")).status).toBe(200);
    const res = await get("batches", "/api/qa/v1/batches");
    expect(res.headers.get("retry-after")).toBe("60");
    await expectError(res, 429, "RATE_LIMITED", null);
    expect(REF.common.headersLine.fills.retry).toEqual({ code: "Retry-After: 60" });
  });

  it("a path that is not one of the five endpoints is 404 with no field", async () => {
    await expectError(await restGET(new Request(`https://${HOST}/api/qa/v1/nope`)), 404, "NOT_FOUND", null);
  });
});

describe("(b) MCP over HTTP: the documented rules are the server's", () => {
  it("versions, the default version, the body limit and the headers table", () => {
    expect(REF.mcp.versionLine.fills).toEqual({ default: { code: DEFAULT_PROTOCOL_VERSION }, versions: { codes: SUPPORTED_PROTOCOL_VERSIONS } });
    expect(REF.mcp.bodyLine.fills.max).toBe(String(MCP_MAX_BODY / 1024));
    expect(REF.mcp.bodyLine.fills.max).toBe("64");
    expect(REF.mcp.headers).toEqual([
      { name: "Authorization", value: "Bearer <key>", required: true },
      { name: "Content-Type", value: "application/json", required: true },
      { name: "Accept", value: "application/json, text/event-stream", required: false },
      { name: "MCP-Protocol-Version", value: SUPPORTED_PROTOCOL_VERSIONS[0], required: false },
    ]);
  });

  it("the tools table is TOOLS: names, argument names in order, required, and the TOOL_ROUTES endpoint or the guide uri", () => {
    expect(REF.mcp.tools).toEqual(TOOLS.map((t) => ({
      name: t.name,
      args: Object.keys(t.inputSchema.properties).map((name) => ({ name, required: (t.inputSchema.required ?? []).includes(name) })),
      request: t.name === "get_qa_guide" ? `${GUIDE_URI_PREFIX}{topic}` : endpoint(TOOL_ROUTES[t.name]).request,
    })));
    expect(REF.mcp.tools.slice(0, 5).map((t) => t.request)).toEqual(REF.endpoints.map((e) => e.request));
    expect(REF.mcp.tools[5]).toEqual({ name: "get_qa_guide", args: [{ name: "topic", required: false }],
      request: "intellidrugs://qa-guide/{topic}" });
    expect(Object.keys(TOOL_ROUTES)).toEqual(["list_batches", "get_batch", "get_record", "find_records", "get_pairs"]);
  });

  it("the methods line lists the seven methods; the arguments line names the guide topics; the guide lines name the tool and fields", () => {
    expect(REF.mcp.bodyLine.fills.methods).toEqual({ codes: ["initialize", "ping", "tools/list", "tools/call", "resources/list",
      "resources/templates/list", "resources/read"] });
    expect(REF.mcp.argsLine.fills.topic).toEqual({ code: "topic" });
    expect(REF.mcp.argsLine.fills.topics).toEqual({ codes: GUIDE_TOPICS });
    expect(REF.mcp.guide.lead.fills).toEqual({ tool: { code: "get_qa_guide" }, topic: { code: "topic" }, version: { code: "guideVersion" } });
    expect(REF.mcp.guide.resultLine.fills).toEqual({ tool: { code: "get_qa_guide" },
      fields: { codes: ["guideVersion", "topic", "title", "text", "related"] } });
  });

  /** One request that triggers each row of the MCP errors table. */
  const mcp = (init: { body?: BodyInit; headers?: Record<string, string | null>; key?: string | null } = {}) => {
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream",
      "x-request-id": EX.EXAMPLE_REQUEST_ID, "x-forwarded-for": "203.0.113.9" };
    const key = init.key === undefined ? KEY : init.key;
    if (key !== null) h.authorization = `Bearer ${key}`;
    for (const [k, v] of Object.entries(init.headers ?? {})) if (v === null) delete h[k]; else h[k] = v;
    return mcpPOST(new Request(`https://${HOST}/api/qa/mcp`, { method: "POST", headers: h,
      body: init.body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
  };
  const call = (name: string, args: unknown) => mcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call",
    params: { name, arguments: args } }) });
  const TRIGGERS: Record<string, () => Promise<Response>> = {
    "Method not allowed": () => mcpGET(new Request(`https://${HOST}/api/qa/mcp`)),
    Forbidden: () => mcp({ headers: { origin: "https://evil.example" } }),
    Unauthorized: () => mcp({ key: null }),
    Unavailable: () => { api.verify = () => ({ ok: false, status: 503 }); return mcp({ key: `idqa_${randomBytes(32).toString("base64url")}` }); },
    "Too many requests": async () => {
      for (let i = 0; i < QA_RATE_LIMIT; i++) await mcp();
      return mcp();
    },
    "Unsupported media type": () => mcp({ headers: { "content-type": "text/plain" } }),
    "Not acceptable": () => mcp({ headers: { accept: "text/html" } }),
    "Request too large": () => mcp({ body: "x".repeat(MCP_MAX_BODY + 1) }),
    "Parse error": () => mcp({ body: "{" }),
    "Invalid Request": () => mcp({ body: "[]" }),
    "Unsupported protocol version": () => mcp({ headers: { "mcp-protocol-version": "1999-01-01" } }),
    "Invalid params": () => mcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} }) }),
    "Resource not found": () => mcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/read",
      params: { uri: "intellidrugs://qa-guide/nope" } }) }),
    "Method not found": () => mcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "nope" }) }),
    "Internal error": () => {
      spies.answerQa.mockImplementationOnce(() => { throw new Error("boom"); });
      return call("list_batches", {});
    },
    "Invalid input {name}": () => call("get_batch", { batchId: "bad batch" }),
    "Unknown tool": () => call("nope", {}),
    "QA API error {status} {code}": () => { api.upstream = () => ({ ok: false, status: 404, field: "batchId" }); return call("get_batch", { batchId: "nope" }); },
  };
  const template = (m: string) => new RegExp(`^${m.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{\w+\}/g, "[A-Za-z0-9_]+")}$`);

  it("every row of the errors table has a trigger, and none is left over", () => {
    expect(REF.mcp.errors.map((e) => e.message).sort()).toEqual(Object.keys(TRIGGERS).sort());
  });

  it.each(REF.mcp.errors.map((e) => [e.message, e] as const))("%s: produced with the documented status, code and message", async (_m, row) => {
    clock.now += 3_600_000;
    const res = await TRIGGERS[row.message]();
    expect(res.status).toBe(row.status);
    const body = await res.json();
    if (row.code === "isError: true") {
      expect(body.result.isError).toBe(true);
      expect(body.result.content[1].text).toMatch(template(row.message));
    } else {
      expect(body.error).toEqual({ code: Number(row.code), message: row.message });
    }
  });
});

// ---- (c)

const SECRET = [/@/, /idqa_[A-Za-z0-9_-]{43}/, /[0-9a-f]{64}/i];
const UPSTREAM = [EX.BATCHES_BODY, EX.BATCH_BODY, EX.RECORD_BODY, EX.RECORDS_BODY, EX.PAIRS_BODY];

describe("(c) no secret or person in the reference (§11.1)", () => {
  it("no command, example answer or example API body holds an @, a DB key or a 64-character hex string", () => {
    for (const text of [...codeBlocks(REF).map((b) => b.text), ...UPSTREAM.map((b) => JSON.stringify(b))]) {
      for (const re of SECRET) expect(text, `${re}`).not.toMatch(re);
    }
  });

  it("in commands and examples every Bearer is followed by the $INTELLIDRUGS_QA_KEY variable", () => {
    const all = codeBlocks(REF).map((b) => b.text).join("\n");
    expect(all).toContain(`Bearer ${KEY_VARIABLE}`);
    expect(all.match(/Bearer(?! \$INTELLIDRUGS_QA_KEY")/g)).toBeNull();
  });

  /** Every key path of a parsed answer; a tool result's JSON text block is parsed too. */
  function keyPaths(v: unknown, path = "", out: string[] = []): string[] {
    if (typeof v === "string" && v.startsWith("{")) {
      try { return keyPaths(JSON.parse(v), `${path}<json>`, out); } catch { return out; }
    }
    if (Array.isArray(v)) v.forEach((e) => keyPaths(e, `${path}[]`, out));
    else if (v !== null && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        out.push(path ? `${path}.${k}` : k);
        keyPaths(x, path ? `${path}.${k}` : k, out);
      }
    }
    return out;
  }

  it("no example answer holds a dropped field; a note key only on a batch item's stage", () => {
    const answers = [REF.common.errorBody, ...REF.endpoints.map((e) => e.example.body), REF.mcp.initialize.body, REF.mcp.call.body,
      REF.mcp.guide.body];
    const paths = answers.flatMap((a) => keyPaths(a));
    for (const k of ["mine", "reviewerEmail", "lastDecisionId", "contentHash", "lastPairReviewId", "openIssues", "reopen"]) {
      expect(paths.filter((p) => p.split(".").at(-1) === k), k).toEqual([]);
    }
    expect([...new Set(paths.filter((p) => p.split(".").at(-1) === "note"))]).toEqual(["data.items[].stages[].note"]);
  });

  it("each dropped field the API type requires holds its neutral value in the example API bodies", () => {
    const r = EX.RECORD_BODY;
    expect(r.version.lastDecisionId).toBeNull();
    expect(r.openIssues).toEqual([]);
    expect(r.reopen).toBeNull();
    for (const p of [...r.batchPairs.pairs, ...r.otherPairs.pairs]) expect(p.pairReview).toMatchObject({ mine: false, note: null });
    for (const h of r.history) expect(Object.keys(h)).not.toEqual(expect.arrayContaining(["note"]));
    for (const h of r.history) expect(h).not.toHaveProperty("mine");
    for (const p of EX.PAIRS_BODY.pairs.items) {
      expect(p.review).toMatchObject({ mine: false, note: null });
      expect(p.history).toEqual([]);
      expect(p.version).toEqual({ contentHash: "", lastPairReviewId: null });
    }
    const all = JSON.stringify(UPSTREAM);
    expect(all).not.toMatch(/"mine":true/);
    expect(all).not.toContain("reviewerEmail");
  });

  it("the rendered reference's HTML: no @, DB key or 64-hex string, and every Bearer is the variable, <key>, the 401 header or the 401 advice", () => {
    const html = renderToStaticMarkup(createElement(ApiReference, { reference: REF }));
    expect(html).toContain("qa-ref-mcp");
    for (const re of SECRET) expect(html, `${re}`).not.toMatch(re);
    const rest = html.replace(/Bearer \$INTELLIDRUGS_QA_KEY(?=&quot;)/g, "").replace(/Bearer &lt;key&gt;/g, "")
      .replace(/WWW-Authenticate: Bearer(?=<)/g, "").replace(/Authorization: Bearer and your key/g, "");
    expect(rest).not.toContain("Bearer");
  });

  it("the request id is a version-4 UUID and the time is fixed", () => {
    expect(EX.EXAMPLE_REQUEST_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(EX.EXAMPLE_TIMESTAMP).toBe("2026-10-19T04:30:00.000Z");
  });
});

describe("budget (§10.6)", () => {
  it("the code text, joined, gzips to 8 KB or less", () => {
    const all = codeBlocks(REF).map((b) => b.text).join("\n");
    expect(gzipSync(all).length).toBeLessThanOrEqual(8 * 1024);
  });

  it("the reference and its examples are server-only", () => {
    for (const f of ["lib/qa-api-reference.ts", "lib/qa-api-examples.ts"]) {
      expect(readFileSync(join(WEB, f), "utf8").startsWith('import "server-only";')).toBe(true);
    }
  });
});
