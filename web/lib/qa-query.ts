import "server-only";
import { qaPath, qaUpstream, type QaUpstream } from "./api";
import { recordAudit } from "./audit";
import { isPathId } from "./public-params";
import { MalformedBody, mapBatch, mapBatches, mapPairs, mapRecord, mapRecords } from "./qa-map";
import type { QaInput } from "./qa-mcp-tools";

/*
 * The shared QA query code (spec §7.10.5): one QA read as a QaInput, its §7.9.2 value checks, the internal API read, the
 * allowlist map (lib/qa-map.ts), the platform envelope and the qa_read row with the 200-only-after-its-row rule (§7.9.6).
 * The five /api/qa/v1/* route handlers (through qaHandler, lib/qa-api.ts) and the hosted MCP's tool calls (lib/qa-mcp.ts)
 * both answer through answerQa, so a tool call reads, maps and audits exactly as the equivalent GET, with no HTTP self-call.
 * Nothing here logs a label, an id or a query value.
 */

export type { QaInput } from "./qa-mcp-tools";

export type QaRoute = QaInput["route"];
/** A qa_read route name: a QA API route, or `mcp` for a hosted MCP request refused before any tool ran (§7.10.6). */
export type QaAuditRoute = QaRoute | "mcp";
export type QaCode = "INVALID_QUERY" | "UNAUTHORIZED" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE";

const ERRORS: Record<QaCode, { status: number; message: string }> = {
  INVALID_QUERY: { status: 400, message: "Invalid query" },
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  NOT_FOUND: { status: 404, message: "Not found" },
  RATE_LIMITED: { status: 429, message: "Too many requests" },
  UNAVAILABLE: { status: 502, message: "Unavailable" },
};

// ---- envelope (§7.9.1)

export type QaEnvelope = {
  success: boolean; data: unknown; message: string; errors: { field: string | null; code: QaCode; message: string }[];
  metadata: { timestamp: string; requestId: string };
};
/** An answer before it becomes an HTTP response (QA API) or a tool result (hosted MCP). */
export type QaAnswer = { status: number; body: QaEnvelope };

const metadata = (requestId: string) => ({ timestamp: new Date().toISOString(), requestId });

export function okAnswer(requestId: string, data: unknown): QaAnswer {
  return { status: 200, body: { success: true, data, message: "OK", errors: [], metadata: metadata(requestId) } };
}

export function failAnswer(requestId: string, code: QaCode, field: string | null = null): QaAnswer {
  const { status, message } = ERRORS[code];
  return { status, body: { success: false, data: null, message, errors: [{ field, code, message }], metadata: metadata(requestId) } };
}

// ---- input rules (§7.9.2)

export const BATCH_ID = /^[A-Za-z0-9._-]{1,100}$/;
export const BDS_ID = /^BDS-[0-9]{6}$/;
export const PAGE_MAX = 999;
export const QA_FILTERS = ["strength_missing", "parse_partial", "route_assumed", "no_ddinter_data", "unaligned", "stage_warn", "stage_fail"] as const;
export const QA_STAGES = ["dgda", "substances", "clinical", "ddinter"] as const;

/** What a read returns: the mapped data, or a 400, 404 or 502 with its field. */
export type QaOutcome = { ok: true; data: unknown } | { ok: false; code: "INVALID_QUERY" | "NOT_FOUND" | "UNAVAILABLE"; field: string | null };
export type QaRefusal = Extract<QaOutcome, { ok: false }>;
export const invalid = (field: string): QaRefusal => ({ ok: false, code: "INVALID_QUERY", field });
const UNAVAILABLE: QaRefusal = { ok: false, code: "UNAVAILABLE", field: null };

const isPage = (n: number) => Number.isInteger(n) && n >= 0 && n <= PAGE_MAX;

/**
 * The first refused value of a QaInput, in the route's §7.9.2 order, or null. The route handlers and the MCP tool check
 * (checkToolArgs) have already refused unknown inputs; this is the last line before a read.
 */
export function checkQaInput(input: QaInput): string | null {
  switch (input.route) {
    case "batches":
      return null;
    case "batch":
      return BATCH_ID.test(input.batchId) ? null : "batchId";
    case "record":
      if (!BATCH_ID.test(input.batchId)) return "batchId";
      return isPathId(input.conceptId) ? null : "conceptId";
    case "records":
      if (!(QA_FILTERS as readonly string[]).includes(input.filter)) return "filter";
      if (input.stage !== undefined && (input.filter !== "stage_warn" || !(QA_STAGES as readonly string[]).includes(input.stage))) return "stage";
      if (input.batch !== undefined && !BATCH_ID.test(input.batch)) return "batch";
      return isPage(input.page) ? null : "page";
    case "pairs":
      if (!BDS_ID.test(input.bdsId)) return "bdsId";
      return isPage(input.page) ? null : "page";
  }
}

const API_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * The internal API's answer as a QA outcome: data through the route's allowlist mapper (a malformed body is 502); an API 400
 * is a 400 with its field; an API 404 is a 404 when its field is one of the route's id fields (else the API is not the one
 * this web expects: 502); anything else (5xx, 401, a timeout, no token) is 502.
 */
export function fromUpstream(u: QaUpstream, idFields: readonly string[], map: (data: unknown) => unknown): QaOutcome {
  if (u.ok) {
    try {
      return { ok: true, data: map(u.data) };
    } catch (e) {
      if (e instanceof MalformedBody) return UNAVAILABLE;
      throw e;
    }
  }
  if (u.status === 400) return { ok: false, code: "INVALID_QUERY", field: u.field !== null && API_FIELD.test(u.field) ? u.field : null };
  if (u.status === 404 && u.field !== null && idFields.includes(u.field)) return { ok: false, code: "NOT_FOUND", field: u.field };
  return UNAVAILABLE;
}

async function read(input: QaInput): Promise<QaOutcome> {
  switch (input.route) {
    case "batches":
      return fromUpstream(await qaUpstream(qaPath.batches()), [], mapBatches);
    case "batch":
      return fromUpstream(await qaUpstream(qaPath.batch(input.batchId)), ["batchId"], mapBatch);
    case "record":
      return fromUpstream(await qaUpstream(qaPath.record(input.batchId, input.conceptId)), ["batchId", "conceptId"], mapRecord);
    case "records": {
      const params = new URLSearchParams({ filter: input.filter });
      if (input.stage !== undefined) params.set("stage", input.stage);
      if (input.batch !== undefined) params.set("batch", input.batch);
      params.set("page", String(input.page));
      return fromUpstream(await qaUpstream(qaPath.records(params)), ["batch"], mapRecords);
    }
    case "pairs": {
      const { bdsId, page } = input;
      return fromUpstream(await qaUpstream(qaPath.pairs(bdsId, page)), ["bdsId"], (data) => mapPairs(data, bdsId, page));
    }
  }
}

/** One QA read: the value checks, the internal API read and the allowlist map. Never throws (a failure is UNAVAILABLE). */
export async function runQa(input: QaInput): Promise<QaOutcome> {
  const bad = checkQaInput(input);
  if (bad !== null) return invalid(bad);
  try {
    return await read(input);
  } catch {
    return UNAVAILABLE;
  }
}

// ---- audit (§7.9.6)

/** One qa_read row: no actor; target `{label}/{route}`, or `{route}` unauthenticated; never a key, hash, id or query value. */
export async function auditQa(route: QaAuditRoute, label: string | null, outcome: string, requestId: string): Promise<boolean> {
  try {
    return await recordAudit({ event: "qa_read", targetType: "qa_route", targetId: label === null ? route : `${label}/${route}`,
      outcome, requestId });
  } catch {
    return false;
  }
}

/**
 * An outcome as an answer for an authenticated label: a 200 only after its qa_read row is written (else 502 with no data);
 * every other outcome's row is best effort and the answer stands.
 */
export async function answerOutcome(route: QaRoute, label: string, requestId: string, outcome: QaOutcome): Promise<QaAnswer> {
  if (outcome.ok) {
    if (!(await auditQa(route, label, "ok", requestId))) return failAnswer(requestId, "UNAVAILABLE");
    return okAnswer(requestId, outcome.data);
  }
  await auditQa(route, label, outcome.code.toLowerCase(), requestId);
  return failAnswer(requestId, outcome.code, outcome.field);
}

/** §7.10.5: run one QA read for an authenticated, unthrottled label and answer it with its qa_read row. Never throws. */
export async function answerQa(input: QaInput, label: string, requestId: string): Promise<QaAnswer> {
  try {
    return await answerOutcome(input.route, label, requestId, await runQa(input));
  } catch {
    return failAnswer(requestId, "UNAVAILABLE");
  }
}
