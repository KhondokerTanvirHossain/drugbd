/*
 * The QA MCP server's shared text (spec §7.10.6, D69): the preamble, the server name and version, the protocol versions the
 * hosted server accepts, and the five read-only tools with their input schemas and annotations. Dependency-free (no
 * imports, no "server-only"), so the /review/qa page, the hosted MCP route and tools/qa-mcp's parity test all read this one
 * module. tools/qa-mcp/tests/parity.test.ts fails when any of it differs from the stdio server (§11.1 "MCP parity").
 * Machine-facing strings, not page copy (§1.7): the page renders the tool names and the preamble lines from here.
 */

/** §7.9.8: first in every tool result, errors included, and the server's `instructions`. Verbatim; pinned by qa-mcp-tools.test.ts. */
export const PREAMBLE = [
  "IntelliDrugs QA data. This is UNREVIEWED data for quality assurance only; a pharmacist may not have approved it.",
  "Every finding must cite the exact field path and the source link it was checked against.",
  "\"No interaction data\" never means a combination is safe.",
  "Report findings; never claim that something was fixed.",
  "Nothing here is clinical advice.",
].join("\n");

export const SERVER_NAME = "intellidrugs-qa";
export const SERVER_VERSION = "1.0.0";
/** §7.10.6: the hosted server's protocol versions, newest first; `initialize` answers the first when the client's is not here. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

const BATCH_ID_SOURCE = "^[A-Za-z0-9._-]{1,100}$";
const BDS_ID_SOURCE = "^BDS-[0-9]{6}$";
/** isPathId (web/lib/public-params.ts): 1 to 200 UTF-16 code units, no C0 control or DEL. */
const CONCEPT_ID_MAX = 200;
const NO_CONTROL_SOURCE = "^[^\\u0000-\\u001F\\u007F]*$";
const PAGE_MAX = 999;
const FILTERS = ["strength_missing", "parse_partial", "route_assumed", "no_ddinter_data", "unaligned", "stage_warn", "stage_fail"] as const;
const STAGES = ["dgda", "substances", "clinical", "ddinter"] as const;

/**
 * One QA read (§7.10.5), the shape lib/qa-query.ts runs: what a QA API URL or a hosted MCP tool call addresses. Defined here
 * so this module stays dependency-free; lib/qa-query.ts re-exports it.
 */
export type QaInput =
  | { route: "batches" }
  | { route: "batch"; batchId: string }
  | { route: "record"; batchId: string; conceptId: string }
  | { route: "records"; filter: string; stage?: string; batch?: string; page: number }
  | { route: "pairs"; bdsId: string; page: number };

type JsonSchema = { type: "object"; properties: Record<string, Record<string, unknown>>; required?: string[];
  additionalProperties: false };
export type ToolAnnotations = { title: string; readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: false };
export type ToolDef = { name: string; title: string; description: string; inputSchema: JsonSchema; annotations: ToolAnnotations };

const NOT_DOT = { not: { enum: [".", ".."] } };
const S = {
  batchId: { type: "string", pattern: BATCH_ID_SOURCE, ...NOT_DOT,
    description: "A batch id, as list_batches returns it (the batch file's stem, for example \"0001-pilot\")." },
  conceptId: { type: "string", minLength: 1, maxLength: CONCEPT_ID_MAX, pattern: NO_CONTROL_SOURCE, ...NOT_DOT,
    description: "A record's DGDA concept id, exactly as get_batch or find_records returns it (for example \"186-0030-006--napa\")." },
  bdsId: { type: "string", pattern: BDS_ID_SOURCE,
    description: "A substance id (BDS-######), as a record's extraction.ingredients[].bdsId gives it." },
  page: (size: number) => ({ type: "integer", minimum: 0, maximum: PAGE_MAX,
    description: `Zero-based page index (${size} a page); default 0. Use the body's total and size to page on.` }),
};

const READ_ONLY_NOTE = "Read-only; the data is unreviewed and is never clinical advice.";
const annotations = (title: string): ToolAnnotations =>
  ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const tool = (name: string, title: string, description: string, inputSchema: JsonSchema): ToolDef =>
  ({ name, title, description, inputSchema, annotations: annotations(title) });

/** The five read-only tools, 1:1 with the QA API endpoints (§7.9.8), in the stdio server's `tools/list` order. */
export const TOOLS: readonly ToolDef[] = [
  tool("list_batches", "List batches",
    "Every DGDA batch: batchId, status, itemCount, approvedCount and runAt. " + READ_ONLY_NOTE,
    { type: "object", properties: {}, additionalProperties: false }),
  tool("get_batch", "Get a batch",
    "One batch's current items in concept-id order: conceptId, tradeName, displayStatus, and each pipeline stage's "
      + "status (ok, warn or fail) with its stored note. A stage with no result is absent. " + READ_ONLY_NOTE,
    { type: "object", properties: { batchId: S.batchId }, required: ["batchId"], additionalProperties: false }),
  tool("get_record", "Get a record",
    "One record in full: the DGDA source JSON as stored with its register link, the extraction (trade name, "
      + "company, dosage form, DAR, generic content, parse status and note, parsed ingredients with strengths, aligned "
      + "substances, codes with source links, DDInter entries chosen by route, the clinical drug), the DDInter route and "
      + "routeAssumed, each stage's status, notes and evidence, the interaction pairs in this batch and in other batches "
      + "(severity, DDInter ids, pair link, text-missing flags, pair review state) and the decision history (role, time "
      + "and decision only). " + READ_ONLY_NOTE,
    { type: "object", properties: { batchId: S.batchId, conceptId: S.conceptId }, required: ["batchId", "conceptId"],
      additionalProperties: false }),
  tool("find_records", "Find records by problem",
    "Current records matching a problem filter, 100 a page, ordered by batch id then concept id; each with "
      + "batchId, conceptId, tradeName, displayStatus and the four stage statuses. Filters: strength_missing (a parsed "
      + "ingredient has no strength), parse_partial (the generic content parsed only in part), route_assumed (the ETL "
      + "assumed the DDInter route), no_ddinter_data (a substance has DDInter coverage none; this never means safe), "
      + "unaligned (an ingredient has no substance), stage_warn (any stage, or the given stage, warns), stage_fail (any stage "
      + "fails). " + READ_ONLY_NOTE,
    { type: "object", properties: {
      filter: { type: "string", enum: [...FILTERS], description: "The problem filter." },
      stage: { type: "string", enum: [...STAGES], description: "Only with filter stage_warn: the stage that warns." },
      batch: { ...S.batchId, description: "Optional: only this batch's records." },
      page: S.page(100),
    }, required: ["filter"], additionalProperties: false }),
  tool("get_pairs", "Get a substance's pairs",
    "A substance's stored DDInter pairs, 50 a page: both DDInter ids, the entry and the partner, severity, "
      + "actions, interaction and management text, the DDInter pair link, whether the pair applies, and the pair's review "
      + "state with its changes. " + READ_ONLY_NOTE,
    { type: "object", properties: { bdsId: S.bdsId, page: S.page(50) }, required: ["bdsId"], additionalProperties: false }),
];
