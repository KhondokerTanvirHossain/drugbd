import { describe, expect, it } from "vitest";
import { PREAMBLE, SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS } from "@/lib/qa-mcp-tools";

/* §7.10.6, §11.1 "MCP parity": the web side of the shared MCP text. tools/qa-mcp/tests/parity.test.ts compares it with the stdio server. */
describe("lib/qa-mcp-tools.ts", () => {
  it("pins PREAMBLE to the §7.9.8 text, line for line", () => {
    expect(PREAMBLE.split("\n")).toEqual([
      "IntelliDrugs QA data. This is UNREVIEWED data for quality assurance only; a pharmacist may not have approved it.",
      "Every finding must cite the exact field path and the source link it was checked against.",
      "\"No interaction data\" never means a combination is safe.",
      "Report findings; never claim that something was fixed.",
      "Nothing here is clinical advice.",
    ]);
  });

  it("names the server, its version and the supported protocol versions (newest first)", () => {
    expect(SERVER_NAME).toBe("intellidrugs-qa");
    expect(SERVER_VERSION).toBe("1.0.0");
    expect(SUPPORTED_PROTOCOL_VERSIONS).toEqual(["2025-11-25", "2025-06-18", "2025-03-26"]);
  });

  it("lists exactly the five read-only tools, each annotated read-only and closed-world", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["list_batches", "get_batch", "get_record", "find_records", "get_pairs"]);
    for (const t of TOOLS) {
      expect(t.annotations).toEqual({ title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.description.endsWith("Read-only; the data is unreviewed and is never clinical advice.")).toBe(true);
    }
  });

  it("is dependency-free: no import, no server-only (another package's test imports it)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../lib/qa-mcp-tools.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/^\s*import\b/m);
    expect(src).not.toMatch(/\brequire\(/);
  });
});
