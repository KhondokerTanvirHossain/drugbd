/** Shown wherever a substance has no DDInter data (Global Constraints: never shown as "no interactions"). */
export const NO_DATA_SENTENCE = "No interaction data in DDInter for this substance. This does not mean it is safe to combine.";

/** Shown where DDInter has no interaction text (or only a placeholder such as "None"); never a bare placeholder. */
export const NO_INTERACTION_TEXT = "Interaction text not available from DDInter.";

/** Shown where DDInter has no management advice (or only a placeholder such as "None"). */
export const NO_MANAGEMENT_TEXT = "Management advice not available from DDInter.";

/** Shown for DDInter severity "unknown" (or any value outside major/moderate/minor) instead of the bare word. */
export const SEVERITY_NOT_CLASSIFIED = "Severity not classified by DDInter";

/** Shown instead of a record no pharmacist has approved yet (public scope). Nothing else of the record is shown. */
export const NOT_REVIEWED = "Not yet reviewed by a pharmacist";

/** Phase 0 (spec §12.1): what anonymous and `user` sessions see on /batches and /batches/[id] (status 200). */
export const BATCHES_REVIEWERS_ONLY = "Only pharmacists and engineers can see batches.";
