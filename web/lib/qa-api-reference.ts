import "server-only";
import { QA_COPY } from "./copy";
import { ID_MAX } from "./public-params";
import { BATCHES_BODY, BATCH_BODY, EXAMPLE_BATCH, EXAMPLE_BDS, EXAMPLE_CONCEPT, EXAMPLE_REQUEST_ID, EXAMPLE_TIMESTAMP, PAIRS_BODY,
  RECORDS_BODY, RECORD_BODY } from "./qa-api-examples";
import { QA_RATE_LIMIT } from "./limits";
import { QA_PAIRS_SIZE, QA_RECORDS_SIZE, mapBatch, mapBatches, mapPairs, mapRecord, mapRecords } from "./qa-map";
import { DEFAULT_PROTOCOL_VERSION, MCP_MAX_BODY } from "./qa-mcp";
import { PREAMBLE, SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS, TOOL_ROUTES } from "./qa-mcp-tools";
import { BATCH_ID, BDS_ID, PAGE_MAX, QA_FILTERS, QA_STAGES, failAnswer, okAnswer, type QaAnswer, type QaCode, type QaEnvelope,
  type QaRoute } from "./qa-query";

/*
 * The /review/qa API reference (spec §5.18 section 3, D72), built once per request by qaReference(SITE_HOST) and rendered by
 * app/review/qa/ApiReference.tsx (a server component). Nothing here is typed twice:
 * - each example answer is the endpoint's real allowlist mapper (lib/qa-map.ts) over an example internal API body
 *   (lib/qa-api-examples.ts), wrapped by the real envelope (okAnswer, failAnswer) with fixed metadata;
 * - the MCP examples come from the shared MCP text (lib/qa-mcp-tools.ts) and the batches example envelope;
 * - every parameter rule, limit and number is read from the validators' own constants.
 * Commands, example answers, paths, patterns, values, headers and codes are code, not copy (§1.7); every sentence is
 * QA_COPY.reference, with its `{name}` placeholders filled here as plain text or mono code.
 */

const C = QA_COPY.reference;
const P = QA_COPY.page;

/** A filled placeholder: plain text, mono code, or a list of mono codes joined by ", ". */
export type Fill = string | { code: string } | { codes: readonly string[] };
/** A §1.7 sentence and its fills; the component renders each `{name}` with its fill. */
export type Sentence = { template: string; fills: Readonly<Record<string, Fill>> };
const say = (template: string, fills: Record<string, Fill> = {}): Sentence => ({ template, fills });
const code = (text: string): Fill => ({ code: text });
const codes = (list: readonly string[]): Fill => ({ codes: list });

/** A command or example answer: the text, its `<pre>` id, and the head row's label, copy button and region label. */
export type CodeBlock = { id: string; label: string; copyLabel: string; text: string; region: string; context: string };

/** What each parameter's rule says, as machine facts, so the tests compare them with the validators (§11.1 (b)). */
export type ParamFacts = { pattern?: string; max?: number; values?: readonly string[]; only?: string; pageMax?: number; size?: number };
export type RefParam = { name: string; in: "path" | "query"; required: boolean; rule: Sentence; facts: ParamFacts; example: string };
export type RefError = { status: number; code: QaCode; when: Sentence; fix: string; fields: readonly string[] };
export type KeyField = { path: string; text: string };

export type RefEndpoint = {
  id: string; route: QaRoute; request: string; returns: string; address: string; params: RefParam[];
  command: CodeBlock; answer: CodeBlock; keyFields: KeyField[]; errors: RefError[];
  /** The example internal API body and the URL the command addresses (path and query), for the accuracy tests. */
  example: { upstream: unknown; url: string; body: QaEnvelope };
};

export type McpError = { status: number; code: string; message: string; fix: Sentence };
export type McpReference = {
  id: string; request: string; returns: string; address: string;
  headers: { name: string; value: string; required: boolean }[];
  versionLine: Sentence; bodyLine: Sentence;
  initialize: { command: CodeBlock; answer: CodeBlock; message: unknown; body: unknown };
  call: { lead: Sentence; command: CodeBlock; answer: CodeBlock; message: unknown; body: unknown };
  tools: { name: string; args: { name: string; required: boolean }[]; request: string }[];
  argsLine: Sentence; errors: McpError[];
};

export type QaReference = {
  base: string; header: string;
  common: { lead: Sentence; error: CodeBlock; errorBody: QaEnvelope; exampleNote: Sentence; headersLine: Sentence; pageLine: Sentence };
  endpoints: RefEndpoint[]; mcp: McpReference;
};

/**
 * The data paths (`a.b[]` for an array's elements) where an example answer may hold null (§5.18 "Example content"): a stored
 * null the API really sends, shown on purpose. Anywhere else a null means an example body does not feed a mapper field, and
 * the accuracy test fails (§11.1).
 */
export const EXAMPLE_NULLS: Readonly<Record<QaRoute, readonly string[]>> = {
  batches: [],
  batch: [],   // a stage's note is TEXT NOT NULL: an ok stage's is ""
  record: [
    "extraction.parseNote",   // a full parse has no note
    "extraction.ingredients[].perValue", "extraction.ingredients[].perUnit",   // 500 mg, not per a volume
    "stages[].notes[].ddinterId", "stages[].notes[].route",   // a text_missing note names no single entry or route
    "pairs.inBatch.pairs[].link.fetchedAt", "pairs.otherBatches.pairs[].link.fetchedAt",   // no per-pair fetch time is stored
    "pairs.inBatch.pairs[].review.at", "pairs.otherBatches.pairs[].review.at",   // not reviewed yet
  ],
  records: [],
  pairs: ["pairs[].interaction", "pairs[].management", "pairs[].link.fetchedAt", "pairs[].review.at"],
};

/** The QA key header as every command sends it: the environment variable, never a key. */
export const KEY_VARIABLE = "$INTELLIDRUGS_QA_KEY";
const HEADER = "Authorization: Bearer <key>";

/** The example envelope: the real answer, with the fixed request id and time a reader can compare against. */
function example(answer: QaAnswer): QaEnvelope {
  return { ...answer.body, metadata: { timestamp: EXAMPLE_TIMESTAMP, requestId: EXAMPLE_REQUEST_ID } };
}
const ok = (data: unknown) => example(okAnswer(EXAMPLE_REQUEST_ID, data));
const json = (v: unknown) => JSON.stringify(v, null, 2);

/** `^[A-Za-z0-9._-]{1,100}$` → 100: the batch id's length limit, read from the pattern the routes test. */
function batchIdMax(): number {
  const m = /\{1,(\d+)\}\$$/.exec(BATCH_ID.source);
  if (!m) throw new Error("BATCH_ID has no {1,max} quantifier");
  return Number(m[1]);
}

function block(id: string, label: string, copyLabel: string, text: string, request: string): CodeBlock {
  const context = C.forRequest.replace("{request}", request);
  return { id, label, copyLabel, text, context, region: C.regionLabel.replace("{label}", label).replace("{request}", request) };
}

const curl = (url: string) => `curl -H "Authorization: Bearer ${KEY_VARIABLE}" "${url}"`;

function errorRows(fields400: readonly string[], fields404: readonly string[]): RefError[] {
  const field = code("errors[0].field");
  const rows: RefError[] = [
    fields400.length === 0
      ? { status: 400, code: "INVALID_QUERY", when: say(C.when400None, { field }), fix: C.fix400, fields: [] }
      : { status: 400, code: "INVALID_QUERY", when: say(C.when400, { field, fields: codes(fields400) }), fix: C.fix400, fields: fields400 },
    { status: 401, code: "UNAUTHORIZED", when: say(C.when401), fix: C.fix401, fields: [] },
  ];
  if (fields404.length > 0) rows.push({ status: 404, code: "NOT_FOUND", when: say(C.when404, { field, fields: codes(fields404) }), fix: C.fix404,
    fields: fields404 });
  rows.push({ status: 429, code: "RATE_LIMITED", when: say(C.when429, { limit: String(QA_RATE_LIMIT) }), fix: C.fix429, fields: [] });
  rows.push({ status: 502, code: "UNAVAILABLE", when: say(C.when502), fix: C.fix502, fields: [] });
  return rows;
}

/** Everything the /review/qa "API" section shows, for SITE_HOST `host`. */
export function qaReference(host: string): QaReference {
  const base = `https://${host}/api/qa/v1`;
  const max = batchIdMax();

  const batchIdParam = (source: string): RefParam => ({ name: "batchId", in: "path", required: true,
    rule: say(C.ruleBatchId, { max: String(max), pattern: code(BATCH_ID.source), source: code(source) }),
    facts: { pattern: BATCH_ID.source, max }, example: EXAMPLE_BATCH });
  const pageParam = (size: number): RefParam => ({ name: "page", in: "query", required: false,
    rule: say(C.rulePage, { max: String(PAGE_MAX), size: String(size) }), facts: { pageMax: PAGE_MAX, size }, example: "0" });

  function endpoint(e: { id: string; route: QaRoute; request: string; returns: string; path: string; params: RefParam[];
    upstream: unknown; data: unknown; keyFields: KeyField[]; errors: RefError[] }): RefEndpoint {
    const body = ok(e.data);
    return {
      id: e.id, route: e.route, request: e.request, returns: e.returns, address: `GET https://${host}${e.request.slice(4)}`,
      params: e.params,
      command: block(`${e.id}-command`, C.command, P.copyCommand, curl(`https://${host}${e.path}`), e.request),
      answer: block(`${e.id}-answer`, C.answer, P.copyExample, json(body), e.request),
      keyFields: e.keyFields, errors: e.errors, example: { upstream: e.upstream, url: e.path, body },
    };
  }

  const batches = endpoint({
    id: "qa-ref-batches", route: "batches", request: "GET /api/qa/v1/batches", returns: P.returnsBatches, path: "/api/qa/v1/batches",
    params: [], upstream: BATCHES_BODY, data: mapBatches(BATCHES_BODY),
    keyFields: [
      { path: "batches[].batchId", text: C.fieldBatchesBatchId }, { path: "batches[].status", text: C.fieldBatchesStatus },
      { path: "batches[].itemCount", text: C.fieldBatchesItemCount }, { path: "batches[].approvedCount", text: C.fieldBatchesApprovedCount },
      { path: "batches[].runAt", text: C.fieldBatchesRunAt },
    ],
    errors: errorRows([], []),
  });

  const batch = endpoint({
    id: "qa-ref-batch", route: "batch", request: "GET /api/qa/v1/batches/{batchId}", returns: P.returnsBatch,
    path: `/api/qa/v1/batches/${EXAMPLE_BATCH}`, params: [batchIdParam("GET /api/qa/v1/batches")],
    upstream: BATCH_BODY, data: mapBatch(BATCH_BODY),
    keyFields: [
      { path: "items[].conceptId", text: C.fieldBatchConceptId }, { path: "items[].displayStatus", text: C.fieldBatchDisplayStatus },
      { path: "items[].stages[].stage", text: C.fieldBatchStage }, { path: "items[].stages[].status", text: C.fieldBatchStageStatus },
      { path: "items[].stages[].note", text: C.fieldBatchStageNote },
    ],
    errors: errorRows(["batchId"], ["batchId"]),
  });

  const record = endpoint({
    id: "qa-ref-record", route: "record", request: "GET /api/qa/v1/batches/{batchId}/records/{conceptId}", returns: P.returnsRecord,
    path: `/api/qa/v1/batches/${EXAMPLE_BATCH}/records/${EXAMPLE_CONCEPT}`,
    params: [batchIdParam("GET /api/qa/v1/batches"), { name: "conceptId", in: "path", required: true,
      rule: say(C.ruleConceptId, { max: String(ID_MAX), source: code("GET /api/qa/v1/batches/{batchId}") }), facts: { max: ID_MAX },
      example: EXAMPLE_CONCEPT }],
    upstream: RECORD_BODY, data: mapRecord(RECORD_BODY),
    keyFields: [
      { path: "source.json", text: C.fieldRecordSourceJson }, { path: "source.link", text: C.fieldRecordSourceLink },
      { path: "extraction.ingredients[].strengthValue", text: C.fieldRecordStrength },
      { path: "extraction.ingredients[].codes[]", text: C.fieldRecordCodes },
      { path: "extraction.ingredients[].coverage", text: C.fieldRecordCoverage },
      { path: "extraction.ingredients[].ddinter.chosen[]", text: C.fieldRecordChosen },
      { path: "ddinterRoute", text: C.fieldRecordRoute }, { path: "stages[].evidence", text: C.fieldRecordEvidence },
      { path: "pairs.inBatch.pairs[].textMissing", text: C.fieldRecordTextMissing },
      { path: "pairs.otherBatches.pairs[]", text: C.fieldRecordOtherPairs }, { path: "history[]", text: C.fieldRecordHistory },
    ],
    errors: errorRows(["batchId", "conceptId"], ["batchId", "conceptId"]),
  });

  const records = endpoint({
    id: "qa-ref-records", route: "records", request: "GET /api/qa/v1/records", returns: P.returnsRecords,
    path: `/api/qa/v1/records?filter=stage_warn&stage=ddinter&batch=${EXAMPLE_BATCH}&page=0`,
    params: [
      { name: "filter", in: "query", required: true, rule: say(C.ruleFilter, { values: codes(QA_FILTERS) }), facts: { values: QA_FILTERS },
        example: "stage_warn" },
      { name: "stage", in: "query", required: false, rule: say(C.ruleStage, { values: codes(QA_STAGES), only: code("filter=stage_warn") }),
        facts: { values: QA_STAGES, only: "stage_warn" }, example: "ddinter" },
      { name: "batch", in: "query", required: false, rule: say(C.ruleBatch, { pattern: code(BATCH_ID.source) }),
        facts: { pattern: BATCH_ID.source, max }, example: EXAMPLE_BATCH },
      pageParam(QA_RECORDS_SIZE),
    ],
    upstream: RECORDS_BODY, data: mapRecords(RECORDS_BODY),
    keyFields: [
      { path: "total", text: C.fieldRecordsTotal }, { path: "page", text: C.fieldRecordsPage }, { path: "stage", text: C.fieldRecordsStage },
      { path: "batch", text: C.fieldRecordsBatch }, { path: "items[]", text: C.fieldRecordsItems },
      { path: "items[].stages", text: C.fieldRecordsStages },
    ],
    errors: errorRows(["filter", "stage", "batch", "page"], ["batch"]),
  });

  const pairs = endpoint({
    id: "qa-ref-pairs", route: "pairs", request: "GET /api/qa/v1/substances/{bdsId}/pairs", returns: P.returnsPairs,
    path: `/api/qa/v1/substances/${EXAMPLE_BDS}/pairs?page=0`,
    params: [{ name: "bdsId", in: "path", required: true,
      rule: say(C.ruleBdsId, { pattern: code(BDS_ID.source), source: code("extraction.ingredients[].bdsId") }),
      facts: { pattern: BDS_ID.source }, example: EXAMPLE_BDS }, pageParam(QA_PAIRS_SIZE)],
    upstream: PAIRS_BODY, data: mapPairs(PAIRS_BODY, EXAMPLE_BDS, 0),
    keyFields: [
      { path: "total", text: C.fieldPairsTotal }, { path: "pairs[].entry", text: C.fieldPairsEntry },
      { path: "pairs[].partner", text: C.fieldPairsPartner }, { path: "pairs[].severity", text: C.fieldPairsSeverity },
      { path: "pairs[].interaction", text: C.fieldPairsInteraction }, { path: "pairs[].applies", text: C.fieldPairsApplies },
      { path: "pairs[].review", text: C.fieldPairsReview }, { path: "pairs[].changes[]", text: C.fieldPairsChanges },
    ],
    errors: errorRows(["bdsId", "page"], ["bdsId"]),
  });

  const endpoints = [batches, batch, record, records, pairs];
  const errorBody = example(failAnswer(EXAMPLE_REQUEST_ID, "INVALID_QUERY", "filter"));

  return {
    base, header: HEADER,
    common: {
      lead: say(C.commonHeader, { header: code(HEADER), key: code("<key>") }),
      error: { ...block("qa-ref-error", C.errorAnswer, P.copyExample, json(errorBody), ""), region: C.errorAnswer, context: "" },
      errorBody,
      exampleNote: say(C.exampleNote),
      headersLine: say(C.headersLine, { auth: code("WWW-Authenticate: Bearer"), retry: code("Retry-After: 60") }),
      pageLine: say(C.pageLine, { page: code("page"), total: code("total"), size: code("size") }),
    },
    endpoints,
    mcp: mcpReference(host, batches.example.body, endpoints),
  };
}

const MCP_REQUEST = "POST /api/qa/mcp";

function mcpReference(host: string, batchesBody: QaEnvelope, endpoints: RefEndpoint[]): McpReference {
  const address = `https://${host}/api/qa/mcp`;
  const version = SUPPORTED_PROTOCOL_VERSIONS[0];
  const head = [`curl "${address}" \\`, `  -H "Authorization: Bearer ${KEY_VARIABLE}" \\`, '  -H "Content-Type: application/json" \\',
    '  -H "Accept: application/json, text/event-stream" \\'];

  const initMessage = { jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "qa-script", version: "1.0.0" } } };
  const initBody = { jsonrpc: "2.0", id: 1, result: { protocolVersion: version, capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: PREAMBLE } };
  const callMessage = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_batches", arguments: {} } };
  // The hosted server's tool result (lib/qa-mcp.ts toolText): the preamble, then the envelope indented by 2.
  const callBody = { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: PREAMBLE }, { type: "text", text: json(batchesBody) }] } };

  const requestOf = Object.fromEntries(endpoints.map((e) => [e.route, e.request]));
  const fixSay = (text: string) => say(text);
  const kib = String(MCP_MAX_BODY / 1024);

  return {
    id: "qa-ref-mcp", request: MCP_REQUEST, returns: C.mcpReturns, address,
    headers: [
      { name: "Authorization", value: "Bearer <key>", required: true },
      { name: "Content-Type", value: "application/json", required: true },
      { name: "Accept", value: "application/json, text/event-stream", required: false },
      { name: "MCP-Protocol-Version", value: version, required: false },
    ],
    versionLine: say(C.versionLine, { default: code(DEFAULT_PROTOCOL_VERSION), versions: codes(SUPPORTED_PROTOCOL_VERSIONS) }),
    bodyLine: say(C.bodyLine, { max: kib, methods: codes(["initialize", "ping", "tools/list", "tools/call"]) }),
    initialize: {
      command: block("qa-ref-mcp-init-command", C.command, P.copyCommand, [...head, `  -d '${JSON.stringify(initMessage)}'`].join("\n"), "initialize"),
      answer: block("qa-ref-mcp-init-answer", C.answer, P.copyExample, json(initBody), "initialize"),
      message: initMessage, body: initBody,
    },
    call: {
      lead: say(C.callLead, { path: code("GET /api/qa/v1/batches") }),
      command: block("qa-ref-mcp-call-command", C.command, P.copyCommand,
        [...head, `  -H "MCP-Protocol-Version: ${version}" \\`, `  -d '${JSON.stringify(callMessage)}'`].join("\n"), "tools/call"),
      answer: block("qa-ref-mcp-call-answer", C.answer, P.copyExample, json(callBody), "tools/call"),
      message: callMessage, body: callBody,
    },
    tools: TOOLS.map((t) => ({
      name: t.name,
      args: Object.keys(t.inputSchema.properties).map((name) => ({ name, required: (t.inputSchema.required ?? []).includes(name) })),
      request: requestOf[TOOL_ROUTES[t.name]],
    })),
    argsLine: say(C.argsLine, { page: code("page"), batchId: code("batchId"), batch: code("batch"), conceptId: code("conceptId"),
      dot: code("."), dotdot: code("..") }),
    errors: [
      { status: 405, code: "-32000", message: "Method not allowed", fix: fixSay(C.mcpFix405) },
      { status: 403, code: "-32002", message: "Forbidden", fix: fixSay(C.mcpFix403) },
      { status: 401, code: "-32001", message: "Unauthorized", fix: fixSay(C.fix401) },
      { status: 502, code: "-32004", message: "Unavailable", fix: fixSay(C.mcpFix502) },
      { status: 429, code: "-32003", message: "Too many requests", fix: fixSay(C.fix429) },
      { status: 415, code: "-32000", message: "Unsupported media type", fix: fixSay(C.mcpFix415) },
      { status: 406, code: "-32000", message: "Not acceptable", fix: fixSay(C.mcpFix406) },
      { status: 413, code: "-32000", message: "Request too large", fix: say(C.mcpFix413, { max: kib }) },
      { status: 400, code: "-32700", message: "Parse error", fix: fixSay(C.mcpFixParse) },
      { status: 400, code: "-32600", message: "Invalid Request", fix: fixSay(C.mcpFixInvalidRequest) },
      { status: 400, code: "-32600", message: "Unsupported protocol version", fix: fixSay(C.mcpFixVersion) },
      { status: 200, code: "-32602", message: "Invalid params", fix: fixSay(C.mcpFixParams) },
      { status: 200, code: "-32601", message: "Method not found", fix: fixSay(C.mcpFixMethod) },
      { status: 200, code: "-32603", message: "Internal error", fix: fixSay(C.mcpFixInternal) },
      { status: 200, code: "isError: true", message: "Invalid input {name}", fix: fixSay(C.mcpFixInput) },
      { status: 200, code: "isError: true", message: "Unknown tool", fix: fixSay(C.mcpFixUnknownTool) },
      { status: 200, code: "isError: true", message: "QA API error {status} {code}", fix: fixSay(C.mcpFixQaError) },
    ],
  };
}

/** Every command and example answer of the reference, in page order (the §10.6 budget and the secret guard read it). */
export function codeBlocks(ref: QaReference): CodeBlock[] {
  return [ref.common.error, ...ref.endpoints.flatMap((e) => [e.command, e.answer]),
    ref.mcp.initialize.command, ref.mcp.initialize.answer, ref.mcp.call.command, ref.mcp.call.answer];
}
