import type { PairView, PairsPage, SubstanceDetail } from "@/lib/senior-types";

export const HASH = "a".repeat(64);
const FETCHED = "2026-10-11T19:00:00Z";

/** Warfarin + Acetylsalicylic acid as the API's PairView carries it (the pilot's Major pair, §1.5). */
export function pairView(over: Partial<PairView> = {}): PairView {
  return {
    ddinterA: "DDInter1951", ddinterB: "DDInter20",
    substanceA: { bdsId: "BDS-000003", name: "Warfarin" }, substanceB: { bdsId: "BDS-000004", name: "Acetylsalicylic acid" },
    entryA: { name: "Warfarin", routeScope: "systemic",
      source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: FETCHED } },
    entryB: { name: "Acetylsalicylic acid", routeScope: "systemic",
      source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter20/", label: "DDInter 2.0", fetchedAt: FETCHED } },
    severity: "major", actions: ["synergy"], interaction: "Aspirin may increase the risk of bleeding.", management: "Avoid the combination.",
    source: { url: "https://ddinter2.scbdd.com/server/interact/3039/", label: "Full record in DDInter 2.0", fetchedAt: null },
    applies: true,
    brands: [
      { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", batchId: "0001-pilot", displayStatus: "approved", side: "a" },
      { conceptId: "076-0028-006--aspirin", tradeName: "Aspirin", batchId: "e2e-p1c", displayStatus: "pending", side: "b" },
    ],
    brandCounts: { a: 1, b: 1, batches: 2 },
    review: { state: "not_reviewed", at: null, mine: false, note: null }, changes: [], history: [],
    version: { contentHash: HASH, lastPairReviewId: null }, ...over,
  };
}

export const pairsPage = (items: PairView[], over: Partial<PairsPage> = {}): PairsPage => ({
  total: items.length, counts: { todo: items.length, changed: 0, issue: 0, reviewed: 0, all: items.length }, items, ...over });

export function substanceDetail(over: Partial<SubstanceDetail> = {}): SubstanceDetail {
  return {
    bdsId: "BDS-000003", name: "Warfarin",
    names: [{ name: "Warfarin", type: "icd11", source: "dgda-ocl" }, { name: "warfarin", type: "rxnorm", source: "rxnav" }],
    codes: [
      { system: "RXCUI", code: "11289", routeScope: "any", method: "rxnav-exact", confidence: 1,
        source: { url: "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=11289", label: "RxNav", fetchedAt: FETCHED } },
      { system: "DDINTER", code: "DDInter1951", routeScope: "systemic", method: "drugbank", confidence: 1,
        source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: FETCHED } },
    ],
    coverage: "full",
    entries: [{ ddinterId: "DDInter1951", name: "Warfarin", routeScope: "systemic",
      counts: { major: 120, moderate: 300, minor: 20, unknown: 60, total: 500 }, diseaseCount: 12, foodCount: 7,
      source: { url: "https://ddinter2.scbdd.com/server/drug-detail/DDInter1951/", label: "DDInter 2.0", fetchedAt: FETCHED } }],
    brands: [
      { conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", batchId: "0001-pilot", displayStatus: "approved",
        clinicalDrug: { bdcId: "BDC-000003", displayName: "Warfarin 5 mg tablet", route: "systemic" }, strengthText: "5 mg",
        chosen: [{ ddinterId: "DDInter1951", routeScope: "systemic", routeAssumed: false }], reason: null },
      { conceptId: "900-0001-001--warin", tradeName: "Warin", batchId: "e2e-p1c", displayStatus: "pending",
        clinicalDrug: { bdcId: "BDC-000020", displayName: "Warfarin 2 mg tablet", route: "systemic" }, strengthText: "2 mg",
        chosen: [{ ddinterId: "DDInter1951", routeScope: "systemic", routeAssumed: false }], reason: null },
    ],
    pairs: { total: 1, items: [pairView()] }, ...over,
  };
}
