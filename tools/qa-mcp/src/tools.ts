import { z } from "zod";

/*
 * The five read-only tools, 1:1 with the QA API endpoints (spec §7.9.8), their JSON-schema inputs and the input check that
 * turns a call into a QA API path. The check carries the §7.9.2 rules (and refuses dot segments, which no HTTP client can
 * send), so a bad input fails here, before any request. The JSON schemas and the check share the constants below.
 */

export const BATCH_ID = /^[A-Za-z0-9._-]{1,100}$/;
export const BDS_ID = /^BDS-[0-9]{6}$/;
/** isPathId (web/lib/public-params.ts): 1 to 200 UTF-16 code units, no C0 control or DEL. */
export const CONCEPT_ID_MAX = 200;
const NO_CONTROL = /^[^\u0000-\u001F\u007F]*$/;
const NO_CONTROL_SOURCE = "^[^\\u0000-\\u001F\\u007F]*$";
export const PAGE_MAX = 999;
export const FILTERS = ["strength_missing", "parse_partial", "route_assumed", "no_ddinter_data", "unaligned", "stage_warn",
  "stage_fail"] as const;
export const STAGES = ["dgda", "substances", "clinical", "ddinter"] as const;

/**
 * "." and ".." are dot segments: every URL parser (fetch included) collapses them, even percent-encoded, so such an id would
 * address a different route. The pattern allows dots, so this is refused separately; no real batch or concept id is one.
 */
const notDotSegment = (s: string) => s !== "." && s !== "..";
/** encodeURIComponent throws on a lone surrogate: such an id cannot be put in a URL. */
const encodable = (s: string) => {
  try {
    encodeURIComponent(s);
    return true;
  } catch {
    return false;
  }
};

const batchId = z.string().regex(BATCH_ID).refine(notDotSegment);
const conceptId = z.string().min(1).max(CONCEPT_ID_MAX).regex(NO_CONTROL).refine(notDotSegment).refine(encodable);
const bdsId = z.string().regex(BDS_ID);
const page = z.number().int().min(0).max(PAGE_MAX);
const filter = z.enum(FILTERS);
const stage = z.enum(STAGES);

type JsonSchema = { type: "object"; properties: Record<string, Record<string, unknown>>; required?: string[];
  additionalProperties: false };
export type ToolDef = { name: string; title: string; description: string; inputSchema: JsonSchema };

const NOT_DOT = { not: { enum: [".", ".."] } };
const S = {
  batchId: { type: "string", pattern: BATCH_ID.source, ...NOT_DOT,
    description: "A batch id, as list_batches returns it (the batch file's stem, for example \"0001-pilot\")." },
  conceptId: { type: "string", minLength: 1, maxLength: CONCEPT_ID_MAX, pattern: NO_CONTROL_SOURCE, ...NOT_DOT,
    description: "A record's DGDA concept id, exactly as get_batch or find_records returns it (for example \"186-0030-006--napa\")." },
  bdsId: { type: "string", pattern: BDS_ID.source,
    description: "A substance id (BDS-######), as a record's extraction.ingredients[].bdsId gives it." },
  page: (size: number) => ({ type: "integer", minimum: 0, maximum: PAGE_MAX,
    description: `Zero-based page index (${size} a page); default 0. Use the body's total and size to page on.` }),
};

const READ_ONLY_NOTE = "Read-only; the data is unreviewed and is never clinical advice.";

export const TOOLS: readonly ToolDef[] = [
  {
    name: "list_batches",
    title: "List batches",
    description: "Every DGDA batch: batchId, status, itemCount, approvedCount and runAt. " + READ_ONLY_NOTE,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_batch",
    title: "Get a batch",
    description: "One batch's current items in concept-id order: conceptId, tradeName, displayStatus, and each pipeline stage's "
      + "status (ok, warn or fail) with its stored note. A stage with no result is absent. " + READ_ONLY_NOTE,
    inputSchema: { type: "object", properties: { batchId: S.batchId }, required: ["batchId"], additionalProperties: false },
  },
  {
    name: "get_record",
    title: "Get a record",
    description: "One record in full: the DGDA source JSON as stored with its register link, the extraction (trade name, "
      + "company, dosage form, DAR, generic content, parse status and note, parsed ingredients with strengths, aligned "
      + "substances, codes with source links, DDInter entries chosen by route, the clinical drug), the DDInter route and "
      + "routeAssumed, each stage's status, notes and evidence, the interaction pairs in this batch and in other batches "
      + "(severity, DDInter ids, pair link, text-missing flags, pair review state) and the decision history (role, time "
      + "and decision only). " + READ_ONLY_NOTE,
    inputSchema: { type: "object", properties: { batchId: S.batchId, conceptId: S.conceptId }, required: ["batchId", "conceptId"],
      additionalProperties: false },
  },
  {
    name: "find_records",
    title: "Find records by problem",
    description: "Current records matching a problem filter, 100 a page, ordered by batch id then concept id; each with "
      + "batchId, conceptId, tradeName, displayStatus and the four stage statuses. Filters: strength_missing (a parsed "
      + "ingredient has no strength), parse_partial (the generic content parsed only in part), route_assumed (the ETL "
      + "assumed the DDInter route), no_ddinter_data (a substance has DDInter coverage none; this never means safe), "
      + "unaligned (an ingredient has no substance), stage_warn (any stage, or the given stage, warns), stage_fail (any stage "
      + "fails). " + READ_ONLY_NOTE,
    inputSchema: { type: "object", properties: {
      filter: { type: "string", enum: [...FILTERS], description: "The problem filter." },
      stage: { type: "string", enum: [...STAGES], description: "Only with filter stage_warn: the stage that warns." },
      batch: { ...S.batchId, description: "Optional: only this batch's records." },
      page: S.page(100),
    }, required: ["filter"], additionalProperties: false },
  },
  {
    name: "get_pairs",
    title: "Get a substance's pairs",
    description: "A substance's stored DDInter pairs, 50 a page: both DDInter ids, the entry and the partner, severity, "
      + "actions, interaction and management text, the DDInter pair link, whether the pair applies, and the pair's review "
      + "state with its changes. " + READ_ONLY_NOTE,
    inputSchema: { type: "object", properties: { bdsId: S.bdsId, page: S.page(50) }, required: ["bdsId"],
      additionalProperties: false },
  },
];

export type Checked = { ok: true; path: string } | { ok: false; field: string } | { ok: false; unknownTool: true };

/** A refused input's name, capped, so a refusal stays small. */
const fieldName = (name: string) => [...name].slice(0, 100).join("");

type Args = Readonly<Record<string, unknown>>;

/** The first input that is not one the tool takes (in argument order), or null. */
function unknownInput(args: Args, allowed: readonly string[]): string | null {
  for (const name of Object.keys(args)) if (!allowed.includes(name)) return fieldName(name);
  return null;
}

/** Each named input against its schema, in order; an optional one may be absent (never null). */
function firstBad(args: Args, checks: readonly [string, z.ZodTypeAny, boolean][]): string | null {
  for (const [name, schema, required] of checks) {
    if (!Object.hasOwn(args, name)) {
      if (required) return name;
      continue;
    }
    if (!schema.safeParse(args[name]).success) return name;
  }
  return null;
}

const enc = encodeURIComponent;

/**
 * The QA API path (with its query) for a tool call, or the first refused input. Checked in the route's order: an input
 * the tool does not take, then the tool's inputs in path-then-query order (§7.9.2; find_records: filter, stage, batch,
 * page, with stage only for stage_warn).
 */
export function toPath(name: string, rawArgs: Args | undefined): Checked {
  const args: Args = rawArgs ?? {};
  const refuse = (field: string): Checked => ({ ok: false, field });
  switch (name) {
    case "list_batches": {
      const u = unknownInput(args, []);
      return u !== null ? refuse(u) : { ok: true, path: "/api/qa/v1/batches" };
    }
    case "get_batch": {
      const bad = unknownInput(args, ["batchId"]) ?? firstBad(args, [["batchId", batchId, true]]);
      return bad !== null ? refuse(bad) : { ok: true, path: `/api/qa/v1/batches/${enc(args.batchId as string)}` };
    }
    case "get_record": {
      const bad = unknownInput(args, ["batchId", "conceptId"])
        ?? firstBad(args, [["batchId", batchId, true], ["conceptId", conceptId, true]]);
      return bad !== null ? refuse(bad)
        : { ok: true, path: `/api/qa/v1/batches/${enc(args.batchId as string)}/records/${enc(args.conceptId as string)}` };
    }
    case "find_records": {
      const bad = unknownInput(args, ["filter", "stage", "batch", "page"])
        ?? firstBad(args, [["filter", filter, true], ["stage", stage, false]])
        ?? (Object.hasOwn(args, "stage") && args.filter !== "stage_warn" ? "stage" : null)
        ?? firstBad(args, [["batch", batchId, false], ["page", page, false]]);
      if (bad !== null) return refuse(bad);
      const q = new URLSearchParams({ filter: args.filter as string });
      if (Object.hasOwn(args, "stage")) q.set("stage", args.stage as string);
      if (Object.hasOwn(args, "batch")) q.set("batch", args.batch as string);
      if (Object.hasOwn(args, "page")) q.set("page", String(args.page));
      return { ok: true, path: `/api/qa/v1/records?${q}` };
    }
    case "get_pairs": {
      const bad = unknownInput(args, ["bdsId", "page"]) ?? firstBad(args, [["bdsId", bdsId, true], ["page", page, false]]);
      if (bad !== null) return refuse(bad);
      const query = Object.hasOwn(args, "page") ? `?page=${String(args.page)}` : "";
      return { ok: true, path: `/api/qa/v1/substances/${enc(args.bdsId as string)}/pairs${query}` };
    }
    default:
      return { ok: false, unknownTool: true };
  }
}
