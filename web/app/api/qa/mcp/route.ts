import { handleMcp, mcpMethodNotAllowed } from "@/lib/qa-mcp";
import { withRequestLog } from "@/lib/request-log";

export const dynamic = "force-dynamic";

const ROUTE = "/api/qa/mcp";
const notAllowed = withRequestLog(ROUTE, async () => mcpMethodNotAllowed());

/**
 * The hosted QA MCP server (§7.10.6): MCP Streamable HTTP, stateless JSON responses, Bearer QA key only. This specific route
 * wins over the /api/qa/[[...rest]] catch-all. Every other method is 405 with Allow: POST (no SSE stream, no session to end).
 */
export const POST = withRequestLog(ROUTE, handleMcp);
export const GET = notAllowed;
export const DELETE = notAllowed;
export const PUT = notAllowed;
export const PATCH = notAllowed;
