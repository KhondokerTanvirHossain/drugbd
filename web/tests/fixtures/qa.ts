import type { ReviewItem } from "@/lib/review-types";
import type { SubstanceDetail } from "@/lib/senior-types";
import { pilotItem } from "./pilot";
import { HASH, pairView, substanceDetail } from "./senior";

/** Planted in every place an API body has an email or a free-text note; a QA response must carry neither (§7.9.7). */
export const SENTINEL_EMAIL = "sentinel.reviewer@example.org";
export const SENTINEL_NOTE = "SENTINEL-NOTE patient Rahim has a rash";
const SOURCE = (url: string, label: string) => ({ url, label, fetchedAt: "2026-10-11T19:00:00Z" });
/** A field the internal API might add later: the allowlist must drop it wherever it appears. */
const EXTRA = { reviewerEmail: SENTINEL_EMAIL, note: SENTINEL_NOTE };

/**
 * The Napa record as GET /v1/review/batches/{b}/items/{c} returns it, with source links, a counted decision, an open issue,
 * a reopen, an in-batch pair and an other-batch pair (each with a pair-issue note), not-checked lines on both sides, and
 * EXTRA fields at every level.
 */
export function apiRecord(): ReviewItem & Record<string, unknown> {
  const base = pilotItem("napa");
  const ingredient = base.ingredients[0];
  return {
    ...base, ...EXTRA,
    displayStatus: "issue", review: "issue",
    version: { extractedAt: base.version.extractedAt, lastDecisionId: 41 },
    brand: { ...base.brand!, ...EXTRA, qualityFlag: "ok", parseStatus: "partial", parseNote: "unparsed: + Caffeine",
      source: SOURCE("https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/186-0030-006--napa/", "DGDA register (OCL)") },
    clinicalDrug: { ...base.clinicalDrug!, ...EXTRA } as ReviewItem["clinicalDrug"],
    ingredients: [{
      ...ingredient, ...EXTRA,
      codes: ingredient.codes.map((c) => ({ ...c, ...EXTRA, source: c.system === "RXCUI"
        ? SOURCE(`https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${c.code}`, "RxNav") : null })),
      names: ingredient.names.map((n) => ({ ...n, ...EXTRA })),
      // coverage.note is pipeline text (curated.interaction_coverage.note), returned as coverageNote: plant an email only
      coverage: { ...ingredient.coverage, note: "DDInter DDInter14", reviewerEmail: SENTINEL_EMAIL },
      ddinter: { ...EXTRA,
        chosen: ingredient.ddinter.chosen.map((c) => ({ ...c, ...EXTRA, routeAssumed: true })),
        entries: ingredient.ddinter.entries.map((e) => ({ ...e, ...EXTRA,
          source: SOURCE(`https://ddinter2.scbdd.com/server/drug-detail/${e.ddinterId}/`, "DDInter 2.0") })) },
    }],
    stages: base.stages.map((s) => ({ ...s, ...EXTRA, notes: s.notes.map((n) => ({ ...n, ...EXTRA })),
      textMissing: s.textMissing.map((t) => ({ ...t, ...EXTRA })) })),
    sourceJson: { id: "186-0030-006--napa", display_name: "Napa", extras: { generic: "Paracetamol 500 mg" } },
    batchPairs: { ...EXTRA, totalBatchPairs: 2,
      pairs: [{ ...EXTRA, ddinterA: "DDInter14", ddinterB: "DDInter1951", nameA: "Acetaminophen", nameB: "Warfarin",
        substance: "Acetaminophen", partnerSubstance: "Warfarin", severity: "moderate", actions: ["Monitor"],
        interaction: "Acetaminophen may increase the anticoagulant effect of warfarin.", management: "None",
        partners: [{ ...EXTRA, conceptId: "185-0138-012--g-warfarin", tradeName: "G Warfarin", index: 6 }],
        source: SOURCE("https://ddinter2.scbdd.com/server/interact/IA-9/", "Full record in DDInter 2.0"),
        pairReview: { state: "issue", at: "2026-10-15T10:00:00Z", mine: true, note: SENTINEL_NOTE } }],
      notChecked: [{ ...EXTRA, substance: "Acetaminophen", partnerSubstance: "Domperidone",
        partners: [{ conceptId: "127-0263-018--domperidone", tradeName: "Domperidone", index: 5 }], reason: "no_data", side: "partner",
        route: "systemic" }] },
    otherPairs: { ...EXTRA, otherBatches: 3,
      pairs: [{ ...EXTRA, ddinterA: "DDInter14", ddinterB: "DDInter20", nameA: "Acetaminophen", nameB: "Acetylsalicylic acid",
        substance: "Acetaminophen", partnerSubstance: "Acetylsalicylic acid", partnerBdsId: "BDS-000004", severity: "minor", actions: [],
        interaction: null, management: "Monitor for bleeding.", interactionId: "IA-7", source: null,
        pairReview: { state: "reviewed", at: "2026-10-14T09:00:00Z", mine: false, note: SENTINEL_NOTE },
        partners: [{ ...EXTRA, conceptId: "076-0028-006--aspirin", tradeName: "Aspirin", batchId: "0003-popular-a", approved: true }],
        partnerCount: 7 }],
      notChecked: [{ ...EXTRA, substance: "Acetaminophen", partnerSubstance: "Clavulanic acid", partnerBdsId: "BDS-000007",
        partners: [{ conceptId: "420-0026-023--amoxycillin-clavulanic-acid", tradeName: "Amoxycillin Clavulanic Acid",
          batchId: "0004-popular-b", approved: false }], partnerCount: 1, reason: "not_run", side: "partner", route: "systemic" }] },
    history: [
      { kind: "run", at: "2026-10-11T21:27:17.629Z" },
      { kind: "extract", at: "2026-10-11T21:28:09.250Z", reason: "rerun", carriedFrom: "0001-pilot" },
      { kind: "decision", at: "2026-10-12T10:00:00Z", role: "pharmacist", decision: "ok", note: SENTINEL_NOTE, counts: false, mine: true,
        uncountedBy: "rerun", reviewerEmail: SENTINEL_EMAIL } as ReviewItem["history"][number],
      { kind: "decision", at: "2026-10-13T10:00:00Z", role: "engineer", decision: "issue", note: SENTINEL_NOTE, counts: true, mine: false },
    ],
    reopen: { reason: "rerun", at: "2026-10-11T21:28:09.250Z", previousExtractedAt: "2026-10-10T08:00:00Z", diffAvailable: true },
    openIssues: [{ role: "engineer", at: "2026-10-13T10:00:00Z", note: SENTINEL_NOTE, mine: false }],
  } as unknown as ReviewItem & Record<string, unknown>;   // EXTRA fields are not in the API types, on purpose
}

/** Warfarin's senior substance read: one pair with Warfarin on side a, one with it on side b, one with it on both sides. */
export function apiSubstance(): SubstanceDetail & Record<string, unknown> {
  const review = { state: "changed" as const, at: "2026-10-14T09:00:00Z", mine: true, note: SENTINEL_NOTE };
  const history = [{ decision: "reviewed" as const, at: "2026-10-14T09:00:00Z", note: SENTINEL_NOTE, mine: true, changedAfter: true }];
  return {
    ...substanceDetail(), ...EXTRA,
    pairs: { total: 3, items: [
      { ...pairView(), ...EXTRA, review, history,
        changes: [{ field: "severity", atReview: "moderate", now: "major" }] },
      { ...pairView({ ddinterA: "DDInter14", ddinterB: "DDInter1951",
          substanceA: { bdsId: "BDS-000001", name: "Acetaminophen" }, substanceB: { bdsId: "BDS-000003", name: "Warfarin" },
          entryA: { name: "Acetaminophen", routeScope: "systemic", source: null },
          entryB: { name: "Warfarin", routeScope: "systemic", source: null },
          interaction: "None", management: "-", source: null, applies: false,
          review: { state: "issue", at: "2026-10-15T09:00:00Z", mine: false, note: SENTINEL_NOTE },
          changes: [{ field: "management", atReview: "x", now: "y" }], history }), ...EXTRA },
      { ...pairView({ ddinterA: "DDInter1951", ddinterB: "DDInter1952",
          substanceA: { bdsId: "BDS-000003", name: "Warfarin" }, substanceB: { bdsId: "BDS-000003", name: "Warfarin" },
          entryA: { name: "Warfarin", routeScope: "systemic", source: null },
          entryB: { name: "Warfarin (topical)", routeScope: "topical", source: null } }), ...EXTRA },
    ] },
  } as unknown as SubstanceDetail & Record<string, unknown>;
}

export const SENTINELS = [SENTINEL_EMAIL, SENTINEL_NOTE, "SENTINEL", "@", HASH, "reviewerEmail", "\"mine\"", "\"note\"", "openIssues",
  "\"reopen\"", "\"version\"", "lastDecisionId", "contentHash", "lastPairReviewId", "interactionId"];
