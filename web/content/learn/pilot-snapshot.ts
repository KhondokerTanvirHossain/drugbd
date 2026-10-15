/**
 * Learn's frozen pilot examples (spec §6.8): batch 0001-pilot as stored after the §8 route fix and re-run, with the §1.6
 * Learn corrections (items 3–7 and 11). Board L's values, cross-checked against Board R's pilot export (the e2e seed's
 * source) by tests/learn-snapshot.test.ts. Live numbers and every status pill come from GET /v1/stats, never from here,
 * and a block drawn from these values is withdrawn when /v1/stats stops reporting its record as usable.
 */
import type { Severity } from "@/lib/severity";

/** The ten pilot records of batch 0001-pilot, by name. */
export const P = {
  amlodipine: "071-0098-022--amlodipine-5",
  aspirin: "076-0028-006--aspirin",
  simvastatin: "096-0265-061--simvastatin",
  chloramphenicol: "127-0163-052--chloramphenicol",
  domperidone: "127-0263-018--domperidone",
  warfarin: "185-0138-012--g-warfarin",
  metformin: "185-0241-015--g-metformin",
  napa: "186-0030-006--napa",
  clarith: "239-0407-023--clarith",
  amoxiclav: "420-0026-023--amoxycillin-clavulanic-acid",
} as const;
export type PilotId = (typeof P)[keyof typeof P];
/** In concept order (COLLATE "C"), as /v1/stats and the review desk list them. */
export const PILOT_IDS: readonly PilotId[] = [P.amlodipine, P.aspirin, P.simvastatin, P.chloramphenicol, P.domperidone,
  P.warfarin, P.metformin, P.napa, P.clarith, P.amoxiclav];

export type PilotRecord = {
  tradeName: string; darNumber: string; company: string; dosageForm: string; genericContentRaw: string;
  bdcId: string; clinicalDrug: string; route: string; signature: string;
};
export type SubstanceCodes = { icd11: string; rxcui: string; atc: string[]; drugbank: string; snomed: string[] };
export type DrugDrugCounts = { major: number; moderate: number; minor: number; unknown: number; total: number };
export type PilotSubstance = {
  bdsId: string; name: string; product: PilotId; codes: SubstanceCodes; entries: { id: string; route: string }[];
  drugDrug: DrugDrugCounts; disease: number; food: number; coverage: "full" | "none";
};
export type PilotPair = { a: string; b: string; ddinterA: string; ddinterB: string; severity: Severity; action: string };
export type TextMissingPair = { a: string; b: string; ddinterA: string; ddinterB: string };
export type PilotWarning = { status: "ok" | "warn"; noData: boolean; textMissing: TextMissingPair[] };
export type StageTally = { ok: number; warn: number; fail: number };
export type ActionExample = {
  action: string; names: string; ddinterA: string; ddinterB: string; severity: Severity; interaction: string | null; truncated: boolean;
};
export type PilotSnapshot = {
  batchId: string;
  /** DD/MM/YYYY (Dhaka): the date every "as stored on {date}" suffix and the footer print. */
  storedOn: string;
  /** The batch's run time (ops.batch.run_at), ISO with an explicit Z. */
  runAt: string;
  /**
   * G Warfarin's extracted_at on the host (ISO with Z): P0's ddinter re-run re-stamped it, so only the host knows it.
   * null when nobody with host access captured it; chapter 4 then prints no date.
   */
  warfarinExtractedAt: string | null;
  records: Record<PilotId, PilotRecord>;
  substances: PilotSubstance[];
  /** The DDInter pairs that apply to the pilot products (§1.6 item 5), Board L's order. */
  pairs: PilotPair[];
  /** Domperidone (coverage none) with each other pilot substance: not checked, not in `pairs`. */
  notCheckedPairs: number;
  warnings: Record<PilotId, PilotWarning>;
  stages: Record<"dgda" | "substances" | "clinical" | "ddinter", StageTally>;
  /** Snapshot-only (§6.8): chapter 4 evidence table counts. */
  evidence: { oclConcept: number; stageResult: number; batchRun: number; reviewDecision: number };
  /** Snapshot-only (§6.8): the glossary's review pilot lines. */
  review: { backInReview: number; engineerChecked: number; issueReported: number; decisions: number; reruns: number };
  /** Chapter 6 "A worked check": DDInter's management text for Warfarin + Acetylsalicylic acid, unchanged. */
  workedCheck: { management: string };
  /** Chapter 6 "Actions": one pair per action, with DDInter's interaction text, unchanged (the page clamps it). */
  actionExamples: ActionExample[];
};

const pair = (a: string, ddinterA: string, b: string, ddinterB: string, severity: Severity, action: string): PilotPair =>
  ({ a, b, ddinterA, ddinterB, severity, action });
const missing = (a: string, ddinterA: string, b: string, ddinterB: string): TextMissingPair => ({ a, b, ddinterA, ddinterB });
const warn = (...textMissing: TextMissingPair[]): PilotWarning => ({ status: "warn", noData: false, textMissing });

const ACET = "Acetaminophen", AMLO = "Amlodipine", ASA = "Acetylsalicylic acid", SIMVA = "Simvastatin", WARF = "Warfarin";
const CLAR = "Clarithromycin", AMOX = "Amoxicillin", METF = "Metformin";

export const PILOT_SNAPSHOT: PilotSnapshot = {
  batchId: "0001-pilot",
  storedOn: "13/10/2026",
  runAt: "2026-10-11T21:27:17.629Z",
  // The host's `g_warfarin_extracted` line ("Before you start"), verbatim; null only when nobody with host access ran it.
  warfarinExtractedAt: "2026-10-13T13:36:19.859Z",
  records: {
    [P.amlodipine]: { tradeName: "Amlodipine-5", darNumber: "071-0098-022", company: "Premier Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Amlodipine 5 mg", bdcId: "BDC-000002", clinicalDrug: "Amlodipine 5 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000002:5mg/" },
    [P.aspirin]: { tradeName: "Aspirin", darNumber: "076-0028-006", company: "Apollo Pharmaceutical Laboratories Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Aspirin 300 mg", bdcId: "BDC-000004", clinicalDrug: "Acetylsalicylic acid 300 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000004:300mg/" },
    [P.simvastatin]: { tradeName: "Simvastatin", darNumber: "096-0265-061", company: "Albion Laboratories Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Simvastatin 10 mg", bdcId: "BDC-000006", clinicalDrug: "Simvastatin 10 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000006:10mg/" },
    [P.chloramphenicol]: { tradeName: "Chloramphenicol", darNumber: "127-0163-052", company: "EDCL (Dhaka)", dosageForm: "Eye Drops",
      genericContentRaw: "Chloramphenicol 5 mg/ml", bdcId: "BDC-000008", clinicalDrug: "Chloramphenicol 5 mg/ml eye drops", route: "ophthalmic",
      signature: "eye drops|ophthalmic|BDS-000009:5mg/1ml" },
    [P.domperidone]: { tradeName: "Domperidone", darNumber: "127-0263-018", company: "EDCL (Dhaka)", dosageForm: "Tablet",
      genericContentRaw: "Domperidone 10 mg", bdcId: "BDC-000009", clinicalDrug: "Domperidone 10 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000010:10mg/" },
    [P.warfarin]: { tradeName: "G Warfarin", darNumber: "185-0138-012", company: "Gonoshasthaya Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Warfarin Sodium 5 mg", bdcId: "BDC-000003", clinicalDrug: "Warfarin 5 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000003:5mg/" },
    [P.metformin]: { tradeName: "G-Metformin", darNumber: "185-0241-015", company: "Gonoshasthaya Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Metformin Hydrochloride 500 mg", bdcId: "BDC-000010", clinicalDrug: "Metformin 500 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000011:500mg/" },
    [P.napa]: { tradeName: "Napa", darNumber: "186-0030-006", company: "Beximco Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Paracetamol 500 mg", bdcId: "BDC-000001", clinicalDrug: "Acetaminophen 500 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000001:500mg/" },
    [P.clarith]: { tradeName: "Clarith", darNumber: "239-0407-023", company: "Ibn Sina Pharmaceutical Ind. Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Clarithromycin 500 mg", bdcId: "BDC-000005", clinicalDrug: "Clarithromycin 500 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000005:500mg/" },
    [P.amoxiclav]: { tradeName: "Amoxycillin Clavulanic Acid", darNumber: "420-0026-023", company: "JR Pharmaceuticals Ltd.", dosageForm: "Tablet",
      genericContentRaw: "Amoxicillin + Clavulanic Acid 500 mg + 125 mg", bdcId: "BDC-000007",
      clinicalDrug: "Amoxicillin 500 mg + Clavulanic acid 125 mg tablet", route: "systemic",
      signature: "tablet|systemic|BDS-000007:125mg/;BDS-000008:500mg/" },
  },
  // Board L chapter 6 "DDInter 2.0 records for each pilot substance", in its order.
  substances: [
    { bdsId: "BDS-000002", name: AMLO, product: P.amlodipine,
      codes: { icd11: "XM68M5", rxcui: "17767", atc: ["C08CA01"], drugbank: "DB00381", snomed: ["108537001", "386864001"] },
      entries: [{ id: "DDInter79", route: "systemic" }], drugDrug: { major: 21, moderate: 438, minor: 33, unknown: 299, total: 791 },
      disease: 4, food: 2, coverage: "full" },
    { bdsId: "BDS-000004", name: ASA, product: P.aspirin,
      codes: { icd11: "XM4G06", rxcui: "1191", atc: ["A01AD05", "B01AC06", "N02BA01"], drugbank: "DB00945", snomed: ["387458008", "7947003"] },
      entries: [{ id: "DDInter20", route: "systemic" }], drugDrug: { major: 53, moderate: 246, minor: 45, unknown: 346, total: 690 },
      disease: 9, food: 1, coverage: "full" },
    { bdsId: "BDS-000006", name: SIMVA, product: P.simvastatin,
      codes: { icd11: "XM7AU9", rxcui: "36567", atc: ["C10AA01"], drugbank: "DB00641", snomed: ["387584000", "96304005"] },
      entries: [{ id: "DDInter1675", route: "systemic" }], drugDrug: { major: 59, moderate: 241, minor: 10, unknown: 422, total: 732 },
      disease: 6, food: 2, coverage: "full" },
    { bdsId: "BDS-000009", name: "Chloramphenicol", product: P.chloramphenicol,
      codes: { icd11: "XM2TE7", rxcui: "2348", atc: ["D06AX02", "D10AF03", "G01AA05", "J01BA01", "S01AA01", "S02AA01", "S03AA08"],
        drugbank: "DB00446", snomed: ["372777009", "57191001"] },
      entries: [{ id: "DDInter351", route: "systemic" }, { id: "DDInter352", route: "ophthalmic" }, { id: "DDInter353", route: "otic" }],
      drugDrug: { major: 48, moderate: 536, minor: 21, unknown: 49, total: 654 }, disease: 6, food: 0, coverage: "full" },
    { bdsId: "BDS-000010", name: "Domperidone", product: P.domperidone,
      codes: { icd11: "XM3GF5", rxcui: "3626", atc: ["A03FA03"], drugbank: "DB01184", snomed: ["32955006", "387181004"] },
      entries: [], drugDrug: { major: 0, moderate: 0, minor: 0, unknown: 0, total: 0 }, disease: 0, food: 0, coverage: "none" },
    { bdsId: "BDS-000003", name: WARF, product: P.warfarin,
      codes: { icd11: "XM86W0", rxcui: "11289", atc: ["B01AA03"], drugbank: "DB00682", snomed: ["372756006", "48603004"] },
      entries: [{ id: "DDInter1951", route: "systemic" }], drugDrug: { major: 138, moderate: 427, minor: 71, unknown: 298, total: 934 },
      disease: 8, food: 2, coverage: "full" },
    { bdsId: "BDS-000011", name: METF, product: P.metformin,
      codes: { icd11: "XM0JN5", rxcui: "6809", atc: ["A10BA02"], drugbank: "DB00331", snomed: ["109081006", "372567009"] },
      entries: [{ id: "DDInter1164", route: "systemic" }], drugDrug: { major: 20, moderate: 328, minor: 29, unknown: 310, total: 687 },
      disease: 4, food: 1, coverage: "full" },
    { bdsId: "BDS-000001", name: ACET, product: P.napa,
      codes: { icd11: "XM5DJ7", rxcui: "161", atc: ["N02BE01"], drugbank: "DB00316", snomed: ["387517004", "90332006"] },
      entries: [{ id: "DDInter14", route: "systemic" }], drugDrug: { major: 10, moderate: 85, minor: 38, unknown: 512, total: 645 },
      disease: 3, food: 1, coverage: "full" },
    { bdsId: "BDS-000005", name: CLAR, product: P.clarith,
      codes: { icd11: "XM1VG4", rxcui: "21212", atc: ["J01FA09"], drugbank: "DB01211", snomed: ["387487009", "83999008"] },
      entries: [{ id: "DDInter393", route: "systemic" }], drugDrug: { major: 234, moderate: 403, minor: 51, unknown: 210, total: 898 },
      disease: 5, food: 1, coverage: "full" },
    { bdsId: "BDS-000007", name: "Clavulanic acid", product: P.amoxiclav,
      codes: { icd11: "XM2K88", rxcui: "48203", atc: [], drugbank: "DB00766", snomed: ["395939008"] },
      entries: [{ id: "DDInter394", route: "systemic" }], drugDrug: { major: 7, moderate: 22, minor: 0, unknown: 0, total: 29 },
      disease: 0, food: 0, coverage: "full" },
    { bdsId: "BDS-000008", name: AMOX, product: P.amoxiclav,
      codes: { icd11: "XM7CM1", rxcui: "723", atc: ["J01CA04"], drugbank: "DB01060", snomed: ["27658006", "372687004"] },
      entries: [{ id: "DDInter83", route: "systemic" }], drugDrug: { major: 5, moderate: 29, minor: 8, unknown: 238, total: 280 },
      disease: 5, food: 0, coverage: "full" },
  ],
  pairs: [
    pair(WARF, "DDInter1951", ASA, "DDInter20", "major", "synergy"),
    pair(WARF, "DDInter1951", CLAR, "DDInter393", "major", "metabolism"),
    pair(SIMVA, "DDInter1675", CLAR, "DDInter393", "major", "metabolism"),
    pair(SIMVA, "DDInter1675", AMLO, "DDInter79", "major", "metabolism"),
    pair(ACET, "DDInter14", WARF, "DDInter1951", "moderate", "synergy"),
    pair(ASA, "DDInter20", AMLO, "DDInter79", "moderate", "antagonism"),
    pair(CLAR, "DDInter393", AMLO, "DDInter79", "moderate", "metabolism"),
    pair(WARF, "DDInter1951", AMOX, "DDInter83", "moderate", "synergy"),
    pair(METF, "DDInter1164", WARF, "DDInter1951", "moderate", "metabolism"),
    pair(METF, "DDInter1164", CLAR, "DDInter393", "moderate", "metabolism"),
    pair(SIMVA, "DDInter1675", WARF, "DDInter1951", "minor", "distribution"),
    pair(CLAR, "DDInter393", AMOX, "DDInter83", "minor", "others"),
    pair(ACET, "DDInter14", AMLO, "DDInter79", "unknown", "unknown"),
    pair(WARF, "DDInter1951", AMLO, "DDInter79", "unknown", "unknown"),
    pair(ACET, "DDInter14", ASA, "DDInter20", "unknown", "unknown"),
    pair(ACET, "DDInter14", CLAR, "DDInter393", "unknown", "unknown"),
    pair(ASA, "DDInter20", CLAR, "DDInter393", "unknown", "unknown"),
    pair(ACET, "DDInter14", SIMVA, "DDInter1675", "unknown", "unknown"),
    pair(SIMVA, "DDInter1675", ASA, "DDInter20", "unknown", "unknown"),
    pair(ACET, "DDInter14", AMOX, "DDInter83", "unknown", "unknown"),
    pair(SIMVA, "DDInter1675", AMOX, "DDInter83", "unknown", "unknown"),
    pair(ASA, "DDInter20", AMOX, "DDInter83", "unknown", "unknown"),
    pair(AMLO, "DDInter79", AMOX, "DDInter83", "unknown", "unknown"),
    pair(METF, "DDInter1164", ACET, "DDInter14", "unknown", "unknown"),
    pair(METF, "DDInter1164", SIMVA, "DDInter1675", "unknown", "unknown"),
    pair(METF, "DDInter1164", ASA, "DDInter20", "unknown", "unknown"),
    pair(METF, "DDInter1164", AMLO, "DDInter79", "unknown", "unknown"),
    pair(METF, "DDInter1164", AMOX, "DDInter83", "unknown", "unknown"),
  ],
  notCheckedPairs: 10,
  warnings: {
    [P.amlodipine]: warn(missing(METF, "DDInter1164", AMLO, "DDInter79"), missing(ACET, "DDInter14", AMLO, "DDInter79"),
      missing(WARF, "DDInter1951", AMLO, "DDInter79"), missing(AMLO, "DDInter79", AMOX, "DDInter83")),
    [P.aspirin]: warn(missing(METF, "DDInter1164", ASA, "DDInter20"), missing(ACET, "DDInter14", ASA, "DDInter20"),
      missing(SIMVA, "DDInter1675", ASA, "DDInter20"), missing(ASA, "DDInter20", CLAR, "DDInter393"),
      missing(ASA, "DDInter20", AMOX, "DDInter83")),
    [P.simvastatin]: warn(missing(METF, "DDInter1164", SIMVA, "DDInter1675"), missing(ACET, "DDInter14", SIMVA, "DDInter1675"),
      missing(SIMVA, "DDInter1675", ASA, "DDInter20"), missing(SIMVA, "DDInter1675", AMOX, "DDInter83")),
    [P.chloramphenicol]: { status: "ok", noData: false, textMissing: [] },
    [P.domperidone]: { status: "warn", noData: true, textMissing: [] },
    [P.warfarin]: warn(missing(WARF, "DDInter1951", AMLO, "DDInter79")),
    [P.metformin]: warn(missing(METF, "DDInter1164", ACET, "DDInter14"), missing(METF, "DDInter1164", SIMVA, "DDInter1675"),
      missing(METF, "DDInter1164", ASA, "DDInter20"), missing(METF, "DDInter1164", AMLO, "DDInter79"),
      missing(METF, "DDInter1164", AMOX, "DDInter83")),
    [P.napa]: warn(missing(METF, "DDInter1164", ACET, "DDInter14"), missing(ACET, "DDInter14", SIMVA, "DDInter1675"),
      missing(ACET, "DDInter14", ASA, "DDInter20"), missing(ACET, "DDInter14", CLAR, "DDInter393"),
      missing(ACET, "DDInter14", AMLO, "DDInter79"), missing(ACET, "DDInter14", AMOX, "DDInter83")),
    [P.clarith]: warn(missing(ACET, "DDInter14", CLAR, "DDInter393"), missing(ASA, "DDInter20", CLAR, "DDInter393")),
    [P.amoxiclav]: warn(missing(METF, "DDInter1164", AMOX, "DDInter83"), missing(ACET, "DDInter14", AMOX, "DDInter83"),
      missing(SIMVA, "DDInter1675", AMOX, "DDInter83"), missing(ASA, "DDInter20", AMOX, "DDInter83"),
      missing(AMLO, "DDInter79", AMOX, "DDInter83")),
  },
  stages: {
    dgda: { ok: 10, warn: 0, fail: 0 },
    substances: { ok: 10, warn: 0, fail: 0 },
    clinical: { ok: 10, warn: 0, fail: 0 },
    ddinter: { ok: 1, warn: 9, fail: 0 },
  },
  evidence: { oclConcept: 10, stageResult: 40, batchRun: 2, reviewDecision: 0 },
  review: { backInReview: 0, engineerChecked: 0, issueReported: 0, decisions: 0, reruns: 1 },
  workedCheck: {
    management: "This combination, especially with analgesic/antipyretic aspirin doses, should generally be avoided unless the potential benefit outweighs the risk of bleeding. If concomitant therapy is used for additive anticoagulant effects, monitoring for excessive anticoagulation and overt and occult bleeding is recommended. The INR should be checked frequently and the dosage adjusted accordingly when aspirin is added to an anticoagulant regimen. Be cognizant that bleeding may occur without INR or prothrombin time increases. Patients should be advised to promptly report any signs of bleeding to their physician, including pain, swelling, headache, dizziness, weakness, prolonged bleeding from cuts, vaginal bleeding, nosebleeds, bleeding of gums from brushing, unusual bruising, red or brown urine, or red or black stools. Patients should also be counseled to avoid any other over-the-counter oral or topical salicylate products.",
  },
  actionExamples: [
    { action: "synergy", names: "Warfarin + Acetylsalicylic acid", ddinterA: "DDInter1951", ddinterB: "DDInter20", severity: "major", truncated: true,
      interaction: "Aspirin, even in small doses, may increase the risk of bleeding in patients on oral anticoagulants by inhibiting platelet aggregation, prolonging bleeding time, and inducing gastrointestinal lesions. Analgesic/antipyretic doses of aspirin increase the risk of major bleeding more than low-dose aspirin; however bleeding has also occurred with low-dose aspirin." },
    { action: "metabolism", names: "Simvastatin + Clarithromycin", ddinterA: "DDInter1675", ddinterB: "DDInter393", severity: "major", truncated: false,
      interaction: "Coadministration with potent inhibitors of CYP450 3A4 may significantly increase the plasma concentrations of simvastatin and lovastatin and their active acid metabolites, all of which are primarily metabolized by the isoenzyme." },
    { action: "antagonism", names: "Acetylsalicylic acid + Amlodipine", ddinterA: "DDInter20", ddinterB: "DDInter79", severity: "moderate", truncated: true,
      interaction: "Limited data indicate that some cyclooxygenase inhibitors may attenuate the antihypertensive effects of some calcium channel blockers. The mechanism appears to be related to an alteration of vascular tone, which is dependent on prostacyclins and other vasodilatory prostanoids. When a nonsteroidal anti-inflammatory drug (NSAID) is added to the regimen of a patient who is already taking a calcium channel blocker, increased blood pressure may result. Also, the clinician should be aware that the risk of hypotension is increased when NSAIDs are withdrawn from the regimen." },
    { action: "distribution", names: "Simvastatin + Warfarin", ddinterA: "DDInter1675", ddinterB: "DDInter1951", severity: "minor", truncated: true,
      interaction: "Simvastatin may slightly increase the anticoagulant response to warfarin. The mechanism may be warfarin displacement from protein binding sites. The clinical significance of this interaction has not been established, however, clinical monitoring of patient warfarin response and tolerance is recommended. Simvastatin may interact in a similar way with other oral anticoagulants. Patients should be advised to promptly report any signs of bleeding to their physician, including pain, swelling, headache, dizziness, weakness, prolonged bleeding from cuts, increased menstrual flow, vaginal bleeding, nosebleeds, bleeding of gums from brushing, unusual bleeding or bruising, red or brown urine, or red or black stools." },
    { action: "others", names: "Clarithromycin + Amoxicillin", ddinterA: "DDInter393", ddinterB: "DDInter83", severity: "minor", truncated: true,
      interaction: "Although some in vitro data indicate synergism between macrolide antibiotics and penicillins, other in vitro data indicate antagonism. When these drugs are given together, neither has predictable therapeutic efficacy. Data are available for erythromycin, although theoretically this interaction could occur with any macrolide. Except for monitoring of the effectiveness of antibiotic therapy, no special precautions appear to be necessary." },
    { action: "unknown", names: "Acetaminophen + Amlodipine", ddinterA: "DDInter14", ddinterB: "DDInter79", severity: "unknown", truncated: false,
      interaction: null },
  ],
};

/** The substances of one pilot product, in snapshot order. */
export const substancesOf = (id: PilotId): PilotSubstance[] => PILOT_SNAPSHOT.substances.filter((s) => s.product === id);

/** One substance by its name; throws on a name the snapshot does not hold (a content bug, caught by the tests). */
export function substanceNamed(name: string): PilotSubstance {
  const s = PILOT_SNAPSHOT.substances.find((x) => x.name === name);
  if (!s) throw new Error(`pilot snapshot: no substance named ${name}`);
  return s;
}

/** The DDInter substance name for an entry id, from the snapshot's entries. */
export const entryName = (ddinterId: string): string | null =>
  PILOT_SNAPSHOT.substances.find((s) => s.entries.some((e) => e.id === ddinterId))?.name ?? null;

export function severityCounts(pairs: readonly PilotPair[] = PILOT_SNAPSHOT.pairs): Record<Severity, number> {
  const out: Record<Severity, number> = { major: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const p of pairs) out[p.severity] += 1;
  return out;
}

export function actionCounts(pairs: readonly PilotPair[] = PILOT_SNAPSHOT.pairs): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pairs) out[p.action] = (out[p.action] ?? 0) + 1;
  return out;
}

/** Crosswalk codes held for a substance (ICD-11, RxCUI, ATC, DrugBank, SNOMED CT). */
export const codeCount = (s: PilotSubstance): number => 3 + s.codes.atc.length + s.codes.snomed.length;
