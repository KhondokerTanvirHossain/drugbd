import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { BATCH_ID, BDS_ID, FILTERS, STAGES } from "../src/tools.js";
import { BATCHES, CONFIG, KEY, PREAMBLE_TEXT, envelope, errorEnvelope, jsonResponse, mockFetch } from "./helpers.js";

let close: (() => Promise<void>) | null = null;
afterEach(async () => { await close?.(); close = null; });

async function connect(fetch: typeof globalThis.fetch) {
  const server = createServer(CONFIG, { fetch });
  const client = new Client({ name: "qa-mcp-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  close = async () => { await client.close(); await server.close(); };
  return client;
}

type Schema = { type: string; properties: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties: boolean };

describe("the MCP server over a transport", () => {
  it("lists exactly the five read-only tools, with JSON-schema inputs carrying the §7.9.2 patterns and enums", async () => {
    const client = await connect(mockFetch().fetch);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["list_batches", "get_batch", "get_record", "find_records", "get_pairs"]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.description).toBeTruthy();
      expect((t.inputSchema as Schema).type).toBe("object");
      expect((t.inputSchema as Schema).additionalProperties).toBe(false);
    }
    const schema = (name: string) => tools.find((t) => t.name === name)!.inputSchema as Schema;
    expect(schema("list_batches").properties).toEqual({});
    expect(schema("get_batch").required).toEqual(["batchId"]);
    expect(schema("get_batch").properties.batchId!.pattern).toBe(BATCH_ID.source);
    expect(schema("get_record").required).toEqual(["batchId", "conceptId"]);
    expect(schema("get_record").properties.conceptId).toMatchObject({ type: "string", minLength: 1, maxLength: 200 });
    expect(new RegExp(String(schema("get_record").properties.conceptId!.pattern)).test("a\u0001b")).toBe(false);
    expect(new RegExp(String(schema("get_record").properties.conceptId!.pattern)).test("040-090(-077--x")).toBe(true);
    expect(schema("find_records").required).toEqual(["filter"]);
    expect(schema("find_records").properties.filter!.enum).toEqual([...FILTERS]);
    expect(FILTERS).toEqual(["strength_missing", "parse_partial", "route_assumed", "no_ddinter_data", "unaligned", "stage_warn", "stage_fail"]);
    expect(schema("find_records").properties.stage!.enum).toEqual([...STAGES]);
    expect(STAGES).toEqual(["dgda", "substances", "clinical", "ddinter"]);
    expect(schema("find_records").properties.batch!.pattern).toBe(BATCH_ID.source);
    expect(schema("find_records").properties.page).toEqual({ type: "integer", minimum: 0, maximum: 999,
      description: expect.any(String) });
    expect(schema("get_pairs").required).toEqual(["bdsId"]);
    expect(schema("get_pairs").properties.bdsId!.pattern).toBe(BDS_ID.source);
    expect(BATCH_ID.source).toBe("^[A-Za-z0-9._-]{1,100}$");
    expect(BDS_ID.source).toBe("^BDS-[0-9]{6}$");
  });

  it("answers a tool call with the preamble, then the body", async () => {
    const body = envelope(BATCHES);
    const client = await connect(mockFetch(() => jsonResponse(body)).fetch);
    const r = await client.callTool({ name: "list_batches", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: JSON.stringify(body, null, 2) }]);
  });

  it("refuses a bad input through the protocol with the preamble, before any call", async () => {
    const m = mockFetch();
    const client = await connect(m.fetch);
    const r = await client.callTool({ name: "get_pairs", arguments: { bdsId: "BDS-1" } });
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: "Invalid input bdsId" }]);
    expect(m.calls).toEqual([]);
  });

  it("an API error reaches the client as an error result with its status and code, never the key", async () => {
    const client = await connect(mockFetch(() => jsonResponse(errorEnvelope("UNAUTHORIZED"), 401, { "WWW-Authenticate": "Bearer" })).fetch);
    const r = await client.callTool({ name: "get_batch", arguments: { batchId: "0001-pilot" } });
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: "QA API error 401 UNAUTHORIZED" }]);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("an unknown tool is an error result with the preamble", async () => {
    const m = mockFetch();
    const client = await connect(m.fetch);
    const r = await client.callTool({ name: "delete_batch", arguments: {} });
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: "Unknown tool" }]);
    expect(m.calls).toEqual([]);
  });

  it("declares tools only: no resources, prompts or other capability", async () => {
    const client = await connect(mockFetch().fetch);
    const caps = client.getServerCapabilities();
    expect(Object.keys(caps ?? {})).toEqual(["tools"]);
    expect(client.getInstructions()).toBe(PREAMBLE_TEXT);
  });
});
