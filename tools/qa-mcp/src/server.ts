import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { qaGet, type FetchOptions } from "./client.js";
import type { QaConfig } from "./config.js";
import { PREAMBLE } from "./preamble.js";
import { TOOLS, toPath } from "./tools.js";

/*
 * The stdio MCP server (spec §7.9.8): tools only, five of them, all read-only. Every result, errors included, is two text
 * items: the fixed preamble, then the QA API body as indented JSON (the envelope unchanged) or a fixed error line. The
 * low-level Server is used, not McpServer, so an input refusal also carries the preamble.
 */

export const SERVER_NAME = "intellidrugs-qa";
export const SERVER_VERSION = "1.0.0";

const result = (text: string, isError: boolean): CallToolResult => ({
  content: [{ type: "text", text: PREAMBLE }, { type: "text", text }],
  ...(isError ? { isError: true } : {}),
});

/** One tool call: check the input (no request on a refusal), GET the QA API, and shape the result. */
export async function callTool(config: QaConfig, name: string, args: Record<string, unknown> | undefined,
    options: FetchOptions = {}): Promise<CallToolResult> {
  const checked = toPath(name, args);
  if (!checked.ok) return result("unknownTool" in checked ? "Unknown tool" : `Invalid input ${checked.field}`, true);
  const answer = await qaGet(config, checked.path, options);
  return answer.ok ? result(JSON.stringify(answer.body, null, 2), false) : result(answer.message, true);
}

export function createServer(config: QaConfig, options: FetchOptions = {}): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: PREAMBLE });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
      annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(config, request.params.name, request.params.arguments, options));
  return server;
}
