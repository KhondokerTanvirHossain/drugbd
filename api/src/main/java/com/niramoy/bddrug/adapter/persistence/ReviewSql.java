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

    /**
     * Review status of the product whose concept_id is {@code conceptIdExpr} (e.g. "bp.concept_id"): its latest batch
     * item's review, except that a latest item removed from the batch file reads 'pending', so it is never public
     * (spec §6.4, §7.4). Same ordering as {@link #LATEST_PUBLIC} and the batch_item_concept_latest_idx index.
     */
    static String statusOf(String conceptIdExpr) {
        return "coalesce((SELECT CASE WHEN lbi.note IS NOT DISTINCT FROM '" + REMOVED_NOTE + "' THEN 'pending' ELSE lbi.review END " +
               "FROM ops.batch_item lbi WHERE lbi.concept_id = " + conceptIdExpr +
               " ORDER BY lbi.extracted_at DESC NULLS LAST, lbi.batch_id DESC LIMIT 1), 'pending')";
    }

    /**
     * The §7.4 visibility rule once per product, as a CTE for {@code WITH}: {@code latest(concept_id, pub)}, where
     * {@code pub} is true when the product's latest item is ok and not removed. Equivalent to
     * {@code statusOf(x) = 'ok'}, computed in one pass instead of one subquery per row (GET /v1/stats).
     */
    static final String LATEST_PUBLIC =
        "latest AS (SELECT DISTINCT ON (concept_id) concept_id, " +
        "(review = 'ok' AND note IS DISTINCT FROM '" + REMOVED_NOTE + "') AS pub " +
        "FROM ops.batch_item ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC)";
}
