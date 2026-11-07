package com.niramoy.bddrug.adapter.persistence;

import com.niramoy.bddrug.domain.PublicMode;
import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.4.1 (D74): ReviewSql's DGDA load-failure notes are the ETL's own ($ETL/load/batches.py NOT_FOUND, NOT_A_DRUG), so a
 * renamed note in the pipeline can't silently make a failed load visible; and the one rule's shape in each mode.
 */
class ReviewSqlNotesTest {
    static final Path BATCHES = Path.of("../etl/src/bddrug_etl/load/batches.py");

    @Test void theHidingNotesMatchTheEtl() throws IOException {
        String py = Files.readString(BATCHES);
        Matcher m = Pattern.compile("NOT_FOUND, NOT_A_DRUG = \"([^\"]+)\", \"([^\"]+)\"").matcher(py);
        assertThat(m.find()).as("batches.py still defines NOT_FOUND, NOT_A_DRUG on one line").isTrue();
        assertThat(ReviewSql.NOT_FOUND_NOTE).isEqualTo(m.group(1));
        assertThat(ReviewSql.NOT_A_DRUG_NOTE).isEqualTo(m.group(2));
        assertThat(ReviewSql.HIDDEN_NOTES).containsExactly(ReviewSql.REMOVED_NOTE, m.group(1), m.group(2));
        assertThat(ReviewSql.REMOVED_NOTE).isEqualTo(com.niramoy.bddrug.domain.DecisionGuard.REMOVED_NOTE);
    }

    @Test void approvedOnlyVisibilityIsApproval() {
        String sql = ReviewSql.latest(PublicMode.APPROVED_ONLY);
        assertThat(sql).contains("(review = 'ok' AND note IS DISTINCT FROM 'removed from batch file') AS approved",
            "(review = 'ok' AND note IS DISTINCT FROM 'removed from batch file') AS pub");
    }

    @Test void showModeHidesOnlyTheHidingNotes() {
        assertThat(ReviewSql.latest(PublicMode.SHOW_UNREVIEWED)).contains(
            "(note IS NULL OR note NOT IN ('removed from batch file','not found at source','not a registered Drug product')) AS pub");
        assertThat(ReviewSql.stubStatus("s", PublicMode.APPROVED_ONLY)).isEqualTo("'not_reviewed'");
        assertThat(ReviewSql.stubStatus("s", PublicMode.SHOW_UNREVIEWED)).contains("'removed'", "'unavailable'");
    }

    /**
     * §10.6 at 40,000 products: P10 labels every visible product in one statement, so its label is set-based (one join to
     * the failed items) and never the per-row EXISTS of ReviewSql.label; both forms read the same three rules.
     */
    @Test void p10LabelsEveryVisibleProductWithOneJoin() {
        for (PublicMode mode : PublicMode.values()) {
            String sql = R2dbcProductInteractionsAdapter.groups(mode);
            assertThat(sql).as(mode.name()).doesNotContain("EXISTS").contains(ReviewSql.failedJoin("l", "f"));
        }
        assertThat(ReviewSql.failedJoin("l", "f")).isEqualTo("LEFT JOIN (SELECT DISTINCT batch_id, concept_id FROM ops.stage_result " +
            "WHERE status = 'fail') f ON f.batch_id = l.batch_id AND f.concept_id = l.concept_id");
        assertThat(ReviewSql.labelJoined("l", "f")).isEqualTo("CASE WHEN l.approved THEN 'approved' WHEN l.review = 'issue' OR " +
            "f.concept_id IS NOT NULL THEN 'problem' ELSE 'not_reviewed' END");
    }

    /**
     * §6.11.3 P17 (D75): the A–Z list may scan the whole visible catalogue, so its page labels with the set-based form as P10
     * does, and its counts are one grouped read on the rule; the letter is always a bind, never part of the SQL text.
     */
    @Test void p17LabelsWithOneJoinAndBindsTheLetter() {
        for (PublicMode mode : PublicMode.values()) {
            for (boolean byLetter : new boolean[]{false, true}) {
                String sql = R2dbcProductAdapter.browsePage(mode, byLetter);
                assertThat(sql).as(mode + " " + byLetter).doesNotContain("EXISTS").contains(ReviewSql.latest(mode),
                    ReviewSql.failedJoin("l", "f"), ReviewSql.labelJoined("l", "f"), "AND l.pub",
                    "ORDER BY lower(bp.trade_name), bp.trade_name, bp.concept_id LIMIT :limit OFFSET :offset");
                assertThat(sql.contains(R2dbcProductAdapter.FIRST_LETTER + " = :letter")).isEqualTo(byLetter);
            }
            assertThat(R2dbcProductAdapter.browseCounts(mode)).doesNotContain("EXISTS", "stage_result")
                .contains(ReviewSql.latest(mode), "AND l.pub GROUP BY 1");
        }
        assertThat(R2dbcProductAdapter.FIRST_LETTER)
            .isEqualTo("CASE WHEN bp.trade_name ~ '^[A-Za-z]' THEN upper(left(bp.trade_name, 1)) ELSE '0-9' END");
    }
}
