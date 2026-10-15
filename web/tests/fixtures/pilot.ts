import type {
  IngredientSummary, ItemRow, ReviewItem, ReviewStage, StageNote,
} from "@/lib/review-types";

type Ing = {
  name: string; bdsId: string; raw: string; value: number; unit: string; per: number | null; perUnit: string | null;
  coverage: "full" | "none"; ddi: { major: number; moderate: number; minor: number; unknown: number; total: number };
  disease: number; food: number; names: [string, string][]; codes: string[];
};
type Pilot = {
  conceptId: string; tradeName: string; dosageForm: string; generic: string; company: string; dar: string; extractedAt: string;
  clinical: { bdcId: string; displayName: string; doseForm: string; route: string; signature: string };
  dgda: [string, string][]; ddinter: { status: "ok" | "warn"; note: string }; ingredients: Ing[];
};

export const PILOT_RUN_AT = "2026-10-11T21:27:17.629Z";

export const PILOT: Pilot[] = [
  { conceptId: "071-0098-022--amlodipine-5", tradeName: "Amlodipine-5", dosageForm: "Tablet",
    generic: "Amlodipine 5 mg", company: "Premier Pharmaceuticals Ltd.", dar: "071-0098-022",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000002", displayName: "Amlodipine 5 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000002:5mg/" },
    dgda: [["XM68M5","Amlodipine"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter79; DDInter text not found for DDInter14/DDInter79; DDInter text not found for DDInter1951/DDInter79; DDInter text not found for DDInter79/DDInter83" },
    ingredients: [
      { name: "Amlodipine", bdsId: "BDS-000002", raw: "Amlodipine 5 mg", value: 5, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 21,minor: 33,total: 791,unknown: 299,moderate: 438}, disease: 4, food: 2,
        names: [["Amlodipine","icd11"],["amlodipine","rxnorm"],["Amlodipine","dgda_content"],["Amlodipine","ddinter"]],
        codes: ["ICD11_XM:XM68M5:any:xm:1","RXCUI:17767:any:rxnav-exact:1","ATC:C08CA01:any:rxnav-exact:1","DRUGBANK:DB00381:any:rxnav-exact:1","SNOMEDCT:108537001:any:rxnav-exact:1","SNOMEDCT:386864001:any:rxnav-exact:1","DDINTER:DDInter79:systemic:drugbank:1"] }] },
  { conceptId: "076-0028-006--aspirin", tradeName: "Aspirin", dosageForm: "Tablet",
    generic: "Aspirin 300 mg", company: "Apollo Pharmaceutical Laboratories Ltd.", dar: "076-0028-006",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000004", displayName: "Acetylsalicylic acid 300 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000004:300mg/" },
    dgda: [["XM4G06","Acetylsalicylic acid"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter20; DDInter text not found for DDInter14/DDInter20; DDInter text not found for DDInter1675/DDInter20; DDInter text not found for DDInter20/DDInter393; DDInter text not found for DDInter20/DDInter83" },
    ingredients: [
      { name: "Acetylsalicylic acid", bdsId: "BDS-000004", raw: "Aspirin 300 mg", value: 300, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 53,minor: 45,total: 690,unknown: 346,moderate: 246}, disease: 9, food: 1,
        names: [["Acetylsalicylic acid","icd11"],["aspirin","rxnorm"],["Aspirin","dgda_content"],["Acetylsalicylic acid","ddinter"]],
        codes: ["ICD11_XM:XM4G06:any:xm:1","RXCUI:1191:any:rxnav-exact:1","ATC:A01AD05:any:rxnav-exact:1","ATC:B01AC06:any:rxnav-exact:1","ATC:N02BA01:any:rxnav-exact:1","DRUGBANK:DB00945:any:rxnav-exact:1","SNOMEDCT:387458008:any:rxnav-exact:1","SNOMEDCT:7947003:any:rxnav-exact:1","DDINTER:DDInter20:systemic:drugbank:1"] }] },
  { conceptId: "096-0265-061--simvastatin", tradeName: "Simvastatin", dosageForm: "Tablet",
    generic: "Simvastatin 10 mg", company: "Albion Laboratories Ltd.", dar: "096-0265-061",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000006", displayName: "Simvastatin 10 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000006:10mg/" },
    dgda: [["XM7AU9","Simvastatin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter1675; DDInter text not found for DDInter14/DDInter1675; DDInter text not found for DDInter1675/DDInter20; DDInter text not found for DDInter1675/DDInter83" },
    ingredients: [
      { name: "Simvastatin", bdsId: "BDS-000006", raw: "Simvastatin 10 mg", value: 10, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 59,minor: 10,total: 732,unknown: 422,moderate: 241}, disease: 6, food: 2,
        names: [["Simvastatin","icd11"],["simvastatin","rxnorm"],["Simvastatin","dgda_content"],["Simvastatin","ddinter"]],
        codes: ["ICD11_XM:XM7AU9:any:xm:1","RXCUI:36567:any:rxnav-exact:1","ATC:C10AA01:any:rxnav-exact:1","DRUGBANK:DB00641:any:rxnav-exact:1","SNOMEDCT:387584000:any:rxnav-exact:1","SNOMEDCT:96304005:any:rxnav-exact:1","DDINTER:DDInter1675:systemic:drugbank:1"] }] },
  { conceptId: "127-0163-052--chloramphenicol", tradeName: "Chloramphenicol", dosageForm: "Eye Drops",
    generic: "Chloramphenicol 5 mg/ml", company: "EDCL (Dhaka)", dar: "127-0163-052",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000008", displayName: "Chloramphenicol 5 mg/ml eye drops", doseForm: "Eye Drops", route: "ophthalmic",
      signature: "eye drops|ophthalmic|BDS-000009:5mg/1ml" },
    dgda: [["XM2TE7","Chloramphenicol"]],
    ddinter: { status: "ok", note: "" },
    ingredients: [
      { name: "Chloramphenicol", bdsId: "BDS-000009", raw: "Chloramphenicol 5 mg/ml", value: 5, unit: "mg", per: 1, perUnit: "ml",
        coverage: "full", ddi: {major: 48,minor: 21,total: 654,unknown: 49,moderate: 536}, disease: 6, food: 0,
        names: [["Chloramphenicol","icd11"],["chloramphenicol","rxnorm"],["Chloramphenicol","dgda_content"],["Chloramphenicol","ddinter"],["Chloramphenicol (ophthalmic)","ddinter"],["Chloramphenicol (otic)","ddinter"]],
        codes: ["ICD11_XM:XM2TE7:any:xm:1","RXCUI:2348:any:rxnav-exact:1","ATC:D06AX02:any:rxnav-exact:1","ATC:D10AF03:any:rxnav-exact:1","ATC:G01AA05:any:rxnav-exact:1","ATC:J01BA01:any:rxnav-exact:1","ATC:S01AA01:any:rxnav-exact:1","ATC:S02AA01:any:rxnav-exact:1","ATC:S03AA08:any:rxnav-exact:1","DRUGBANK:DB00446:any:rxnav-exact:1","SNOMEDCT:372777009:any:rxnav-exact:1","SNOMEDCT:57191001:any:rxnav-exact:1","DDINTER:DDInter351:systemic:drugbank:1","DDINTER:DDInter352:ophthalmic:drugbank:1","DDINTER:DDInter353:otic:drugbank:1"] }] },
  { conceptId: "127-0263-018--domperidone", tradeName: "Domperidone", dosageForm: "Tablet",
    generic: "Domperidone 10 mg", company: "EDCL (Dhaka)", dar: "127-0263-018",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000009", displayName: "Domperidone 10 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000010:10mg/" },
    dgda: [["XM3GF5","Domperidone"]],
    ddinter: { status: "warn", note: "No interaction data in DDInter for this substance" },
    ingredients: [
      { name: "Domperidone", bdsId: "BDS-000010", raw: "Domperidone 10 mg", value: 10, unit: "mg", per: null, perUnit: null,
        coverage: "none", ddi: {major: 0,minor: 0,total: 0,unknown: 0,moderate: 0}, disease: 0, food: 0,
        names: [["Domperidone","icd11"],["domperidone","rxnorm"],["Domperidone","dgda_content"]],
        codes: ["ICD11_XM:XM3GF5:any:xm:1","RXCUI:3626:any:rxnav-exact:1","ATC:A03FA03:any:rxnav-exact:1","DRUGBANK:DB01184:any:rxnav-exact:1","SNOMEDCT:32955006:any:rxnav-exact:1","SNOMEDCT:387181004:any:rxnav-exact:1"] }] },
  { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", dosageForm: "Tablet",
    generic: "Warfarin Sodium 5 mg", company: "Gonoshasthaya Pharmaceuticals Ltd.", dar: "185-0138-012",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000003", displayName: "Warfarin 5 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000003:5mg/" },
    dgda: [["XM86W0","Warfarin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1951/DDInter79" },
    ingredients: [
      { name: "Warfarin", bdsId: "BDS-000003", raw: "Warfarin Sodium 5 mg", value: 5, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 138,minor: 71,total: 934,unknown: 298,moderate: 427}, disease: 8, food: 2,
        names: [["Warfarin","icd11"],["warfarin","rxnorm"],["Warfarin","dgda_content"],["Warfarin","ddinter"]],
        codes: ["ICD11_XM:XM86W0:any:xm:1","RXCUI:11289:any:rxnav-exact:1","ATC:B01AA03:any:rxnav-exact:1","DRUGBANK:DB00682:any:rxnav-exact:1","SNOMEDCT:372756006:any:rxnav-exact:1","SNOMEDCT:48603004:any:rxnav-exact:1","DDINTER:DDInter1951:systemic:drugbank:1"] }] },
  { conceptId: "185-0241-015--g-metformin", tradeName: "G-Metformin", dosageForm: "Tablet",
    generic: "Metformin Hydrochloride 500 mg", company: "Gonoshasthaya Pharmaceuticals Ltd.", dar: "185-0241-015",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000010", displayName: "Metformin 500 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000011:500mg/" },
    dgda: [["XM0JN5","Metformin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter14; DDInter text not found for DDInter1164/DDInter1675; DDInter text not found for DDInter1164/DDInter20; DDInter text not found for DDInter1164/DDInter79; DDInter text not found for DDInter1164/DDInter83" },
    ingredients: [
      { name: "Metformin", bdsId: "BDS-000011", raw: "Metformin Hydrochloride 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 20,minor: 29,total: 687,unknown: 310,moderate: 328}, disease: 4, food: 1,
        names: [["Metformin","icd11"],["metformin","rxnorm"],["Metformin","dgda_content"],["Metformin","ddinter"]],
        codes: ["ICD11_XM:XM0JN5:any:xm:1","RXCUI:6809:any:rxnav-exact:1","ATC:A10BA02:any:rxnav-exact:1","DRUGBANK:DB00331:any:rxnav-exact:1","SNOMEDCT:109081006:any:rxnav-exact:1","SNOMEDCT:372567009:any:rxnav-exact:1","DDINTER:DDInter1164:systemic:drugbank:1"] }] },
  { conceptId: "186-0030-006--napa", tradeName: "Napa", dosageForm: "Tablet",
    generic: "Paracetamol 500 mg", company: "Beximco Pharmaceuticals Ltd.", dar: "186-0030-006",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000001", displayName: "Acetaminophen 500 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000001:500mg/" },
    dgda: [["XM5DJ7","Acetaminophen"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter14; DDInter text not found for DDInter14/DDInter1675; DDInter text not found for DDInter14/DDInter20; DDInter text not found for DDInter14/DDInter393; DDInter text not found for DDInter14/DDInter79; DDInter text not found for DDInter14/DDInter83" },
    ingredients: [
      { name: "Acetaminophen", bdsId: "BDS-000001", raw: "Paracetamol 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 10,minor: 38,total: 645,unknown: 512,moderate: 85}, disease: 3, food: 1,
        names: [["Acetaminophen","icd11"],["acetaminophen","rxnorm"],["Paracetamol","dgda_content"],["Acetaminophen","ddinter"]],
        codes: ["ICD11_XM:XM5DJ7:any:xm:1","RXCUI:161:any:rxnav-exact:1","ATC:N02BE01:any:rxnav-exact:1","DRUGBANK:DB00316:any:rxnav-exact:1","SNOMEDCT:387517004:any:rxnav-exact:1","SNOMEDCT:90332006:any:rxnav-exact:1","DDINTER:DDInter14:systemic:drugbank:1"] }] },
  { conceptId: "239-0407-023--clarith", tradeName: "Clarith", dosageForm: "Tablet",
    generic: "Clarithromycin 500 mg", company: "Ibn Sina Pharmaceutical Ind. Ltd.", dar: "239-0407-023",
    extractedAt: "2026-10-11T21:28:09.250Z",
    clinical: { bdcId: "BDC-000005", displayName: "Clarithromycin 500 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000005:500mg/" },
    dgda: [["XM1VG4","Clarithromycin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter14/DDInter393; DDInter text not found for DDInter20/DDInter393" },
    ingredients: [
      { name: "Clarithromycin", bdsId: "BDS-000005", raw: "Clarithromycin 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 234,minor: 51,total: 898,unknown: 210,moderate: 403}, disease: 5, food: 1,
        names: [["Clarithromycin","icd11"],["clarithromycin","rxnorm"],["Clarithromycin","dgda_content"],["Clarithromycin","ddinter"]],
        codes: ["ICD11_XM:XM1VG4:any:xm:1","RXCUI:21212:any:rxnav-exact:1","ATC:J01FA09:any:rxnav-exact:1","DRUGBANK:DB01211:any:rxnav-exact:1","SNOMEDCT:387487009:any:rxnav-exact:1","SNOMEDCT:83999008:any:rxnav-exact:1","DDINTER:DDInter393:systemic:drugbank:1"] }] },
  { conceptId: "420-0026-023--amoxycillin-clavulanic-acid", tradeName: "Amoxycillin Clavulanic Acid", dosageForm: "Tablet",
    generic: "Amoxicillin + Clavulanic Acid 500 mg + 125 mg", company: "JR Pharmaceuticals Ltd.", dar: "420-0026-023",
    extractedAt: "2026-10-11T21:28:41.231Z",
    clinical: { bdcId: "BDC-000007", displayName: "Amoxicillin 500 mg + Clavulanic acid 125 mg tablet", doseForm: "Tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000007:125mg/;BDS-000008:500mg/" },
    dgda: [["XM2K88","Clavulanic acid"],["XM7CM1","Amoxicillin"]],
    ddinter: { status: "warn", note: "DDInter text not found for DDInter1164/DDInter83; DDInter text not found for DDInter14/DDInter83; DDInter text not found for DDInter1675/DDInter83; DDInter text not found for DDInter20/DDInter83; DDInter text not found for DDInter79/DDInter83" },
    ingredients: [
      { name: "Clavulanic acid", bdsId: "BDS-000007", raw: "Clavulanic Acid 125 mg", value: 125, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 7,minor: 0,total: 29,unknown: 0,moderate: 22}, disease: 0, food: 0,
        names: [["Clavulanic acid","icd11"],["clavulanate","rxnorm"],["Clavulanic Acid","dgda_content"],["Clavulanic acid","ddinter"]],
        codes: ["ICD11_XM:XM2K88:any:xm:1","RXCUI:48203:any:rxnav-exact:1","DRUGBANK:DB00766:any:rxnav-exact:1","SNOMEDCT:395939008:any:rxnav-exact:1","DDINTER:DDInter394:systemic:drugbank:1"] },
      { name: "Amoxicillin", bdsId: "BDS-000008", raw: "Amoxicillin 500 mg", value: 500, unit: "mg", per: null, perUnit: null,
        coverage: "full", ddi: {major: 5,minor: 8,total: 280,unknown: 238,moderate: 29}, disease: 5, food: 0,
        names: [["Amoxicillin","icd11"],["amoxicillin","rxnorm"],["Amoxicillin","dgda_content"],["Amoxicillin","ddinter"]],
        codes: ["ICD11_XM:XM7CM1:any:xm:1","RXCUI:723:any:rxnav-exact:1","ATC:J01CA04:any:rxnav-exact:1","DRUGBANK:DB01060:any:rxnav-exact:1","SNOMEDCT:27658006:any:rxnav-exact:1","SNOMEDCT:372687004:any:rxnav-exact:1","DDINTER:DDInter83:systemic:drugbank:1"] }] },];

/** DDInter's three chloramphenicol entries (§1.5): the eye drop checks DDInter352. */
const CHLORAMPHENICOL_ENTRIES = [
  { ddinterId: "DDInter351", name: "Chloramphenicol", routeScope: "systemic",
    counts: { major: 47, moderate: 421, minor: 21, unknown: 49, total: 538 }, diseaseCount: 6, foodCount: 0 },
  { ddinterId: "DDInter352", name: "Chloramphenicol (ophthalmic)", routeScope: "ophthalmic",
    counts: { major: 1, moderate: 111, minor: 0, unknown: 0, total: 112 }, diseaseCount: 0, foodCount: 0 },
  { ddinterId: "DDInter353", name: "Chloramphenicol (otic)", routeScope: "otic",
    counts: { major: 0, moderate: 4, minor: 0, unknown: 0, total: 4 }, diseaseCount: 0, foodCount: 0 },
];

function summary(g: Ing, route: string): IngredientSummary {
  const codes = g.codes.map((c) => {
    const [system, code, routeScope, method, confidence] = c.split(":");
    return { system, code, routeScope, method, confidence: Number(confidence) };
  });
  const dd = codes.filter((c) => c.system === "DDINTER");
  const exact = dd.filter((c) => c.routeScope === route);
  const chosen = (exact.length ? exact : dd.filter((c) => c.routeScope === "systemic" || c.routeScope === "any"))
    .map((c) => ({ ddinterId: c.code, name: c.code === "DDInter352" ? "Chloramphenicol (ophthalmic)" : g.name,
      routeScope: c.routeScope, routeAssumed: exact.length === 0 }));
  const entries = g.name === "Chloramphenicol" ? CHLORAMPHENICOL_ENTRIES : dd.map((c) => ({ ddinterId: c.code, name: g.name,
    routeScope: c.routeScope, counts: g.ddi, diseaseCount: g.disease, foodCount: g.food }));
  return {
    bdsId: g.bdsId, name: g.name, raw: g.raw, strengthValue: g.value, strengthUnit: g.unit, perValue: g.per, perUnit: g.perUnit,
    names: g.names.map(([name, type]) => ({ name, type, source: "pilot" })), codes,
    coverage: { coverage: g.coverage, note: "" },
    ddinter: { chosen: g.coverage === "none" ? [] : chosen, entries: g.coverage === "none" ? [] : entries },
  };
}

/** The API's own note classification (§7.3), enough for the pilot notes. */
function notes(status: string, note: string): StageNote[] {
  if (!note) return [];
  const parts = status === "warn" ? note.split("; ") : [note];
  return parts.map((text) => ({
    kind: /^DDInter text not found for /.test(text) ? "text_missing" as const
      : text === "No interaction data in DDInter for this substance" ? "no_data" as const : "other" as const,
    text, ddinterId: null, route: null,
  }));
}

function stages(p: Pilot): ReviewStage[] {
  const missing = p.ddinter.note.split("; ").map((t) => /^DDInter text not found for (DDInter\d+)\/(DDInter\d+)$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null);
  return [
    { stage: "dgda", status: "ok", notes: [], textMissing: [], evidence: {} },
    { stage: "substances", status: "ok", notes: [], textMissing: [], evidence: {} },
    { stage: "clinical", status: "ok", notes: [], textMissing: [], evidence: {} },
    { stage: "ddinter", status: p.ddinter.status, notes: notes(p.ddinter.status, p.ddinter.note),
      textMissing: missing.map((m) => ({ ddinterA: m[1], nameA: m[1], ddinterB: m[2], nameB: m[2], severity: "unknown", inBatch: true, partnerScope: "batch" as const })),
      evidence: { text_missing: missing.map((m) => [m[1], m[2]]) } },
  ];
}

export function pilotItem(key: string, over: Partial<ReviewItem> = {}): ReviewItem {
  const i = PILOT.findIndex((p) => p.conceptId.includes(key));
  if (i < 0) throw new Error(`no pilot record matches ${key}`);
  const p = PILOT[i];
  return {
    batchId: "0001-pilot", conceptId: p.conceptId, index: i + 1, total: PILOT.length, displayStatus: "pending", review: "pending",
    version: { extractedAt: p.extractedAt, lastDecisionId: null },
    batch: { runAt: PILOT_RUN_AT, itemCount: PILOT.length, status: "in_review" },
    brand: { conceptId: p.conceptId, darNumber: p.dar, tradeName: p.tradeName, company: p.company, dosageForm: p.dosageForm,
      genericContentRaw: p.generic, qualityFlag: null, parseStatus: "parsed", parseNote: null },
    dgdaIngredients: p.dgda.map(([xmCode, name]) => ({ xmCode, name })),
    clinicalDrug: { ...p.clinical },
    ingredients: p.ingredients.map((g) => summary(g, p.clinical.route)),
    stages: stages(p),
    batchPairs: { totalBatchPairs: 28, pairs: [], notChecked: [] },
    sourceJson: { id: p.conceptId, extras: {} },
    sourceUrl: `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/${encodeURIComponent(p.conceptId)}/`,
    history: [
      { kind: "run", at: PILOT_RUN_AT },
      { kind: "extract", at: p.extractedAt, reason: "run" },
    ],
    reopen: null,
    otherPairs: { pairs: [], notChecked: [], otherBatches: 0 }, openIssues: [],
    ...over,
  };
}

/** The list rows of batch 0001-pilot as the items endpoint returns them (all pending, §1.6 item 7 hints). */
export function pilotRows(): ItemRow[] {
  return PILOT.map((p, i) => {
    const pairs = p.ddinter.note ? p.ddinter.note.split("; ").filter((t) => t.startsWith("DDInter text not found for ")).length : 0;
    const noData = p.ingredients.some((g) => g.coverage === "none");
    return {
      index: i + 1, conceptId: p.conceptId, tradeName: p.tradeName, clinicalDisplayName: p.clinical.displayName,
      displayStatus: "pending" as const,
      hint: { failed: 0, warnings: p.ddinter.status === "warn" ? 1 : 0, pairsWithoutText: pairs, noData, notRun: false },
      version: { extractedAt: p.extractedAt, lastDecisionId: null },
    };
  });
}
