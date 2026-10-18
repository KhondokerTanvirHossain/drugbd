import { describe, expect, it } from "vitest";
import { PREAMBLE } from "../src/preamble.js";
import { SERVER_NAME, SERVER_VERSION } from "../src/server.js";
import { TOOLS } from "../src/tools.js";

/*
 * §7.10.6, §11.1 "MCP parity": the hosted server (web/lib/qa-mcp-tools.ts, dependency-free) and this stdio server must say
 * the same thing. The web module is loaded by URL at run time, so this package's typecheck (rootDir ".") never reads it.
 */
type WebTool = { name: string; title: string; description: string; inputSchema: unknown; annotations: unknown };
type WebModule = { PREAMBLE: string; SERVER_NAME: string; SERVER_VERSION: string; TOOLS: readonly WebTool[] };
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
