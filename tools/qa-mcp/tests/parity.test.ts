import { describe, expect, it } from "vitest";
import { PREAMBLE } from "../src/preamble.js";
import { SERVER_NAME, SERVER_VERSION } from "../src/server.js";
import { TOOLS, toPath } from "../src/tools.js";

/*
 * §7.10.6, §11.1 "MCP parity": the hosted server (web/lib/qa-mcp-tools.ts, dependency-free) and this stdio server must say
 * the same thing. The web module is loaded by URL at run time, so this package's typecheck (rootDir ".") never reads it.
 */
type WebTool = { name: string; title: string; description: string; inputSchema: unknown; annotations: unknown };
type WebInput =
  | { route: "batches" }
  | { route: "batch"; batchId: string }
  | { route: "record"; batchId: string; conceptId: string }
  | { route: "records"; filter: string; stage?: string; batch?: string; page: number }
  | { route: "pairs"; bdsId: string; page: number };
type WebChecked = { ok: true; input: WebInput } | { ok: false; field: string; route: string } | { ok: false; unknownTool: true };
type WebModule = { PREAMBLE: string; SERVER_NAME: string; SERVER_VERSION: string; TOOLS: readonly WebTool[];
  checkToolArgs: (name: string, args: Record<string, unknown> | undefined) => WebChecked };
const WEB_TOOLS_URL = new URL("../../../web/lib/qa-mcp-tools.ts", import.meta.url).href;
const web = async () => (await import(/* @vite-ignore */ WEB_TOOLS_URL)) as WebModule;

/** The stdio server's tools/list entries (src/server.ts builds the annotations from each title). */
const stdioList = TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
  annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

describe("stdio and hosted MCP parity (§7.10.6)", () => {
  it("the same preamble, server name and version", async () => {
    const w = await web();
    expect(w.PREAMBLE).toBe(PREAMBLE);
    expect(w.SERVER_NAME).toBe(SERVER_NAME);
    expect(w.SERVER_VERSION).toBe(SERVER_VERSION);
  });

  it("the same tools: names, titles, descriptions, input schemas and annotations, in order", async () => {
    const w = await web();
    expect(w.TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
      annotations: t.annotations }))).toEqual(stdioList);
  });
});

/** The QA API path a hosted QaInput addresses, as the routes parse it back (an absent page is page 0). */
function pathOf(input: WebInput): string {
  const enc = encodeURIComponent;
  switch (input.route) {
    case "batches": return "/api/qa/v1/batches";
    case "batch": return `/api/qa/v1/batches/${enc(input.batchId)}`;
    case "record": return `/api/qa/v1/batches/${enc(input.batchId)}/records/${enc(input.conceptId)}`;
    case "records": {
      const q = new URLSearchParams({ filter: input.filter });
      if (input.stage !== undefined) q.set("stage", input.stage);
      if (input.batch !== undefined) q.set("batch", input.batch);
      q.set("page", String(input.page));
      return `/api/qa/v1/records?${q}`;
    }
    case "pairs": return `/api/qa/v1/substances/${enc(input.bdsId)}/pairs?page=${input.page}`;
  }
}

/** The stdio path with the defaults the routes apply (page 0), so both sides compare as the same read. */
function normalise(path: string): string {
  const u = new URL(path, "http://x");
  const records = u.pathname === "/api/qa/v1/records", pairs = /\/pairs$/.test(u.pathname);
  if ((records || pairs) && !u.searchParams.has("page")) u.searchParams.set("page", "0");
  return `${u.pathname}${u.search}`;
}

const LONE = "\uD800";
const BAD: [string, Record<string, unknown> | undefined][] = [
  ["list_batches", { page: 1 }],
  ["list_batches", { x: 1, y: 2 }],
  ["get_batch", undefined],
  ["get_batch", {}],
  ["get_batch", { batchId: "bad batch" }],
  ["get_batch", { batchId: "b".repeat(101) }],
  ["get_batch", { batchId: "." }],
  ["get_batch", { batchId: ".." }],
  ["get_batch", { batchId: 1 }],
  ["get_batch", { batchId: null }],
  ["get_batch", { batchId: "0001-pilot", extra: true }],
  ["get_batch", { extra: true, batchId: "bad batch" }],
  ["get_record", { batchId: "0001-pilot" }],
  ["get_record", { conceptId: "N-1" }],
  ["get_record", { batchId: "bad!", conceptId: "" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "c".repeat(201) }],
  ["get_record", { batchId: "0001-pilot", conceptId: "a\u0000b" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "a\u001fb" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "a\u007fb" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "." }],
  ["get_record", { batchId: "0001-pilot", conceptId: ".." }],
  ["get_record", { batchId: "0001-pilot", conceptId: `a${LONE}b` }],
  ["get_record", { batchId: "0001-pilot", conceptId: ["N-1"] }],
  ["find_records", {}],
  ["find_records", { filter: "STAGE_WARN" }],
  ["find_records", { filter: "" }],
  ["find_records", { filter: "stage_fail", stage: "ddinter" }],
  ["find_records", { filter: "stage_warn", stage: "evidence" }],
  ["find_records", { filter: "stage_warn", stage: null }],
  ["find_records", { filter: "nope", stage: "evidence", page: -1 }],
  ["find_records", { filter: "stage_warn", batch: "" }],
  ["find_records", { filter: "stage_warn", batch: "a/b" }],
  ["find_records", { filter: "stage_warn", batch: "." }],
  ["find_records", { filter: "stage_warn", page: 1000 }],
  ["find_records", { filter: "stage_warn", page: -1 }],
  ["find_records", { filter: "stage_warn", page: 1.5 }],
  ["find_records", { filter: "stage_warn", page: "1" }],
  ["find_records", { filter: "stage_warn", page: null }],
  ["find_records", { filter: "stage_warn", size: 10 }],
  ["find_records", { size: 10, filter: "nope" }],
  ["get_pairs", {}],
  ["get_pairs", { bdsId: "BDS-1" }],
  ["get_pairs", { bdsId: "bds-000003" }],
  ["get_pairs", { bdsId: "BDS-000003", page: 1000 }],
  ["get_pairs", { bdsId: "BDS-000003", page: "0" }],
  ["get_pairs", { bdsId: "BDS-000003", pairs: "applies" }],
];
const GOOD: [string, Record<string, unknown> | undefined][] = [
  ["list_batches", undefined],
  ["list_batches", {}],
  ["get_batch", { batchId: "0001-pilot" }],
  ["get_batch", { batchId: "a.b_c-1" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "040-090(-077--mectigen-vet-oral-solution" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "a b?c/d#e%f" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "নাপা" }],
  ["get_record", { batchId: "0001-pilot", conceptId: "c".repeat(200) }],
  ["find_records", { filter: "strength_missing" }],
  ["find_records", { filter: "stage_warn", stage: "ddinter", batch: "0001-pilot", page: 7 }],
  ["find_records", { page: 999, batch: "0001-pilot", filter: "stage_fail" }],
  ["find_records", { filter: "unaligned", page: 0 }],
  ["get_pairs", { bdsId: "BDS-000003" }],
  ["get_pairs", { bdsId: "BDS-000003", page: 2 }],
];

describe("stdio toPath and hosted checkToolArgs agree (§7.10.6, §11.1)", () => {
  it.each(BAD)("%s %j: the same refused field", async (name, args) => {
    const { checkToolArgs } = await web();
    const stdio = toPath(name, args), hosted = checkToolArgs(name, args);
    expect(stdio.ok).toBe(false);
    expect(hosted.ok).toBe(false);
    expect("field" in hosted && hosted.field).toBe("field" in stdio && stdio.field);
  });

  it.each(GOOD)("%s %j: the same route and inputs", async (name, args) => {
    const { checkToolArgs } = await web();
    const stdio = toPath(name, args), hosted = checkToolArgs(name, args);
    expect(stdio.ok && hosted.ok).toBe(true);
    if (!stdio.ok || !hosted.ok) return;
    expect(pathOf(hosted.input)).toBe(normalise(stdio.path));
  });

  it("an unknown tool is unknown to both", async () => {
    const { checkToolArgs } = await web();
    for (const name of ["delete_record", "", "LIST_BATCHES", "__proto__"]) {
      expect(toPath(name, {})).toEqual({ ok: false, unknownTool: true });
      expect(checkToolArgs(name, {})).toEqual({ ok: false, unknownTool: true });
    }
  });

  it("every good fixture's tool is covered, and every tool has a bad fixture", () => {
    const names = TOOLS.map((t) => t.name);
    expect([...new Set(GOOD.map(([n]) => n))].sort()).toEqual([...names].sort());
    expect([...new Set(BAD.map(([n]) => n))].sort()).toEqual([...names].sort());
  });
});
