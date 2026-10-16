/**
 * Client-safe types of the §7.4 public API (P2a). A field the API may send as null is typed `| null`. Islands may import
 * these types; the fetches are in lib/api.ts (server-only).
 */
export type Source = { url: string; label: string; fetchedAt: string | null };
export type PublicPairReview = { state: "reviewed" | "not_reviewed"; reviewedAt: string | null };
export type Coverage = "full" | "none" | "not_run";
export type SeverityFilter = "major" | "moderate" | "minor" | "unknown";
export type StageKey = "dgda" | "substances" | "clinical" | "ddinter";
export type StageNote = { kind: string; text: string; ddinterId: string | null; route: string | null };
export type Counts = { major: number; moderate: number; minor: number; unknown: number; total: number };

export type ProductStub = { conceptId: string; tradeName: string; status: "not_reviewed" | "removed"; batchId: string | null; hidden: true };
export type SubstanceStub = { bdsId: string; preferredName: string; hidden: true };

export type ChosenEntry = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type IngredientSummary = {
  bdsId: string | null; name: string; raw: string; strengthValue: number | null; strengthUnit: string | null;
  perValue: number | null; perUnit: string | null;
  names: { name: string; type: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; method: string; confidence: number; source: Source | null }[];
  coverage: { coverage: Coverage; note: string };
  ddinter: { chosen: ChosenEntry[];
    entries: { ddinterId: string; name: string | null; routeScope: string; counts: Counts; diseaseCount: number; foodCount: number;
      source: Source | null }[] };
};
export type DdinterRef = { ddinterId: string; name: string | null; routeScope: string; routeAssumed: boolean };
export type ClinicalItem = { bdsId: string; name: string; strengthValue: number | null; strengthUnit: string | null; perValue: number | null;
  perUnit: string | null; ddinter: DdinterRef[]; summary: IngredientSummary | null };
export type TextMissing = { ddinterA: string; nameA: string; ddinterB: string; nameB: string; severity: string | null };
export type PublicStage = { stage: StageKey; status: "ok" | "warn" | "fail"; notes: StageNote[]; textMissing: TextMissing[] };
export type PublicProduct = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string; genericContentRaw: string;
  qualityFlag: string | null; ingredients: { xmCode: string; name: string }[]; parseStatus: string | null; parseNote: string | null;
  clinicalDrug: { bdcId: string; displayName: string; doseForm: string; route: string; ingredients: ClinicalItem[] } | null;
  verification: { status: "approved"; role: "pharmacist"; approvedAt: string | null };
  provenance: { batchId: string | null; extractedAt: string | null; source: string; sourceLink: Source | null; stages: PublicStage[] };
  otherBrandsCount: number;
};

export type SubstanceRef = { bdsId: string | null; name: string };
export type Brand = { conceptId: string; tradeName: string };
export type InteractionPair = { substance: SubstanceRef; partnerSubstance: SubstanceRef; severity: string; actions: string[];
  interaction: string | null; management: string | null; ddinterA: string; ddinterB: string; routeAssumed: boolean; source: string;
  pairReview: PublicPairReview; brands: Brand[]; brandCount: number };
export type InteractionNotChecked = { substance: SubstanceRef; partnerSubstance: SubstanceRef;
  reason: "no_data" | "not_run" | "no_route" | "unmapped"; route: string | null; brands: Brand[]; brandCount: number };
export type ProductInteractions = { conceptId: string; page: number; totalPartners: number; partners: InteractionPair[];
  notChecked: InteractionNotChecked[] };

export type ClinicalDrugView = { bdcId: string; displayName: string; doseForm: string; route: string;
  ingredients: { bdsId: string; name: string; strengthValue: number | null; strengthUnit: string | null; perValue: number | null; perUnit: string | null }[];
  products: { conceptId: string; tradeName: string; company: string; darNumber: string }[] };

export type SubstanceEntry = { ddinterId: string; name: string | null; routeScope: string; counts: Counts; diseaseCount: number;
  foodCount: number; sourceLink: Source | null };
export type PublicSubstance = {
  bdsId: string; preferredName: string;
  names: { name: string; nameType: string; source: string }[];
  codes: { system: string; code: string; routeScope: string; source: string; method: string; confidence: number; sourceLink: Source | null }[];
  coverage: { coverage: Coverage; note: string };
  products: { conceptId: string; tradeName: string; company: string }[];
  diseases: { diseaseName: string; severity: string; text: string | null; interactionId: string; routeScope: string }[];
  foods: { food: string; severity: string; description: string | null; management: string | null; interactionId: string; routeScope: string }[];
  entries: SubstanceEntry[];
  clinicalDrugs: { bdcId: string; displayName: string }[];
};
export type SubstanceInteractionItem = { partnerName: string; partnerBdsId: string | null; ddinterA: string; ddinterB: string;
  routeScope: string; severity: string; actions: string[]; interaction: string | null; management: string | null;
  pairReview: PublicPairReview; sourceUrl: string | null };
export type SubstanceInteractions = { bdsId: string; counts: SubstanceEntry[]; total: number; page: number; size: number;
  items: SubstanceInteractionItem[] };

export type SearchSubstance = { bdsId: string; preferredName: string; matchedName: string;
  matchedNameType: "preferred" | "dgda_content" | "rxnorm" | "ddinter" | "icd11"; otherNameTypes: string[]; coverage: Coverage;
  ddinterIds: string[]; keyCodes: { atc: string[]; rxcui: string[] }; approvedProductCount: number };
export type SearchProduct = { conceptId: string; tradeName: string; darNumber: string; company: string; dosageForm: string;
  genericContentRaw: string; clinicalDrug: { bdcId: string; displayName: string } | null;
  matchedOn: "trade_name" | "dar" | "generic" | "substance"; matchedName: string | null; status: "approved" };
export type SearchStub = { conceptId: string; tradeName: string; status: "not_reviewed"; hidden: true };
export type SearchResult = { query: string; total: number; hasMore: boolean; counts: { substances: number; products: number };
  substances: SearchSubstance[]; products: (SearchProduct | SearchStub)[]; suggestion: string | null };

export type SuggestRow = { conceptId: string; tradeName: string; dosageForm: string; status: "approved" | "not_reviewed";
  clinicalDisplayName: string | null; matched: { name: string; substance: string } | null };

export type Side = { conceptId: string; tradeName: string; bdsId: string | null; name: string; routeScope: string | null };
export type CheckAlert = { severity: string; a: Side; b: Side; actions: string[]; interaction: string | null; management: string | null;
  routeAssumed: boolean; ddinterA: string; ddinterB: string; interactionId: string | null; source: string; pairReview: PublicPairReview };
export type NotCheckedReason = "no_data" | "not_run" | "no_route" | "unmapped" | "same_product";
export type CheckResult = {
  summary: { medicines: number; totalPairs: number; checkedPairs: number; alertPairs: number; noInteractionPairs: number;
    notCheckedPairs: number; notReviewed: number; bySeverity: { major: number; moderate: number; minor: number; unknown: number } };
  products: { conceptId: string; tradeName: string; route: string | null;
    substances: { bdsId: string | null; name: string; coverage: Coverage; ddinter: ChosenEntry[] }[] }[];
  alerts: CheckAlert[];
  noInteraction: { a: Side; b: Side; ddinterA: string; ddinterB: string }[];
  notChecked: { a: Side; b: Side; reason: NotCheckedReason; side: "a" | "b" }[];
  duplicates: { bdsId: string; name: string; conceptIds: string[] }[];
  noData: { conceptId: string; bdsId: string | null; name: string }[];
  notReviewed: { conceptId: string; tradeName: string }[];
};
