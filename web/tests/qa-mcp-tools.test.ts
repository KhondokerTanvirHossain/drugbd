import { describe, expect, it } from "vitest";
import { PREAMBLE, SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS, TOOL_ROUTES, checkToolArgs } from "@/lib/qa-mcp-tools";

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

  it("checkToolArgs maps each tool to its QaInput, with page 0 when absent", () => {
    expect(checkToolArgs("list_batches", undefined)).toEqual({ ok: true, input: { route: "batches" } });
    expect(checkToolArgs("get_batch", { batchId: "0001-pilot" })).toEqual({ ok: true, input: { route: "batch", batchId: "0001-pilot" } });
    expect(checkToolArgs("get_record", { batchId: "0001-pilot", conceptId: "a b" }))
      .toEqual({ ok: true, input: { route: "record", batchId: "0001-pilot", conceptId: "a b" } });
    expect(checkToolArgs("find_records", { filter: "stage_warn", stage: "ddinter" }))
      .toEqual({ ok: true, input: { route: "records", filter: "stage_warn", stage: "ddinter", page: 0 } });
    expect(checkToolArgs("find_records", { filter: "unaligned", batch: "0001-pilot", page: 3 }))
      .toEqual({ ok: true, input: { route: "records", filter: "unaligned", batch: "0001-pilot", page: 3 } });
    expect(checkToolArgs("get_pairs", { bdsId: "BDS-000003" })).toEqual({ ok: true, input: { route: "pairs", bdsId: "BDS-000003", page: 0 } });
  });

  it("checkToolArgs names the refused input and the tool's route; an unknown tool has no route", () => {
    expect(checkToolArgs("get_batch", { batchId: ".." })).toEqual({ ok: false, field: "batchId", route: "batch" });
    expect(checkToolArgs("find_records", { filter: "stage_fail", stage: "dgda" })).toEqual({ ok: false, field: "stage", route: "records" });
    expect(checkToolArgs("get_pairs", { ["x".repeat(150)]: 1 })).toEqual({ ok: false, field: "x".repeat(100), route: "pairs" });
    expect(checkToolArgs("toString", {})).toEqual({ ok: false, unknownTool: true });
    expect(TOOL_ROUTES).toEqual({ list_batches: "batches", get_batch: "batch", get_record: "record", find_records: "records", get_pairs: "pairs" });
  });
});
