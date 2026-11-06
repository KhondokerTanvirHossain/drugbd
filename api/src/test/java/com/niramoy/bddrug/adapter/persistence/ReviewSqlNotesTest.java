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
}
