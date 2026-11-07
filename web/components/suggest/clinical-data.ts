import type { SuggestRow } from "@/lib/public-types";

/**
 * A row that carries clinical data: approved, or labelled (show mode serves every visible row in full, §6.10). A leaf, so
 * the header search can filter rows without loading the option body and the copy it reads (§6.11.1, §10.6).
 */
export const hasClinicalData = (r: Pick<SuggestRow, "status" | "review">) => r.status === "approved" || !!r.review;
