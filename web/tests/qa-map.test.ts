import { describe, expect, it } from "vitest";
import { MalformedBody, QA_PAIRS_SIZE, QA_RECORDS_SIZE, mapBatch, mapBatches, mapPairs, mapRecord, mapRecords } from "@/lib/qa-map";
import { apiRecord, apiSubstance, SENTINELS, SENTINEL_EMAIL, SENTINEL_NOTE } from "./fixtures/qa";

const keys = (o: unknown) => Object.keys(o as object);
const scan = (o: unknown) => {
  const text = JSON.stringify(o);
  for (const s of SENTINELS) expect(text, `QA output contains ${s}`).not.toContain(s);
};

describe("mapRecord (§7.9.3 QaRecord)", () => {
  const r = mapRecord(apiRecord());

  it("has exactly the allowlisted keys, in the spec's order", () => {
    expect(keys(r)).toEqual(["batchId", "conceptId", "displayStatus", "review", "extractedAt", "batch", "source", "extraction",
      "ddinterRoute", "stages", "pairs", "history"]);
    expect(keys(r.batch)).toEqual(["status", "runAt", "itemCount"]);
    expect(keys(r.source)).toEqual(["json", "url", "link"]);
    expect(keys(r.extraction)).toEqual(["tradeName", "company", "dosageForm", "darNumber", "genericContentRaw", "qualityFlag",
      "parseStatus", "parseNote", "dgdaIngredients", "ingredients", "clinicalDrug"]);
    const g = r.extraction.ingredients[0];
    expect(keys(g)).toEqual(["bdsId", "name", "raw", "strengthValue", "strengthUnit", "perValue", "perUnit", "names", "coverage",
      "coverageNote", "codes", "ddinter"]);
    expect(keys(g.names[0])).toEqual(["name", "type", "source"]);
    expect(keys(g.codes[0])).toEqual(["system", "code", "routeScope", "method", "confidence", "link"]);
    expect(keys(g.ddinter)).toEqual(["chosen", "entries"]);
    expect(keys(g.ddinter.chosen[0])).toEqual(["ddinterId", "name", "routeScope", "routeAssumed"]);
    expect(keys(g.ddinter.entries[0])).toEqual(["ddinterId", "name", "routeScope", "counts", "link"]);
    expect(keys(g.ddinter.entries[0].counts)).toEqual(["major", "moderate", "minor", "unknown", "total"]);
    expect(keys(r.extraction.clinicalDrug)).toEqual(["bdcId", "displayName", "doseForm", "route", "signature"]);
    expect(keys(r.ddinterRoute)).toEqual(["route", "routeAssumed"]);
    expect(keys(r.stages[3])).toEqual(["stage", "status", "notes", "textMissing", "evidence"]);
    expect(keys(r.stages[3].notes[0])).toEqual(["kind", "text", "ddinterId", "route"]);
    expect(keys(r.stages[3].textMissing[0])).toEqual(["ddinterA", "nameA", "ddinterB", "nameB", "severity", "inBatch", "partnerScope"]);
    expect(keys(r.pairs)).toEqual(["inBatch", "otherBatches"]);
    expect(keys(r.pairs.inBatch)).toEqual(["totalBatchPairs", "pairs", "notChecked"]);
    expect(keys(r.pairs.otherBatches)).toEqual(["batches", "pairs", "notChecked"]);
    expect(keys(r.pairs.inBatch.pairs[0])).toEqual(["ddinterA", "ddinterB", "nameA", "nameB", "substance", "partnerSubstance",
      "severity", "actions", "link", "textMissing", "review", "partners"]);
    expect(keys(r.pairs.otherBatches.pairs[0])).toEqual(["ddinterA", "ddinterB", "nameA", "nameB", "substance", "partnerSubstance",
      "partnerBdsId", "severity", "actions", "link", "textMissing", "review", "partners", "partnerCount"]);
    expect(keys(r.pairs.inBatch.pairs[0].partners[0])).toEqual(["conceptId", "tradeName", "index"]);
    expect(keys(r.pairs.otherBatches.pairs[0].partners[0])).toEqual(["conceptId", "tradeName", "batchId", "approved"]);
    expect(keys(r.pairs.inBatch.notChecked[0])).toEqual(["substance", "partnerSubstance", "partners", "reason", "side", "route"]);
    expect(keys(r.pairs.otherBatches.notChecked[0])).toEqual(["substance", "partnerSubstance", "partnerBdsId", "partners",
      "partnerCount", "reason", "side", "route"]);
  });

  it("copies the values the QA checker cites", () => {
    expect(r).toMatchObject({ batchId: "0001-pilot", conceptId: "186-0030-006--napa", displayStatus: "issue", review: "issue",
      extractedAt: "2026-10-11T21:28:09.250Z", batch: { status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 10 } });
    expect(r.source.json).toEqual({ id: "186-0030-006--napa", display_name: "Napa", extras: { generic: "Paracetamol 500 mg" } });
    expect(r.source.url).toBe("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/");
    expect(r.source.link).toEqual({ url: "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/",
      label: "DGDA register (OCL)", fetchedAt: "2026-10-11T19:00:00Z" });
    expect(r.extraction).toMatchObject({ tradeName: "Napa", company: "Beximco Pharmaceuticals Ltd.", dosageForm: "Tablet",
      darNumber: "186-0030-006", genericContentRaw: "Paracetamol 500 mg", parseStatus: "partial", parseNote: "unparsed: + Caffeine",
      dgdaIngredients: [{ xmCode: "XM5DJ7", name: "Acetaminophen" }] });
    const g = r.extraction.ingredients[0];
    expect(g).toMatchObject({ bdsId: "BDS-000001", name: "Acetaminophen", raw: "Paracetamol 500 mg", strengthValue: 500,
      strengthUnit: "mg", perValue: null, perUnit: null, coverage: "full", coverageNote: "DDInter DDInter14" });
    expect(g.codes.find((c) => c.system === "RXCUI")?.link?.label).toBe("RxNav");
    expect(g.codes.find((c) => c.system === "ATC")?.link).toBeNull();
    expect(g.ddinter.entries[0].link?.url).toBe("https://ddinter2.scbdd.com/server/drug-detail/DDInter14/");
    expect(r.extraction.clinicalDrug).toEqual({ bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet",
      route: "systemic", signature: "tablet|systemic|BDS-000001:500mg/" });
    expect(r.stages.map((s) => s.stage)).toEqual(["dgda", "substances", "clinical", "ddinter"]);
    expect(r.stages[3].evidence).toEqual(apiRecord().stages[3].evidence);
    expect(r.pairs.inBatch.totalBatchPairs).toBe(2);
    expect(r.pairs.otherBatches.batches).toBe(3);
    expect(r.pairs.inBatch.pairs[0].link?.url).toBe("https://ddinter2.scbdd.com/server/interact/IA-9/");
    expect(r.pairs.otherBatches.pairs[0]).toMatchObject({ partnerBdsId: "BDS-000004", partnerCount: 7, link: null });
  });

  it("ddinterRoute is the clinical drug's route and RouteRule's routeAssumed over every chosen entry", () => {
    expect(r.ddinterRoute).toEqual({ route: "systemic", routeAssumed: true });
    const plain = mapRecord({ ...apiRecord(), clinicalDrug: null, ingredients: [] });
    expect(plain.ddinterRoute).toEqual({ route: null, routeAssumed: false });
    expect(plain.extraction.clinicalDrug).toBeNull();
  });

  it("textMissing treats null and every DDInter placeholder as missing", () => {
    expect(r.pairs.inBatch.pairs[0].textMissing).toEqual({ interaction: false, management: true });     // management "None"
    expect(r.pairs.otherBatches.pairs[0].textMissing).toEqual({ interaction: true, management: false }); // interaction null
    for (const placeholder of ["None", "null", "N/A", "na", "-", "--", "", "  none  "]) {
      const rec = apiRecord();
      rec.batchPairs.pairs[0] = { ...rec.batchPairs.pairs[0], interaction: placeholder, management: placeholder };
      expect(mapRecord(rec).pairs.inBatch.pairs[0].textMissing).toEqual({ interaction: true, management: true });
    }
  });

  it("pair review state is state and time only; decision history is kind, time, role, decision and counts only", () => {
    expect(r.pairs.inBatch.pairs[0].review).toEqual({ state: "issue", at: "2026-10-15T10:00:00Z" });
    expect(r.pairs.otherBatches.pairs[0].review).toEqual({ state: "reviewed", at: "2026-10-14T09:00:00Z" });
    expect(r.history).toEqual([
      { kind: "run", at: "2026-10-11T21:27:17.629Z" },
      { kind: "extract", at: "2026-10-11T21:28:09.250Z", reason: "rerun", carriedFrom: "0001-pilot" },
      { kind: "decision", at: "2026-10-12T10:00:00Z", role: "pharmacist", decision: "ok", counts: false, uncountedBy: "rerun" },
      { kind: "decision", at: "2026-10-13T10:00:00Z", role: "engineer", decision: "issue", counts: true },
    ]);
  });

  it("carries no email, note, mine, version token, content hash, reopen or open issue anywhere (deep scan)", () => {
    const raw = JSON.stringify(apiRecord());
    expect(raw).toContain(SENTINEL_EMAIL);       // the fixture really plants them
    expect(raw).toContain(SENTINEL_NOTE);
    scan(r);
  });

  it("a malformed body throws MalformedBody (the route answers 502)", () => {
    expect(() => mapRecord(null)).toThrow(MalformedBody);
    expect(() => mapRecord({ ...apiRecord(), stages: "x" })).toThrow(MalformedBody);
    expect(() => mapRecord({ ...apiRecord(), batchPairs: null })).toThrow(MalformedBody);
    expect(() => mapRecord({ ...apiRecord(), ingredients: [null] })).toThrow(MalformedBody);
  });

  it("a nested object or array where a scalar belongs never passes through", () => {
    const rec = apiRecord();
    (rec as Record<string, unknown>).conceptId = { email: SENTINEL_EMAIL };
    (rec.brand as Record<string, unknown>).tradeName = [SENTINEL_NOTE];
    const out = mapRecord(rec);
    expect(out.conceptId).toBeNull();
    expect(out.extraction.tradeName).toBeNull();
    scan(out);
  });
});

describe("mapPairs (§7.9.3 substance pairs)", () => {
  const p = mapPairs(apiSubstance(), "BDS-000003", 2);

  it("has exactly the allowlisted keys", () => {
    expect(keys(p)).toEqual(["bdsId", "name", "page", "size", "total", "pairs"]);
    expect(keys(p.pairs[0])).toEqual(["ddinterA", "ddinterB", "entry", "partner", "severity", "actions", "interaction", "management",
      "link", "applies", "review", "changes"]);
    expect(keys(p.pairs[0].entry)).toEqual(["name", "routeScope"]);
    expect(keys(p.pairs[0].partner)).toEqual(["bdsId", "name", "entry"]);
    expect(keys(p.pairs[0].changes[0])).toEqual(["field", "atReview", "now"]);
  });

  it("partner is the side that is not the substance, and side b when both are", () => {
    expect(p).toMatchObject({ bdsId: "BDS-000003", name: "Warfarin", page: 2, size: 50, total: 3 });
    expect(p.pairs[0].entry).toEqual({ name: "Warfarin", routeScope: "systemic" });
    expect(p.pairs[0].partner).toEqual({ bdsId: "BDS-000004", name: "Acetylsalicylic acid",
      entry: { name: "Acetylsalicylic acid", routeScope: "systemic" } });
    expect(p.pairs[1].entry).toEqual({ name: "Warfarin", routeScope: "systemic" });
    expect(p.pairs[1].partner).toEqual({ bdsId: "BDS-000001", name: "Acetaminophen", entry: { name: "Acetaminophen", routeScope: "systemic" } });
    expect(p.pairs[2].entry).toEqual({ name: "Warfarin", routeScope: "systemic" });
    expect(p.pairs[2].partner).toEqual({ bdsId: "BDS-000003", name: "Warfarin", entry: { name: "Warfarin (topical)", routeScope: "topical" } });
  });

  it("copies texts, severity, actions, link and applies; changes only when the state is changed", () => {
    expect(p.pairs[0]).toMatchObject({ severity: "major", actions: ["synergy"], interaction: "Aspirin may increase the risk of bleeding.",
      management: "Avoid the combination.", applies: true, review: { state: "changed", at: "2026-10-14T09:00:00Z" },
      changes: [{ field: "severity", atReview: "moderate", now: "major" }] });
    expect(p.pairs[0].link).toEqual({ url: "https://ddinter2.scbdd.com/server/interact/3039/", label: "Full record in DDInter 2.0", fetchedAt: null });
    expect(p.pairs[1].review).toEqual({ state: "issue", at: "2026-10-15T09:00:00Z" });
    expect(p.pairs[1].changes).toEqual([]);
    expect(p.pairs[1].link).toBeNull();
  });

  it("carries no email, note, mine, history, version or content hash (deep scan)", () => {
    expect(JSON.stringify(apiSubstance())).toContain(SENTINEL_NOTE);
    scan(p);
    expect(JSON.stringify(p)).not.toContain("brands");
    expect(JSON.stringify(p)).not.toContain("history");
  });

  it("a malformed body throws MalformedBody", () => {
    expect(() => mapPairs({ bdsId: "BDS-000003", name: "Warfarin" }, "BDS-000003", 0)).toThrow(MalformedBody);
    expect(() => mapPairs({ ...apiSubstance(), pairs: { total: 1, items: [{ ddinterA: "x" }] } }, "BDS-000003", 0)).toThrow(MalformedBody);
  });
});

describe("mapBatches, mapBatch, mapRecords (§7.9.3)", () => {
  it("batches: batchId, status, itemCount, approvedCount (= counts.approved), runAt", () => {
    const out = mapBatches([{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 10,
      counts: { approved: 4, issue: 1, needsReview: 5, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 8 }, reviewerEmail: SENTINEL_EMAIL }]);
    expect(out).toEqual({ batches: [{ batchId: "0001-pilot", status: "in_review", itemCount: 10, approvedCount: 4, runAt: "2026-10-11T21:27:17.629Z" }] });
    expect(() => mapBatches({})).toThrow(MalformedBody);
    expect(() => mapBatches([{ batchId: "x" }])).toThrow(MalformedBody);
  });

  it("batch: its items with stage status and the stored note", () => {
    const out = mapBatch({ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 1, extra: SENTINEL_EMAIL,
      items: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending", hint: {}, reviewerEmail: SENTINEL_EMAIL,
        stages: [{ stage: "ddinter", status: "warn", note: "DDInter text not found for DDInter14/DDInter20", evidence: { x: SENTINEL_EMAIL } }] }] });
    expect(out).toEqual({ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 1,
      items: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending",
        stages: [{ stage: "ddinter", status: "warn", note: "DDInter text not found for DDInter14/DDInter20" }] }] });
    expect(() => mapBatch({ batchId: "x", items: [{ stages: null }] })).toThrow(MalformedBody);
  });

  it("records: the filter echo, paging and four stage statuses per item", () => {
    const out = mapRecords({ filter: "stage_warn", stage: "ddinter", batch: null, page: 0, size: 100, total: 1, extra: SENTINEL_EMAIL,
      items: [{ batchId: "0001-pilot", conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending", reviewerEmail: SENTINEL_EMAIL,
        stages: { dgda: "ok", substances: "ok", clinical: "ok", ddinter: "warn", other: "x" } }] });
    expect(out).toEqual({ filter: "stage_warn", stage: "ddinter", batch: null, page: 0, size: 100, total: 1,
      items: [{ batchId: "0001-pilot", conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending",
        stages: { dgda: "ok", substances: "ok", clinical: "ok", ddinter: "warn" } }] });
    expect(() => mapRecords({ items: [{ stages: [] }] })).toThrow(MalformedBody);
  });
});

describe("page sizes (§7.9.3; QA API reference, §5.18)", () => {
  it("QA_RECORDS_SIZE is the records page size the internal API serves, QA_PAIRS_SIZE the pairs one", () => {
    expect(QA_RECORDS_SIZE).toBe(100);
    expect(QA_PAIRS_SIZE).toBe(50);
    expect(mapPairs(apiSubstance(), "BDS-000003", 0).size).toBe(QA_PAIRS_SIZE);
  });
});
