package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.domain.PublicMode;
import java.util.List;
import java.util.stream.Collectors;

/**
 * SQL for the approval gate and the one public visibility rule (spec §7.4, §7.4.1, D74). A product's review status is the
 * {@code review} of its most recently extracted batch item: a re-run in any batch rewrites the curated rows, so an approval
 * given in an older batch no longer covers them. A product that is in no batch is 'pending' and never visible.
 *
 * <p>Every public read decides visibility through {@link #latest(PublicMode)} or {@link #publicLabelOf(String, PublicMode)}
 * and names a record's label through {@link #label(String)} (or its set-based form, {@link #labelJoined(String, String)});
 * {@link #statusOf(String)} is for the internal scope=all read and the reviewer adapters only (PublicStatusGuardTest).
 */
final class ReviewSql {
    private ReviewSql() {}

    /** Items that left the batch file but keep their review history; they don't count toward batch approval. */
    static final String REMOVED_NOTE = "removed from batch file";
    /** The ETL's DGDA load failures ($ETL/load/batches.py NOT_FOUND, NOT_A_DRUG); pinned by ReviewSqlNotesTest. */
    static final String NOT_FOUND_NOTE = "not found at source", NOT_A_DRUG_NOTE = "not a registered Drug product";
    /** The latest-item notes that hide a product in show mode (§7.4.1). */
    static final List<String> HIDDEN_NOTES = List.of(REMOVED_NOTE, NOT_FOUND_NOTE, NOT_A_DRUG_NOTE);
    static final String CURRENT_ITEM = "bi.note IS DISTINCT FROM '" + REMOVED_NOTE + "'";

    /** Today's approval rule, the same in both modes: the latest item is ok and not removed. */
    private static final String APPROVED = "(review = 'ok' AND note IS DISTINCT FROM '" + REMOVED_NOTE + "')";
    private static final String LATEST_ORDER = "extracted_at DESC NULLS LAST, batch_id DESC";

    private static String quoted(List<String> notes) {
        return notes.stream().map(n -> "'" + n + "'").collect(Collectors.joining(","));
    }

    /** {@code pub}: approved in approved-only mode; in show mode, any latest item whose note is not a hiding note. */
    private static String pub(PublicMode mode) {
        return mode.showsUnreviewed() ? "(note IS NULL OR note NOT IN (" + quoted(HIDDEN_NOTES) + "))" : APPROVED;
    }

    /** The columns of a latest-item row: concept_id, batch_id, review, note, approved, pub. */
    private static String itemColumns(PublicMode mode) {
        return "concept_id, batch_id, review, note, " + APPROVED + " AS approved, " + pub(mode) + " AS pub";
    }

    /**
     * Review status of the product whose concept_id is {@code conceptIdExpr} (e.g. "bp.concept_id"): its latest batch
     * item's review, except that a latest item removed from the batch file reads 'pending'. Internal reads only: the
     * reviewer adapters and R2dbcProductAdapter's scope=all Product.reviewStatus; never a public decision (§7.4.1).
     */
    static String statusOf(String conceptIdExpr) {
        return "coalesce((SELECT CASE WHEN lbi.note IS NOT DISTINCT FROM '" + REMOVED_NOTE + "' THEN 'pending' ELSE lbi.review END " +
               "FROM ops.batch_item lbi WHERE lbi.concept_id = " + conceptIdExpr +
               " ORDER BY lbi.extracted_at DESC NULLS LAST, lbi.batch_id DESC LIMIT 1), 'pending')";
    }

    /**
     * The one visibility rule (§7.4.1) once per product, as a CTE for {@code WITH}:
     * {@code latest(concept_id, batch_id, review, note, approved, pub)}. {@code approved} is today's rule in both modes;
     * {@code pub} (visible) equals it in approved-only mode, and in show mode is every latest item that is not removed and
     * not a DGDA load failure. A product with no batch item has no row, so it is hidden in both modes.
     */
    static String latest(PublicMode mode) {
        return "latest AS (SELECT DISTINCT ON (concept_id) " + itemColumns(mode) + " FROM ops.batch_item ORDER BY concept_id, " +
               LATEST_ORDER + ")";
    }

    /**
     * The public review label of a {@code latest} row (alias {@code a}): approved; problem when not approved and the item
     * has an open reviewer issue or a failed stage; otherwise not_reviewed. Select it only for the rows a read returns: an
     * approved row never evaluates the stage lookup, so approved-only reads pay nothing for it.
     */
    static String label(String a) {
        return "CASE WHEN " + a + ".approved THEN 'approved' WHEN " + a + ".review = 'issue' OR EXISTS (SELECT 1 FROM ops.stage_result sr " +
               "WHERE sr.batch_id = " + a + ".batch_id AND sr.concept_id = " + a + ".concept_id AND sr.status = 'fail') " +
               "THEN 'problem' ELSE 'not_reviewed' END";
    }

    /**
     * The set-based form of {@link #label(String)} for a read that labels many rows at once (P10 over the whole public
     * catalogue, §10.6): {@code failedJoin(a, f)} joins each {@code latest} row (alias {@code a}) to its failed stages once,
     * as alias {@code f}, and {@code labelJoined(a, f)} reads the same three rules from it, so the statement does one hash
     * join instead of one stage lookup per unapproved row.
     */
    static String failedJoin(String a, String f) {
        return "LEFT JOIN (SELECT DISTINCT batch_id, concept_id FROM ops.stage_result WHERE status = 'fail') " + f + " ON " + f +
               ".batch_id = " + a + ".batch_id AND " + f + ".concept_id = " + a + ".concept_id";
    }

    /** {@link #label(String)} over a {@link #failedJoin(String, String)}: approved, else problem, else not_reviewed. */
    static String labelJoined(String a, String f) {
        return "CASE WHEN " + a + ".approved THEN 'approved' WHEN " + a + ".review = 'issue' OR " + f + ".concept_id IS NOT NULL " +
               "THEN 'problem' ELSE 'not_reviewed' END";
    }

    /** The scalar form for one product: its label when visible under {@code mode}, NULL when hidden (or in no batch). */
    static String publicLabelOf(String conceptIdExpr, PublicMode mode) {
        return "(SELECT CASE WHEN li.pub THEN " + label("li") + " END FROM (SELECT " + itemColumns(mode) +
               " FROM ops.batch_item WHERE concept_id = " + conceptIdExpr + " ORDER BY " + LATEST_ORDER + " LIMIT 1) li)";
    }

    /**
     * The label a substance or clinical drug carries (§7.4.1) as an aggregate over the labels {@code labelExpr} of the
     * visible products that carry or map to it: approved when any is approved, otherwise problem when any is problem,
     * otherwise not_reviewed; NULL over no rows. Java's PublicReview.carried is the same rule.
     */
    static String carriedLabel(String labelExpr) {
        return "CASE WHEN bool_or(" + labelExpr + " = 'approved') THEN 'approved' WHEN bool_or(" + labelExpr + " = 'problem') " +
               "THEN 'problem' WHEN count(" + labelExpr + ") > 0 THEN 'not_reviewed' END";
    }

    /**
     * A hidden product's stub status from its {@code latest} row (alias {@code a}, NULL when in no batch): in show mode
     * removed, unavailable (a DGDA load failure) or not_reviewed; approved-only stubs stay not_reviewed, as before D74.
     */
    static String stubStatus(String a, PublicMode mode) {
        if (!mode.showsUnreviewed()) return "'not_reviewed'";
        return "CASE WHEN " + a + ".note = '" + REMOVED_NOTE + "' THEN 'removed' WHEN " + a + ".note IN (" +
               quoted(List.of(NOT_FOUND_NOTE, NOT_A_DRUG_NOTE)) + ") THEN 'unavailable' ELSE 'not_reviewed' END";
    }

    /** True for a note the ETL writes on a DGDA load failure. */
    static boolean loadFailure(String note) { return NOT_FOUND_NOTE.equals(note) || NOT_A_DRUG_NOTE.equals(note); }
}
