import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { GUIDE, GUIDE_TOPICS, guideBody, guideResources } from "../src/qa-guide.js";
import { SERVER_VERSION, createServer } from "../src/server.js";
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
  it("lists exactly the six read-only tools, with JSON-schema inputs carrying the §7.9.2 patterns and enums", async () => {
    const client = await connect(mockFetch().fetch);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["list_batches", "get_batch", "get_record", "find_records", "get_pairs", "get_qa_guide"]);
    expect(tools.find((t) => t.name === "get_qa_guide")!.inputSchema).toEqual({ type: "object",
      properties: { topic: { type: "string", enum: [...GUIDE_TOPICS], description: expect.any(String) } }, additionalProperties: false });
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

  it("declares tools and resources only (the QA guide, §7.11.3): no prompts or other capability; version 1.1.0", async () => {
    const client = await connect(mockFetch().fetch);
    const caps = client.getServerCapabilities();
    expect(Object.keys(caps ?? {}).sort()).toEqual(["resources", "tools"]);
    expect(client.getInstructions()).toBe(PREAMBLE_TEXT);
    expect(client.getServerVersion()).toEqual({ name: "intellidrugs-qa", version: "1.1.0" });
    expect(SERVER_VERSION).toBe("1.1.0");
    expect(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version).toBe("1.1.0");
  });
});

/** One raw JSON-RPC message to a fresh server (no client), and the server's answer, so error codes and messages show exactly. */
async function raw(message: JSONRPCMessage, fetch = mockFetch().fetch): Promise<JSONRPCMessage> {
  const server = createServer(CONFIG, { fetch });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const answer = new Promise<JSONRPCMessage>((resolve) => { b.onmessage = resolve; });
  await b.start();
  await b.send(message);
  const out = await answer;
  await server.close();
  return out;
}

describe("the QA guide over the protocol (§7.11.2, §7.11.3), bundled: no request", () => {
  it("get_qa_guide answers the preamble, then the guide JSON; a bad topic is refused", async () => {
    const m = mockFetch();
    const client = await connect(m.fetch);
    expect((await client.callTool({ name: "get_qa_guide", arguments: {} })).content)
      .toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: JSON.stringify(guideBody(null), null, 2) }]);
    for (const topic of GUIDE_TOPICS) {
      expect((await client.callTool({ name: "get_qa_guide", arguments: { topic } })).content)
        .toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: JSON.stringify(guideBody(topic), null, 2) }]);
    }
    const r = await client.callTool({ name: "get_qa_guide", arguments: { topic: "nope" } });
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: "text", text: PREAMBLE_TEXT }, { type: "text", text: "Invalid input topic" }]);
    expect(m.calls).toEqual([]);
  });

  it("resources/list is the six topics; resources/templates/list is empty", async () => {
    const m = mockFetch();
    const client = await connect(m.fetch);
    expect((await client.listResources()).resources).toEqual(guideResources());
    expect((await client.listResourceTemplates()).resourceTemplates).toEqual([]);
    expect(m.calls).toEqual([]);
  });

  it("resources/read of each uri is its Markdown text", async () => {
    const m = mockFetch();
    const client = await connect(m.fetch);
    for (const t of GUIDE_TOPICS) {
      const uri = `intellidrugs://qa-guide/${t}`;
      expect((await client.readResource({ uri })).contents).toEqual([{ uri, mimeType: "text/markdown", text: GUIDE[t].text }]);
    }
    expect(m.calls).toEqual([]);
  });

  it("an unknown uri is -32002 with the message exactly \"Resource not found\" and no data", async () => {
    for (const uri of ["intellidrugs://qa-guide/OVERVIEW", "intellidrugs://qa-guide/overview/", "intellidrugs://qa-guide/", "x"]) {
      expect(await raw({ jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri } }))
        .toEqual({ jsonrpc: "2.0", id: 5, error: { code: -32002, message: "Resource not found" } });
    }
  });

  it("a missing or non-string uri is -32602 \"Invalid params\", as on the hosted server", async () => {
    for (const params of [undefined, {}, { uri: 1 }, { uri: null }]) {
      expect(await raw({ jsonrpc: "2.0", id: 6, method: "resources/read", ...(params === undefined ? {} : { params }) } as JSONRPCMessage))
        .toEqual({ jsonrpc: "2.0", id: 6, error: { code: -32602, message: "Invalid params" } });
    }
  });
});
