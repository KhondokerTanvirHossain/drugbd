import "server-only";
import { LIMITS, allowQaRateLimitedAudit, allowQaUnauthorizedAudit } from "./limits";
import { authenticateQa, requestIdOf } from "./qa-api";
import { PREAMBLE, SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS, checkToolArgs } from "./qa-mcp-tools";
import { answerQa, auditQa } from "./qa-query";
import { clientIp } from "./rate-limit";
import { siteOrigin } from "./site";

/*
 * The hosted QA MCP server (spec §7.10.6, D69): MCP Streamable HTTP, stateless, JSON responses only. One POST carries one
 * JSON-RPC message and gets one application/json answer (or 202 with no body); no SSE, no Mcp-Session-Id, no server-to-client
 * request. The checks run in the §7.10.6 order; tool calls go through checkToolArgs (the stdio server's input rules) and
 * answerQa (lib/qa-query.ts), so each writes the same qa_read row as the equivalent QA API GET and counts once toward the
 * same per-key limit. Error messages are fixed strings; nothing here logs a body, a method name, a key, a label or an email.
 */

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;
/** The body limit (§7.10.6 step 7), counted while reading. */
export const MCP_MAX_BODY = 64 * 1024;
/** The version a request without MCP-Protocol-Version speaks (MCP specification). */
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

type Id = string | number | null;

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, "Content-Type": "application/json", ...extra } });
}

function rpcError(status: number, id: Id, code: number, message: string, extra: Record<string, string> = {}): Response {
  return json(status, { jsonrpc: "2.0", id, error: { code, message } }, extra);
}

const rpcResult = (id: Id, result: unknown) => json(200, { jsonrpc: "2.0", id, result });
const accepted = () => new Response(null, { status: 202, headers: HEADERS });

/** Step 1: every method but POST (GET, DELETE, PUT, PATCH). */
export function mcpMethodNotAllowed(): Response {
  return rpcError(405, null, -32000, "Method not allowed", { Allow: "POST" });
}

/** Step 5: `application/json`, any case, parameters allowed. */
function isJsonContentType(value: string | null): boolean {
  return value !== null && value.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

/** Step 6: absent, or one media range that covers application/json (application/json, application/*, *\/*) with q > 0. */
function acceptsJson(value: string | null): boolean {
  if (value === null) return true;
  return value.split(",").some((range) => {
    const [type, ...params] = range.split(";").map((p) => p.trim().toLowerCase());
    if (type !== "application/json" && type !== "application/*" && type !== "*/*") return false;
    const q = params.find((p) => p.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

/** Step 7: the body's bytes, or null once more than MCP_MAX_BODY have arrived (the rest is never read). */
async function readBody(request: Request): Promise<Uint8Array | null> {
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MCP_MAX_BODY) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Step 8: strict UTF-8, then JSON. `undefined` when either fails. */
function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string | number => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/** A JSON-RPC 2.0 request or notification, a client response, or invalid (step 9). */
type Message = { kind: "request"; id: string | number; method: string; params: unknown }
  | { kind: "notification"; method: string } | { kind: "response"; id: string | number };

function messageOf(v: unknown): Message | null {
  if (!isObject(v) || v.jsonrpc !== "2.0") return null;
  if (Object.hasOwn(v, "method")) {
    if (typeof v.method !== "string") return null;
    if (!Object.hasOwn(v, "id")) return { kind: "notification", method: v.method };
    return isId(v.id) ? { kind: "request", id: v.id, method: v.method, params: v.params } : null;
  }
  // A client's answer to a server request (this server sends none): an id and exactly one of result and error.
  if (isId(v.id) && Object.hasOwn(v, "result") !== Object.hasOwn(v, "error")) return { kind: "response", id: v.id };
  return null;
}

const toolText = (text: string, isError: boolean) => ({
  content: [{ type: "text", text: PREAMBLE }, { type: "text", text }], ...(isError ? { isError: true } : {}),
});

const TOOL_LIST = TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
  annotations: t.annotations }));

/** One tools/call (§7.10.6): the stdio input rules, then answerQa; the result is the stdio server's, byte for byte. */
async function callTool(name: string, args: Record<string, unknown> | undefined, label: string, rid: string) {
  const checked = checkToolArgs(name, args);
  if (!checked.ok) {
    if ("unknownTool" in checked) return toolText("Unknown tool", true);
    await auditQa(checked.route, label, "invalid_query", rid);
    return toolText(`Invalid input ${checked.field}`, true);
  }
  const answer = await answerQa(checked.input, label, rid);
  if (answer.status === 200) return toolText(JSON.stringify(answer.body, null, 2), false);
  return toolText(`QA API error ${answer.status} ${answer.body.errors[0]?.code ?? ""}`.trimEnd(), true);
}

async function dispatch(m: Extract<Message, { kind: "request" }>, label: string, rid: string): Promise<Response> {
  const invalidParams = () => rpcError(200, m.id, -32602, "Invalid params");
  switch (m.method) {
    case "initialize": {
      if (!isObject(m.params) || typeof m.params.protocolVersion !== "string") return invalidParams();
      const asked = m.params.protocolVersion;
      const version = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpcResult(m.id, { protocolVersion: version, capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: PREAMBLE });
    }
    case "ping":
      return rpcResult(m.id, {});
    case "tools/list":
      return rpcResult(m.id, { tools: TOOL_LIST });
    case "tools/call": {
      if (!isObject(m.params) || typeof m.params.name !== "string") return invalidParams();
      const args = m.params.arguments;
      if (Object.hasOwn(m.params, "arguments") && !isObject(args)) return invalidParams();
      return rpcResult(m.id, await callTool(m.params.name, args as Record<string, unknown> | undefined, label, rid));
    }
    default:
      return rpcError(200, m.id, -32601, "Method not found");
  }
}

/** POST /api/qa/mcp: the §7.10.6 checks in order, then dispatch. Never 500. */
export async function handleMcp(request: Request): Promise<Response> {
  const rid = requestIdOf(request);
  let id: Id = null;
  try {
    // 2: DNS-rebinding protection. No Origin (a non-browser client) or the site's own; `null` and every other origin refused.
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== siteOrigin()) return rpcError(403, null, -32002, "Forbidden");

    // 3: an env or DB key (§7.10.4).
    const auth = await authenticateQa(request.headers.get("authorization"));
    if (!auth.ok && auth.status === 502) {
      await auditQa("mcp", null, "unavailable", rid);
      return rpcError(502, null, -32004, "Unavailable");
    }
    if (!auth.ok) {
      if (allowQaUnauthorizedAudit("mcp", clientIp(request.headers), LIMITS)) await auditQa("mcp", null, "unauthorized", rid);
      return rpcError(401, null, -32001, "Unauthorized", { "WWW-Authenticate": "Bearer" });
    }
    const label = auth.label;

    // 4: the key's limit, shared with the QA API; every authenticated MCP request counts once.
    if (!LIMITS.qa.allow(label)) {
      if (allowQaRateLimitedAudit(label, LIMITS)) await auditQa("mcp", label, "rate_limited", rid);
      return rpcError(429, null, -32003, "Too many requests", { "Retry-After": "60" });
    }

    // 5–8: media types, size, JSON.
    if (!isJsonContentType(request.headers.get("content-type"))) return rpcError(415, null, -32000, "Unsupported media type");
    if (!acceptsJson(request.headers.get("accept"))) return rpcError(406, null, -32000, "Not acceptable");
    const bytes = await readBody(request);
    if (bytes === null) return rpcError(413, null, -32000, "Request too large");
    const parsed = parseJson(bytes);
    if (parsed === undefined) return rpcError(400, null, -32700, "Parse error");

    // 9: one JSON-RPC 2.0 message; a batch (array) is refused.
    const m = messageOf(parsed);
    if (m === null) return rpcError(400, null, -32600, "Invalid Request");
    if (m.kind !== "notification") id = m.id;

    // 10: the protocol version of every message but initialize; absent is the specification's default.
    if (!(m.kind !== "response" && m.method === "initialize")) {
      const version = request.headers.get("mcp-protocol-version") ?? DEFAULT_PROTOCOL_VERSION;
      if (!(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
        return rpcError(400, m.kind === "request" ? m.id : null, -32600, "Unsupported protocol version");
      }
    }

    // 11: notifications and client responses are accepted with no body; requests are dispatched.
    if (m.kind !== "request") return accepted();
    return await dispatch(m, label, rid);
  } catch {
    return rpcError(200, id, -32603, "Internal error");
  }
}
