import "server-only";
import { ddinterText } from "./ddinter-text";

/*
 * The QA API's allowlist mappers (spec §7.9.3, §7.9.7, D62). Each output field is copied by name from the internal API's
 * body; no API object is ever spread, so a field the API adds later never reaches a QA caller. A scalar field takes only a
 * string, number or boolean (anything else becomes null), so no nested object rides in under a scalar's name. Only the
 * DGDA source JSON and each stage's evidence are passed as stored (pipeline output, §7.9.7). Never copied: any email,
 * decision, dismissal or pair-issue note, `mine`, version tokens, content hashes, `reopen`, open issues, pair history.
 * A body that does not have the expected shape throws MalformedBody, which the route answers with 502.
 */

export class MalformedBody extends Error {
  constructor() {
    super("Malformed internal API body");
  }
}

type J = Record<string, unknown>;
export type Scalar = string | number | boolean | null;

function obj(x: unknown): J {
  if (x !== null && typeof x === "object" && !Array.isArray(x)) return x as J;
  throw new MalformedBody();
}
const objOrNull = (x: unknown): J | null => (x === null || x === undefined ? null : obj(x));
function arr(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  throw new MalformedBody();
}
const val = (x: unknown): Scalar => (typeof x === "string" || typeof x === "number" || typeof x === "boolean" ? x : null);
const vals = (x: unknown): Scalar[] => arr(x).map(val);
/** A pass-through JSON value (source JSON, stage evidence): exactly as the API sent it, null when absent. */
const raw = (x: unknown): unknown => (x === undefined ? null : x);

export type Link = { url: Scalar; label: Scalar; fetchedAt: Scalar };
/** The API's Source (SourceLinks, §5.6.6), passed through field by field; the web never builds a source URL. */
function link(x: unknown): Link | null {
  const s = objOrNull(x);
  return s === null ? null : { url: val(s.url), label: val(s.label), fetchedAt: val(s.fetchedAt) };
}

// ---- GET /api/qa/v1/batches

export type QaBatches = { batches: { batchId: Scalar; status: Scalar; itemCount: Scalar; approvedCount: Scalar; runAt: Scalar }[] };

export function mapBatches(data: unknown): QaBatches {
  return { batches: arr(data).map((x) => {
    const b = obj(x);
    return { batchId: val(b.batchId), status: val(b.status), itemCount: val(b.itemCount), approvedCount: val(obj(b.counts).approved),
      runAt: val(b.runAt) };
  }) };
}

// ---- GET /api/qa/v1/batches/{batchId}

export type QaBatch = {
  batchId: Scalar; status: Scalar; runAt: Scalar; itemCount: Scalar;
  items: { conceptId: Scalar; tradeName: Scalar; displayStatus: Scalar; stages: { stage: Scalar; status: Scalar; note: Scalar }[] }[];
};

export function mapBatch(data: unknown): QaBatch {
  const d = obj(data);
  return { batchId: val(d.batchId), status: val(d.status), runAt: val(d.runAt), itemCount: val(d.itemCount),
    items: arr(d.items).map((x) => {
      const i = obj(x);
      return { conceptId: val(i.conceptId), tradeName: val(i.tradeName), displayStatus: val(i.displayStatus),
        stages: arr(i.stages).map((y) => {
          const s = obj(y);
          return { stage: val(s.stage), status: val(s.status), note: val(s.note) };
        }) };
    }) };
}

// ---- GET /api/qa/v1/records

export type QaRecords = {
  filter: Scalar; stage: Scalar; batch: Scalar; page: Scalar; size: Scalar; total: Scalar;
  items: { batchId: Scalar; conceptId: Scalar; tradeName: Scalar; displayStatus: Scalar;
           stages: { dgda: Scalar; substances: Scalar; clinical: Scalar; ddinter: Scalar } }[];
};

export function mapRecords(data: unknown): QaRecords {
  const d = obj(data);
  return { filter: val(d.filter), stage: val(d.stage), batch: val(d.batch), page: val(d.page), size: val(d.size), total: val(d.total),
    items: arr(d.items).map((x) => {
      const i = obj(x), s = obj(i.stages);
      return { batchId: val(i.batchId), conceptId: val(i.conceptId), tradeName: val(i.tradeName), displayStatus: val(i.displayStatus),
        stages: { dgda: val(s.dgda), substances: val(s.substances), clinical: val(s.clinical), ddinter: val(s.ddinter) } };
    }) };
}

// ---- GET /api/qa/v1/batches/{batchId}/records/{conceptId}

export type QaIngredient = {
  bdsId: Scalar; name: Scalar; raw: Scalar; strengthValue: Scalar; strengthUnit: Scalar; perValue: Scalar; perUnit: Scalar;
  names: { name: Scalar; type: Scalar; source: Scalar }[];
  coverage: Scalar; coverageNote: Scalar;
  codes: { system: Scalar; code: Scalar; routeScope: Scalar; method: Scalar; confidence: Scalar; link: Link | null }[];
  ddinter: {
    chosen: { ddinterId: Scalar; name: Scalar; routeScope: Scalar; routeAssumed: Scalar }[];
    entries: { ddinterId: Scalar; name: Scalar; routeScope: Scalar;
               counts: { major: Scalar; moderate: Scalar; minor: Scalar; unknown: Scalar; total: Scalar }; link: Link | null }[];
  };
};
export type QaReview = { state: Scalar; at: Scalar };
export type QaPair = {
  ddinterA: Scalar; ddinterB: Scalar; nameA: Scalar; nameB: Scalar; substance: Scalar; partnerSubstance: Scalar;
  partnerBdsId?: Scalar; severity: Scalar; actions: Scalar[]; link: Link | null;
  textMissing: { interaction: boolean; management: boolean }; review: QaReview; partners: J[]; partnerCount?: Scalar;
};
export type QaRecord = {
  batchId: Scalar; conceptId: Scalar; displayStatus: Scalar; review: Scalar; extractedAt: Scalar;
  batch: { status: Scalar; runAt: Scalar; itemCount: Scalar };
  source: { json: unknown; url: Scalar; link: Link | null };
  extraction: {
    tradeName: Scalar; company: Scalar; dosageForm: Scalar; darNumber: Scalar; genericContentRaw: Scalar; qualityFlag: Scalar;
    parseStatus: Scalar; parseNote: Scalar; dgdaIngredients: { xmCode: Scalar; name: Scalar }[]; ingredients: QaIngredient[];
    clinicalDrug: { bdcId: Scalar; displayName: Scalar; doseForm: Scalar; route: Scalar; signature: Scalar } | null;
  };
  ddinterRoute: { route: Scalar; routeAssumed: boolean };
  stages: { stage: Scalar; status: Scalar; notes: { kind: Scalar; text: Scalar; ddinterId: Scalar; route: Scalar }[];
            textMissing: { ddinterA: Scalar; nameA: Scalar; ddinterB: Scalar; nameB: Scalar; severity: Scalar; inBatch: Scalar;
                           partnerScope: Scalar }[]; evidence: unknown }[];
  pairs: {
    inBatch: { totalBatchPairs: Scalar; pairs: QaPair[]; notChecked: J[] };
    otherBatches: { batches: Scalar; pairs: QaPair[]; notChecked: J[] };
  };
  history: J[];
};

function ingredient(x: unknown): QaIngredient {
  const g = obj(x), cov = objOrNull(g.coverage), dd = obj(g.ddinter);
  return {
    bdsId: val(g.bdsId), name: val(g.name), raw: val(g.raw), strengthValue: val(g.strengthValue), strengthUnit: val(g.strengthUnit),
    perValue: val(g.perValue), perUnit: val(g.perUnit),
    names: arr(g.names).map((y) => { const n = obj(y); return { name: val(n.name), type: val(n.type), source: val(n.source) }; }),
    coverage: cov === null ? null : val(cov.coverage), coverageNote: cov === null ? null : val(cov.note),
    codes: arr(g.codes).map((y) => {
      const c = obj(y);
      return { system: val(c.system), code: val(c.code), routeScope: val(c.routeScope), method: val(c.method), confidence: val(c.confidence),
        link: link(c.source) };
    }),
    ddinter: {
      chosen: arr(dd.chosen).map((y) => {
        const c = obj(y);
        return { ddinterId: val(c.ddinterId), name: val(c.name), routeScope: val(c.routeScope), routeAssumed: val(c.routeAssumed) };
      }),
      entries: arr(dd.entries).map((y) => {
        const e = obj(y), n = obj(e.counts);
        return { ddinterId: val(e.ddinterId), name: val(e.name), routeScope: val(e.routeScope),
          counts: { major: val(n.major), moderate: val(n.moderate), minor: val(n.minor), unknown: val(n.unknown), total: val(n.total) },
          link: link(e.source) };
      }),
    },
  };
}

/** By ddinterText() (§3.6): null, a non-string, or a DDInter placeholder ("None", "-", …) is missing text. */
const missing = (x: unknown) => typeof x !== "string" || ddinterText(x) === null;

/** Senior-review state and time only: never the note or `mine` (§7.9.7). */
function review(x: unknown): QaReview {
  const r = obj(x);
  return { state: val(r.state), at: val(r.at) };
}

function inBatchPartner(x: unknown): J {
  const p = obj(x);
  return { conceptId: val(p.conceptId), tradeName: val(p.tradeName), index: val(p.index) };
}
function otherPartner(x: unknown): J {
  const p = obj(x);
  return { conceptId: val(p.conceptId), tradeName: val(p.tradeName), batchId: val(p.batchId), approved: val(p.approved) };
}

function pair(x: unknown, other: boolean): QaPair {
  const p = obj(x);
  const head = { ddinterA: val(p.ddinterA), ddinterB: val(p.ddinterB), nameA: val(p.nameA), nameB: val(p.nameB),
    substance: val(p.substance), partnerSubstance: val(p.partnerSubstance) };
  const tail = { severity: val(p.severity), actions: vals(p.actions), link: link(p.source),
    textMissing: { interaction: missing(p.interaction), management: missing(p.management) }, review: review(p.pairReview) };
  return other
    ? { ...head, partnerBdsId: val(p.partnerBdsId), ...tail, partners: arr(p.partners).map(otherPartner), partnerCount: val(p.partnerCount) }
    : { ...head, ...tail, partners: arr(p.partners).map(inBatchPartner) };
}

function notChecked(x: unknown, other: boolean): J {
  const n = obj(x);
  return other
    ? { substance: val(n.substance), partnerSubstance: val(n.partnerSubstance), partnerBdsId: val(n.partnerBdsId),
        partners: arr(n.partners).map(otherPartner), partnerCount: val(n.partnerCount), reason: val(n.reason), side: val(n.side),
        route: val(n.route) }
    : { substance: val(n.substance), partnerSubstance: val(n.partnerSubstance), partners: arr(n.partners).map(inBatchPartner),
        reason: val(n.reason), side: val(n.side), route: val(n.route) };
}

/** Oldest first; role, time, decision and whether it counts, never the note or `mine` (§7.9.3, D62). Absent keys stay absent. */
const HISTORY_OPTIONAL = ["reason", "role", "decision", "counts", "uncountedBy", "carriedFrom"] as const;
function historyEntry(x: unknown): J {
  const h = obj(x);
  const out: J = { kind: val(h.kind), at: val(h.at) };
  for (const k of HISTORY_OPTIONAL) if (h[k] !== undefined && h[k] !== null) out[k] = val(h[k]);
  return out;
}

export function mapRecord(data: unknown): QaRecord {
  const d = obj(data);
  const brand = objOrNull(d.brand), clinical = objOrNull(d.clinicalDrug), version = obj(d.version), batch = obj(d.batch);
  const ingredients = arr(d.ingredients).map(ingredient);
  const inBatch = obj(d.batchPairs), others = obj(d.otherPairs);
  const b = (k: string) => (brand === null ? null : val(brand[k]));
  return {
    batchId: val(d.batchId), conceptId: val(d.conceptId), displayStatus: val(d.displayStatus), review: val(d.review),
    extractedAt: val(version.extractedAt),
    batch: { status: val(batch.status), runAt: val(batch.runAt), itemCount: val(batch.itemCount) },
    source: { json: raw(d.sourceJson), url: val(d.sourceUrl), link: brand === null ? null : link(brand.source) },
    extraction: {
      tradeName: b("tradeName"), company: b("company"), dosageForm: b("dosageForm"), darNumber: b("darNumber"),
      genericContentRaw: b("genericContentRaw"), qualityFlag: b("qualityFlag"), parseStatus: b("parseStatus"), parseNote: b("parseNote"),
      dgdaIngredients: arr(d.dgdaIngredients).map((y) => { const g = obj(y); return { xmCode: val(g.xmCode), name: val(g.name) }; }),
      ingredients,
      clinicalDrug: clinical === null ? null : { bdcId: val(clinical.bdcId), displayName: val(clinical.displayName),
        doseForm: val(clinical.doseForm), route: val(clinical.route), signature: val(clinical.signature) },
    },
    // route = the clinical drug's route; routeAssumed = RouteRule's view, any chosen entry assumed (§7.9.3)
    ddinterRoute: { route: clinical === null ? null : val(clinical.route),
      routeAssumed: ingredients.some((g) => g.ddinter.chosen.some((c) => c.routeAssumed === true)) },
    stages: arr(d.stages).map((y) => {
      const s = obj(y);
      return { stage: val(s.stage), status: val(s.status),
        notes: arr(s.notes).map((z) => { const n = obj(z); return { kind: val(n.kind), text: val(n.text), ddinterId: val(n.ddinterId), route: val(n.route) }; }),
        textMissing: arr(s.textMissing).map((z) => {
          const t = obj(z);
          return { ddinterA: val(t.ddinterA), nameA: val(t.nameA), ddinterB: val(t.ddinterB), nameB: val(t.nameB), severity: val(t.severity),
            inBatch: val(t.inBatch), partnerScope: val(t.partnerScope) };
        }),
        evidence: raw(s.evidence) };
    }),
    pairs: {
      inBatch: { totalBatchPairs: val(inBatch.totalBatchPairs), pairs: arr(inBatch.pairs).map((p) => pair(p, false)),
        notChecked: arr(inBatch.notChecked).map((n) => notChecked(n, false)) },
      otherBatches: { batches: val(others.otherBatches), pairs: arr(others.pairs).map((p) => pair(p, true)),
        notChecked: arr(others.notChecked).map((n) => notChecked(n, true)) },
    },
    history: arr(d.history).map(historyEntry),
  };
}

// ---- GET /api/qa/v1/substances/{bdsId}/pairs

export const QA_PAIRS_SIZE = 50;
export type QaEntry = { name: Scalar; routeScope: Scalar };
export type QaSubstancePair = {
  ddinterA: Scalar; ddinterB: Scalar; entry: QaEntry; partner: { bdsId: Scalar; name: Scalar; entry: QaEntry };
  severity: Scalar; actions: Scalar[]; interaction: Scalar; management: Scalar; link: Link | null; applies: Scalar;
  review: QaReview; changes: { field: Scalar; atReview: Scalar; now: Scalar }[];
};
export type QaPairs = { bdsId: Scalar; name: Scalar; page: number; size: number; total: Scalar; pairs: QaSubstancePair[] };

function entry(x: unknown): QaEntry {
  const e = obj(x);
  return { name: val(e.name), routeScope: val(e.routeScope) };
}

/** {@code bdsId} is the substance asked for: the partner is the other side, side b when both sides are this substance. */
export function mapPairs(data: unknown, bdsId: string, page: number): QaPairs {
  const d = obj(data), pairs = obj(d.pairs);
  return { bdsId: val(d.bdsId), name: val(d.name), page, size: QA_PAIRS_SIZE, total: val(pairs.total),
    pairs: arr(pairs.items).map((x) => {
      const p = obj(x), a = obj(p.substanceA), b = obj(p.substanceB);
      const ownIsA = a.bdsId === bdsId;
      const partnerSide = ownIsA ? b : a;
      const r = review(p.review);
      return {
        ddinterA: val(p.ddinterA), ddinterB: val(p.ddinterB), entry: entry(ownIsA ? p.entryA : p.entryB),
        partner: { bdsId: val(partnerSide.bdsId), name: val(partnerSide.name), entry: entry(ownIsA ? p.entryB : p.entryA) },
        severity: val(p.severity), actions: vals(p.actions), interaction: val(p.interaction), management: val(p.management),
        link: link(p.source), applies: val(p.applies), review: r,
        // what changed since the review (§7.7): only for a pair whose state is changed
        changes: r.state === "changed" ? arr(p.changes).map((y) => {
          const c = obj(y);
          return { field: val(c.field), atReview: val(c.atReview), now: val(c.now) };
        }) : [],
      };
    }) };
}
