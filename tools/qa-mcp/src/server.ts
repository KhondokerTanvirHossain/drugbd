import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema, ListResourceTemplatesRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { qaGet, type FetchOptions } from "./client.js";
import type { QaConfig } from "./config.js";
import { PREAMBLE } from "./preamble.js";
import { GUIDE_TOOL, checkGuideArgs, guideBody, guideResources, readGuideResource } from "./qa-guide.js";
import { TOOLS, toPath } from "./tools.js";

/*
 * The stdio MCP server (spec §7.9.8): six read-only tools and the QA guide's resources (§7.11). Every tool result, errors
 * included, is two text items: the fixed preamble, then the QA API body as indented JSON (the envelope unchanged), the
 * guide JSON, or a fixed error line. The guide is bundled (src/qa-guide.ts, a byte-identical copy of web/lib/qa-guide.ts),
 * so get_qa_guide and the resource methods make no request. The low-level Server is used, not McpServer, so an input
 * refusal also carries the preamble.
 */

export const SERVER_NAME = "intellidrugs-qa";
/** 1.1.0 since the QA guide (a tool and resources added, nothing removed); pinned to the hosted server's by the parity test. */
export const SERVER_VERSION = "1.1.0";

const result = (text: string, isError: boolean): CallToolResult => ({
  content: [{ type: "text", text: PREAMBLE }, { type: "text", text }],
  ...(isError ? { isError: true } : {}),
});

/** One tool call: get_qa_guide from the bundled guide; otherwise check the input (no request on a refusal), GET the QA API. */
export async function callTool(config: QaConfig, name: string, args: Record<string, unknown> | undefined,
    options: FetchOptions = {}): Promise<CallToolResult> {
  if (name === GUIDE_TOOL.name) {
    const guide = checkGuideArgs(args);
    return guide.ok ? result(JSON.stringify(guideBody(guide.topic), null, 2), false) : result(`Invalid input ${guide.field}`, true);
  }
  const checked = toPath(name, args);
  if (!checked.ok) return result("unknownTool" in checked ? "Unknown tool" : `Invalid input ${checked.field}`, true);
  const answer = await qaGet(config, checked.path, options);
  return answer.ok ? result(JSON.stringify(answer.body, null, 2), false) : result(answer.message, true);
}

/** resources/read with its params left to the handler (see createServer). */
const READ_RESOURCE = z.object({ method: z.literal("resources/read"), params: z.unknown().optional() });
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const rpcError = (code: number, message: string) => Object.assign(new Error(message), { code });

export function createServer(config: QaConfig, options: FetchOptions = {}): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions: PREAMBLE });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
      annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(config, request.params.name, request.params.arguments, options));
  // §7.11.3: the guide as resources, from the bundle
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: guideResources() }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
  // The params are checked here, not by the SDK's ReadResourceRequestSchema, whose parse failure would answer -32603: a
  // missing or non-string uri is -32602 "Invalid params", as on the hosted server. Errors are thrown as plain Errors with a
  // code, not McpErrors (whose message the SDK prefixes with "MCP error {code}: "), so the code and message go out as they are.
  server.setRequestHandler(READ_RESOURCE, async (request) => {
    const uri = isObject(request.params) ? request.params.uri : undefined;
    if (typeof uri !== "string") throw rpcError(-32602, "Invalid params");
    const content = readGuideResource(uri);
    if (content === null) throw rpcError(-32002, "Resource not found");
    return { contents: [content] };
  });
  return server;
}
