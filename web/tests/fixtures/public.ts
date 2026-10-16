import type { CheckResult, ProductInteractions, PublicProduct } from "@/lib/public-types";

const SRC = (url: string, label: string, fetchedAt: string | null = "2026-10-11T22:00:00Z") => ({ url, label, fetchedAt });

/** Board P's Napa, approved (the approval is the Example of Board P; everything else is the pilot's). */
export const NAPA: PublicProduct = {
  conceptId: "186-0030-006--napa", darNumber: "186-0030-006", tradeName: "Napa", company: "Beximco Pharmaceuticals Ltd.",
  dosageForm: "Tablet", genericContentRaw: "Paracetamol 500 mg", qualityFlag: null, ingredients: [{ xmCode: "XM5DJ7", name: "Paracetamol" }],
  parseStatus: "parsed", parseNote: null,
  clinicalDrug: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet", route: "systemic", ingredients: [{
    bdsId: "BDS-000001", name: "Acetaminophen", strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null,
    ddinter: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
    summary: {
      bdsId: "BDS-000001", name: "Acetaminophen", raw: "Paracetamol 500 mg", strengthValue: 500, strengthUnit: "mg", perValue: null, perUnit: null,
      names: [{ name: "Paracetamol", type: "dgda_content", source: "dgda-ocl" }, { name: "acetaminophen", type: "rxnorm", source: "rxnav" },
        { name: "Acetaminophen", type: "icd11", source: "dgda-ocl" }, { name: "Acetaminophen", type: "ddinter", source: "ddinter2" }],
      codes: [
        { system: "ICD11_XM", code: "XM5DJ7", routeScope: "any", method: "xm", confidence: 1, source: SRC("https://icd.who.int/browse/latest-release/mms/en", "Search ICD-11 for XM5DJ7", "2026-10-11T21:00:00Z") },
        { system: "RXCUI", code: "161", routeScope: "any", method: "rxnav-exact", confidence: 1, source: SRC("https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=161", "RxNav") },
        { system: "ATC", code: "N02BE01", routeScope: "any", method: "rxnav-exact", confidence: 1, source: SRC("https://atcddd.fhi.no/atc_ddd_index/?code=N02BE01&showdescription=no", "WHO ATC/DDD Index") },
        { system: "DRUGBANK", code: "DB00316", routeScope: "any", method: "rxnav-exact", confidence: 1, source: SRC("https://go.drugbank.com/drugs/DB00316", "DrugBank") },
        { system: "SNOMEDCT", code: "387517004", routeScope: "any", method: "rxnav-exact", confidence: 1, source: null },
        { system: "SNOMEDCT", code: "90332006", routeScope: "any", method: "rxnav-exact", confidence: 1, source: null },
        { system: "DDINTER", code: "DDInter14", routeScope: "systemic", method: "drugbank", confidence: 1, source: SRC("https://ddinter2.scbdd.com/server/drug-detail/DDInter14/", "DDInter 2.0", "2026-10-12T01:00:00Z") },
      ],
      coverage: { coverage: "full", note: "" },
      ddinter: { chosen: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", routeAssumed: false }],
        entries: [{ ddinterId: "DDInter14", name: "Acetaminophen", routeScope: "systemic", counts: { major: 10, moderate: 85, minor: 38, unknown: 512, total: 645 },
          diseaseCount: 3, foodCount: 1, source: null }] },
    } }] },
  verification: { status: "approved", role: "pharmacist", approvedAt: "2026-10-14T05:20:00Z" },
  provenance: { batchId: "0001-pilot", extractedAt: "2026-10-11T21:28:00Z", source: "DGDA register",
    sourceLink: SRC("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/", "DGDA register (OCL)", "2026-10-11T21:00:00Z"),
    stages: [
      { stage: "dgda", status: "ok", notes: [], textMissing: [] }, { stage: "substances", status: "ok", notes: [], textMissing: [] },
      { stage: "clinical", status: "ok", notes: [], textMissing: [] },
      { stage: "ddinter", status: "warn", notes: [], textMissing: [{ ddinterA: "DDInter1164", nameA: "Metformin", ddinterB: "DDInter14", nameB: "Acetaminophen", severity: "unknown" }] },
    ] },
  otherBrandsCount: 0,
};

const brands = (...names: [string, string][]) => names.map(([conceptId, tradeName]) => ({ conceptId, tradeName }));
const ACET = { bdsId: "BDS-000001", name: "Acetaminophen" };
export const NAPA_PAIRS: ProductInteractions = {
  conceptId: NAPA.conceptId, page: 0, totalPartners: 5,
  partners: [
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000003", name: "Warfarin" }, severity: "moderate", actions: ["synergy"],
      interaction: "Acetaminophen (APAP) may potentiate the hypoprothrombinemic effect of warfarin.",
      management: "Due to the lack of safer alternatives, acetaminophen is considered the analgesic and antipyretic drug of choice for patients receiving warfarin and similar anticoagulants. However, caution is recommended during concomitant therapy, particularly if high dosages of APAP are used.",
      ddinterA: "DDInter14", ddinterB: "DDInter1951", routeAssumed: false, source: "DDInter 2.0",
      pairReview: { state: "reviewed", reviewedAt: "2026-10-16T05:20:00Z" },
      brands: brands(["185-0138-012--g-warfarin", "G Warfarin"], ["W-9", "Warin"], ["W-8", "Coumarol"], ["W-7", "Warfa"]), brandCount: 4 },
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000002", name: "Amlodipine" }, severity: "unknown", actions: ["unknown"],
      interaction: null, management: null, ddinterA: "DDInter14", ddinterB: "DDInter79", routeAssumed: false, source: "DDInter 2.0",
      pairReview: { state: "not_reviewed", reviewedAt: null }, brands: brands(["071-0098-022--amlodipine-5", "Amlodipine-5"]), brandCount: 1 },
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000004", name: "Acetylsalicylic acid" }, severity: "unknown", actions: ["unknown"],
      interaction: null, management: null, ddinterA: "DDInter14", ddinterB: "DDInter20", routeAssumed: false, source: "DDInter 2.0",
      pairReview: { state: "reviewed", reviewedAt: "2026-10-15T08:00:00Z" }, brands: brands(["076-0028-006--aspirin", "Aspirin"]), brandCount: 1 },
  ],
  notChecked: [
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000010", name: "Domperidone" }, reason: "no_data", side: "partner", route: null,
      brands: brands(["127-0263-018--domperidone", "Domperidone"]), brandCount: 1 },
    { substance: ACET, partnerSubstance: { bdsId: "BDS-000007", name: "Oticmol" }, reason: "no_route", side: "partner", route: "systemic",
      brands: brands(["OTI-1", "Otimol"]), brandCount: 1 },
  ],
};

export const emptyCheck = (over: Partial<CheckResult> = {}): CheckResult => ({
  summary: { medicines: 0, totalPairs: 0, checkedPairs: 0, alertPairs: 0, noInteractionPairs: 0, notCheckedPairs: 0, notReviewed: 0,
    bySeverity: { major: 0, moderate: 0, minor: 0, unknown: 0 } },
  products: [], alerts: [], noInteraction: [], notChecked: [], duplicates: [], noData: [], notReviewed: [], ...over,
});
