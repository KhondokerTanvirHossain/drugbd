package com.niramoy.bddrug.adapter.persistence;

/**
 * SQL for the approval gate. A product's review status is the {@code review} of its most recently
 * extracted batch item: a re-run in any batch rewrites the curated rows, so an approval given in an
 * older batch no longer covers them. A product that is in no batch is 'pending'.
 */
final class ReviewSql {
    private ReviewSql() {}

    /** Items that left the batch file but keep their review history; they don't count toward batch approval. */
    static final String REMOVED_NOTE = "removed from batch file";
    static final String CURRENT_ITEM = "bi.note IS DISTINCT FROM '" + REMOVED_NOTE + "'";

    /** Review status of the product whose concept_id is {@code conceptIdExpr} (e.g. "bp.concept_id"). */
    static String statusOf(String conceptIdExpr) {
        return "coalesce((SELECT lbi.review FROM ops.batch_item lbi WHERE lbi.concept_id = " + conceptIdExpr +
               " ORDER BY lbi.extracted_at DESC NULLS LAST, lbi.batch_id DESC LIMIT 1), 'pending')";
    }
}
