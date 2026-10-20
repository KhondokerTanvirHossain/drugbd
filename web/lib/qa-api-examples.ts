import "server-only";
import { P1C_COPY } from "./copy";
import type { DisplayStatus, ReviewBatchSummary, ReviewItem, StageKey } from "./review-types";
import type { SubstanceDetail } from "./senior-types";

/*
 * Illustrative internal API bodies for the /review/qa API reference (spec §5.18 "Where the reference comes from", D72). One
 * body per QA endpoint, typed with `satisfies` against the web's API types, so `next build` fails when the internal API's
 * shape changes. lib/qa-api-reference.ts runs each through the endpoint's real allowlist mapper (lib/qa-map.ts) and the real
 * envelope (lib/qa-query.ts); nothing here is shown as written.
 *
 * Example content (§5.18): pilot ids, so every command runs as written; the five bodies agree with one another. Never an
 * email, a person, a reviewer's note, a version token, a content hash or a key. A field the mappers drop appears only where
 * the type requires it, and then only as a neutral value (mine false, a review's note null, a pair's history [], openIssues
 * [], reopen null, lastDecisionId null, a pair's version { contentHash "", lastPairReviewId null }). Stage notes, coverage
 * notes and parse notes are short pipeline-style text, never a person's words.
 */

/** The envelope's metadata in every example answer: a fixed version-4 UUID and time. */
export const EXAMPLE_REQUEST_ID = "6f1c2b9e-3d4a-4e8b-9c7d-2a5e8f0b1c34";
export const EXAMPLE_TIMESTAMP = "2026-10-19T04:30:00.000Z";

export const EXAMPLE_BATCH = "0001-pilot";
export const EXAMPLE_CONCEPT = "186-0030-006--napa";
export const EXAMPLE_BDS = "BDS-000003";

/** GET /v1/qa/batches/{b}/items (§7.9.5): the internal body behind GET /api/qa/v1/batches/{batchId}. */
export type QaBatchItemsBody = {
  batchId: string; status: ReviewBatchSummary["status"]; runAt: string; itemCount: number;
  items: { conceptId: string; tradeName: string; displayStatus: DisplayStatus;
           stages: { stage: StageKey; status: "ok" | "warn" | "fail"; note: string }[] }[];
};
/** GET /v1/qa/records (§7.9.5): the internal body behind GET /api/qa/v1/records. */
export type QaRecordsBody = {
  filter: string; stage: StageKey | null; batch: string | null; page: number; size: number; total: number;
  items: { batchId: string; conceptId: string; tradeName: string; displayStatus: DisplayStatus;
           stages: Record<StageKey, "ok" | "warn" | "fail" | null> }[];
};

/** The link labels the API sends (SourceLinks.java), which the desk prints from the same §1.7 copy. */
const SOURCE_LABEL = P1C_COPY.sources;
const RUN_AT = "2026-10-11T21:27:17.629Z";
const FETCHED = "2026-10-11T19:00:00Z";
const OCL = "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/";
const DDINTER = (id: string) => ({ url: `https://ddinter2.scbdd.com/server/drug-detail/${id}/`, label: "DDInter 2.0", fetchedAt: FETCHED });
const PAIR_LINK = (n: number) => ({ url: `https://ddinter2.scbdd.com/server/interact/${n}/`, label: "Full record in DDInter 2.0", fetchedAt: null });
const missing = (a: string, b: string) => `DDInter text not found for ${a}/${b}`;

// ---- GET /api/qa/v1/batches  ←  GET /v1/review/batches

export const BATCHES_BODY = [
  { batchId: "0001-pilot", status: "in_review", runAt: RUN_AT, itemCount: 10,
    counts: { approved: 4, issue: 1, needsReview: 4, engineerChecked: 1, backInReview: 1, noData: 1, warnings: 9 } },
  { batchId: "0002-common-and-cross-batch", status: "in_review", runAt: "2026-10-17T15:02:41.118Z", itemCount: 10,
    counts: { approved: 0, issue: 0, needsReview: 10, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 7 } },
  { batchId: "0003-popular-a", status: "in_review", runAt: "2026-10-18T09:40:12.507Z", itemCount: 10,
    counts: { approved: 0, issue: 0, needsReview: 10, engineerChecked: 0, backInReview: 0, noData: 0, warnings: 6 } },
] satisfies ReviewBatchSummary[];

// ---- GET /api/qa/v1/batches/{batchId}  ←  GET /v1/qa/batches/{b}/items

type Row = [conceptId: string, tradeName: string, displayStatus: DisplayStatus, ddinter: "ok" | "warn", note: string];
/** The ten pilot records in concept-id order; every stage but ddinter is ok, and an ok stage's note is "" as the ETL stores it. */
const PILOT: Row[] = [
  ["071-0098-022--amlodipine-5", "Amlodipine-5", "approved", "warn", missing("DDInter14", "DDInter79")],
  ["076-0028-006--aspirin", "Aspirin", "approved", "warn", missing("DDInter14", "DDInter20")],
  ["096-0265-061--simvastatin", "Simvastatin", "pending", "warn", missing("DDInter14", "DDInter1675")],
  ["127-0163-052--chloramphenicol", "Chloramphenicol", "approved", "ok", ""],
  ["127-0263-018--domperidone", "Domperidone", "issue", "warn", "DDInter coverage none for BDS-000010"],
  ["185-0138-012--g-warfarin", "G Warfarin", "approved", "warn", missing("DDInter1951", "DDInter79")],
  ["185-0241-015--g-metformin", "G-Metformin", "back_in_review", "warn", missing("DDInter1164", "DDInter14")],
  ["186-0030-006--napa", "Napa", "engineer_checked", "warn", missing("DDInter14", "DDInter79")],
  ["239-0407-023--clarith", "Clarith", "pending", "warn", missing("DDInter14", "DDInter393")],
  ["420-0026-023--amoxycillin-clavulanic-acid", "Amoxycillin Clavulanic Acid", "pending", "warn", missing("DDInter14", "DDInter83")],
];

export const BATCH_BODY = {
  batchId: EXAMPLE_BATCH, status: "in_review", runAt: RUN_AT, itemCount: PILOT.length,
  items: PILOT.map(([conceptId, tradeName, displayStatus, ddinter, note]) => ({ conceptId, tradeName, displayStatus, stages: [
    { stage: "dgda" as const, status: "ok" as const, note: "" },
    { stage: "substances" as const, status: "ok" as const, note: "" },
    { stage: "clinical" as const, status: "ok" as const, note: "" },
    { stage: "ddinter" as const, status: ddinter, note },
  ] })),
} satisfies QaBatchItemsBody;

// ---- GET /api/qa/v1/records?filter=stage_warn&stage=ddinter&batch=0001-pilot&page=0  ←  GET /v1/qa/records

const warned = PILOT.filter((r) => r.at(3) === "warn");
export const RECORDS_BODY = {
  filter: "stage_warn", stage: "ddinter", batch: EXAMPLE_BATCH, page: 0, size: 100, total: warned.length,
  items: warned.map(([conceptId, tradeName, displayStatus]) => ({ batchId: EXAMPLE_BATCH, conceptId, tradeName, displayStatus,
    stages: { dgda: "ok" as const, substances: "ok" as const, clinical: "ok" as const, ddinter: "warn" as const } })),
} satisfies QaRecordsBody;

// ---- GET /api/qa/v1/batches/{batchId}/records/{conceptId}  ←  GET /v1/review/batches/{b}/items/{c}

const NAPA_EXTRACTED = "2026-10-11T21:28:09.250Z";

export const RECORD_BODY = {
  batchId: EXAMPLE_BATCH, conceptId: EXAMPLE_CONCEPT, index: 8, total: 10, displayStatus: "engineer_checked", review: "pending",
  version: { extractedAt: NAPA_EXTRACTED, lastDecisionId: null },
  batch: { runAt: RUN_AT, itemCount: 10, status: "in_review" },
  brand: { conceptId: EXAMPLE_CONCEPT, darNumber: "186-0030-006", tradeName: "Napa", company: "Beximco Pharmaceuticals Ltd.",
    dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg", qualityFlag: "ok", parseStatus: "parsed", parseNote: null,
    source: { url: `${OCL}${EXAMPLE_CONCEPT}/`, label: SOURCE_LABEL.dgda, fetchedAt: FETCHED } },
  dgdaIngredients: [{ xmCode: "XM5DJ7", name: "Acetaminophen" }],
  clinicalDrug: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet", route: "systemic",
    signature: "tablet|systemic|BDS-000001:500mg/" },
  ingredients: [{
    bdsId: "BDS-000001", name: "Acetaminophen", raw: "Paracetamol 500 mg", strengthValue: 500, strengthUnit: "mg",
    perValue: null, perUnit: null,
    names: [{ name: "Acetaminophen", type: "icd11", source: "dgda-ocl" }, { name: "Paracetamol", type: "dgda_content", source: "dgda-ocl" }],
    codes: [
      { system: "ICD11_XM", code: "XM5DJ7", routeScope: "any", method: "xm", confidence: 1,
        source: { url: "https://icd.who.int/browse/latest-release/mms/en", label: "Search ICD-11 for XM5DJ7", fetchedAt: FETCHED } },
      { system: "RXCUI", code: "161", routeScope: "any", method: "rxnav-exact", confidence: 1,
        source: { url: "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=161", label: SOURCE_LABEL.rxnav, fetchedAt: FETCHED } },
      { system: "ATC", code: "N02BE01", routeScope: "any", method: "rxnav-exact", confidence: 1,
        source: { url: "https://atcddd.fhi.no/atc_ddd_index/?code=N02BE01&showdescription=no", label: SOURCE_LABEL.who, fetchedAt: FETCHED } },
      { system: "DRUGBANK", code: "DB00316", routeScope: "any", method: "rxnav-exact", confidence: 1,
        source: { url: "https://go.drugbank.com/drugs/DB00316", label: "DrugBank", fetchedAt: FETCHED } },
      { system: "DDINTER", code: "DDInter14", routeScope: "systemic", method: "drugbank", confidence: 1, source: DDINTER("DDInter14") },
    ],
    coverage: { coverage: "full", note: "DDInter DDInter14" },
    ddinter: {
      chosen: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
      entries: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic",
        counts: { major: 10, moderate: 85, minor: 38, unknown: 512, total: 645 }, diseaseCount: 3, foodCount: 1, source: DDINTER("DDInter14") }],
    },
  }],
  // Each stage's evidence is the pipeline's own (ops.stage_result.evidence): the keys and value types the ETL writes
  // (load/batches.py _dgda_results, stages/substances.py _evidence_for, stages/clinical.py _evidence, stages/ddinter.py _process).
  stages: [
    { stage: "dgda", status: "ok", notes: [], textMissing: [], evidence: { source: "DGDA-Drugs", concept_class: "Drug" } },
    { stage: "substances", status: "ok", notes: [], textMissing: [], evidence: { substances: [{ bds_id: "BDS-000001", name: "Acetaminophen",
      xm: "XM5DJ7", rxcui: "161", atc: ["N02BE01"], drugbank: ["DB00316"], method: "rxnav-exact" }] } },
    { stage: "clinical", status: "ok", notes: [], textMissing: [],
      evidence: { raw: "Paracetamol 500 mg", parse_status: "parsed",
        parsed: [{ name: "Paracetamol", strength_value: "500", strength_unit: "mg", per_value: null, per_unit: null }],
        aligned: [{ name: "Paracetamol", bds_id: "BDS-000001", method: "name" }], bdc_id: "BDC-000001",
        signature: "tablet|systemic|BDS-000001:500mg/" } },
    { stage: "ddinter", status: "warn",
      notes: [{ kind: "text_missing", text: missing("DDInter14", "DDInter79"), ddinterId: null, route: null }],
      textMissing: [{ ddinterA: "DDInter14", nameA: "Acetaminophen", ddinterB: "DDInter79", nameB: "Amlodipine", severity: "unknown",
        inBatch: true, partnerScope: "batch" }],
      evidence: { mappings: [{ bds_id: "BDS-000001", ddinter_id: "DDInter14", name: "Acetaminophen", route_scope: "systemic",
          method: "drugbank", confidence: 1 }],
        coverage: [{ bds_id: "BDS-000001", coverage: "full" }], pair_count: 645, disease_count: 3, food_count: 1, text_fetch_count: 7,
        text_missing: [["DDInter14", "DDInter79"]], route: "systemic",
        chosen: [{ bds_id: "BDS-000001", ddinter_id: "DDInter14", route_scope: "systemic", route_assumed: false }], route_assumed: false } },
  ],
  batchPairs: {
    totalBatchPairs: 28,
    pairs: [
      { ddinterA: "DDInter14", ddinterB: "DDInter1951", nameA: "Acetaminophen", nameB: "Warfarin", substance: "Acetaminophen",
        partnerSubstance: "Warfarin", severity: "moderate", actions: ["metabolism"],
        interaction: "Acetaminophen may increase the anticoagulant effect of warfarin.", management: "Monitor INR when the dose changes.",
        partners: [{ conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", index: 6 }],
        source: PAIR_LINK(1311), pairReview: { state: "reviewed", at: "2026-10-16T09:20:00Z", mine: false, note: null } },
      { ddinterA: "DDInter14", ddinterB: "DDInter79", nameA: "Acetaminophen", nameB: "Amlodipine", substance: "Acetaminophen",
        partnerSubstance: "Amlodipine", severity: "unknown", actions: ["unknown"], interaction: null, management: null,
        partners: [{ conceptId: "071-0098-022--amlodipine-5", tradeName: "Amlodipine-5", index: 1 }],
        source: PAIR_LINK(1290), pairReview: { state: "not_reviewed", at: null, mine: false, note: null } },
    ],
    notChecked: [{ substance: "Acetaminophen", partnerSubstance: "Domperidone",
      partners: [{ conceptId: "127-0263-018--domperidone", tradeName: "Domperidone", index: 5 }], reason: "no_data", side: "partner",
      route: "systemic" }],
  },
  // The register record's own keys (OCL API, read 20/10/2026), as ocl/transform.py reads them; the register's two spaces in
  // generic_content_raw are kept, since the extraction collapses whitespace (the guide's pitfalls, §7.11.8).
  sourceJson: { id: EXAMPLE_CONCEPT, display_name: "Napa", concept_class: "Drug",
    extras: { company: "Beximco Pharmaceuticals Ltd.", dar_number: "186-0030-006", trade_name: "Napa", dosage_form: "Tablet",
      generic_content_raw: "Paracetamol  500 mg" },
    mappings: [{ map_type: "Has-active-ingredient", to_concept_code: "XM5DJ7", to_concept_name: "Acetaminophen", retired: false }] },
  sourceUrl: `${OCL}${EXAMPLE_CONCEPT}/`,
  history: [
    { kind: "run", at: RUN_AT },
    { kind: "extract", at: NAPA_EXTRACTED, reason: "run" },
    { kind: "decision", at: "2026-10-15T08:10:00Z", role: "engineer", decision: "ok", counts: true },
  ],
  reopen: null,
  otherPairs: {
    otherBatches: 1,
    pairs: [{ ddinterA: "DDInter14", ddinterB: "DDInter83", nameA: "Acetaminophen", nameB: "Amoxicillin", substance: "Acetaminophen",
      partnerSubstance: "Amoxicillin", partnerBdsId: "BDS-000008", severity: "unknown", actions: ["unknown"], interaction: null,
      management: null, source: PAIR_LINK(1302), pairReview: { state: "not_reviewed", at: null, mine: false, note: null },
      partners: [{ conceptId: "001-0094-023--amoxil", tradeName: "Amoxil", batchId: "0003-popular-a", approved: false }], partnerCount: 1 }],
    notChecked: [{ substance: "Acetaminophen", partnerSubstance: "Ciprofloxacin", partnerBdsId: "BDS-000012",
      partners: [{ conceptId: "143-0079-023--aprocin", tradeName: "Aprocin", batchId: "0002-common-and-cross-batch", approved: false }],
      partnerCount: 1, reason: "not_run", side: "partner", route: "systemic" }],
  },
  openIssues: [],
} satisfies ReviewItem;

// ---- GET /api/qa/v1/substances/{bdsId}/pairs?page=0  ←  GET /v1/review/substances/{bdsId}?pairs=all

const WARFARIN = { bdsId: EXAMPLE_BDS, name: "Warfarin" };
const NEUTRAL = { brands: [], brandCounts: { a: 0, b: 0, batches: 0 }, history: [], version: { contentHash: "", lastPairReviewId: null } };

export const PAIRS_BODY = {
  bdsId: EXAMPLE_BDS, name: "Warfarin", names: [], codes: [], coverage: "full", entries: [], brands: [],
  pairs: { total: 3, items: [
    { ddinterA: "DDInter1951", ddinterB: "DDInter20", substanceA: WARFARIN, substanceB: { bdsId: "BDS-000004", name: "Acetylsalicylic acid" },
      entryA: { name: "Warfarin", routeScope: "systemic", source: DDINTER("DDInter1951") },
      entryB: { name: "Acetylsalicylic acid", routeScope: "systemic", source: DDINTER("DDInter20") },
      severity: "major", actions: ["synergy"], interaction: "Aspirin may increase the risk of bleeding with warfarin.",
      management: "Avoid the combination unless the benefit outweighs the bleeding risk.", source: PAIR_LINK(3039), applies: true,
      review: { state: "reviewed", at: "2026-10-16T09:00:00Z", mine: false, note: null }, changes: [], ...NEUTRAL },
    { ddinterA: "DDInter14", ddinterB: "DDInter1951", substanceA: { bdsId: "BDS-000001", name: "Acetaminophen" }, substanceB: WARFARIN,
      entryA: { name: "Acetaminophen", routeScope: "systemic", source: DDINTER("DDInter14") },
      entryB: { name: "Warfarin", routeScope: "systemic", source: DDINTER("DDInter1951") },
      severity: "moderate", actions: ["metabolism"], interaction: "Acetaminophen may increase the anticoagulant effect of warfarin.",
      management: "Monitor INR when the dose changes.", source: PAIR_LINK(1311), applies: true,
      review: { state: "changed", at: "2026-10-14T10:00:00Z", mine: false, note: null },
      changes: [{ field: "management", atReview: "Monitor INR.", now: "Monitor INR when the dose changes." }], ...NEUTRAL },
    { ddinterA: "DDInter1951", ddinterB: "DDInter79", substanceA: WARFARIN, substanceB: { bdsId: "BDS-000002", name: "Amlodipine" },
      entryA: { name: "Warfarin", routeScope: "systemic", source: DDINTER("DDInter1951") },
      entryB: { name: "Amlodipine", routeScope: "systemic", source: DDINTER("DDInter79") },
      severity: "unknown", actions: ["unknown"], interaction: null, management: null, source: PAIR_LINK(2207), applies: true,
      review: { state: "not_reviewed", at: null, mine: false, note: null }, changes: [], ...NEUTRAL },
  ] },
} satisfies SubstanceDetail;
