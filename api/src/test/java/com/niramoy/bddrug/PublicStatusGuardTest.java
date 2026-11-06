package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.4.1 (D74), §11.3: every public adapter decides visibility through the one rule, ReviewSql.latest or
 * ReviewSql.publicLabelOf, under the public mode, so a public read cannot bypass it (a removed latest item is never
 * visible, PO D7; in show mode a DGDA load failure is hidden too). ReviewSql.statusOf is internal: the reviewer adapters
 * and R2dbcProductAdapter's scope=all Product.reviewStatus only. LATEST_PUBLIC is gone. Reviewer adapters read batch items
 * directly and are listed by name, so a new adapter must either use the rule or be added here in review.
 */
class PublicStatusGuardTest {
    static final Path DIR = Path.of("src/main/java/com/niramoy/bddrug/adapter/persistence");
    /** QA (§7.9.5): R2dbcQaQueryAdapter serves the token-only /v1/qa/* reads of unreviewed data, never a public status. */
    static final Set<String> REVIEWER_ONLY = Set.of("R2dbcReviewAdapter.java", "R2dbcReviewQueryAdapter.java", "R2dbcBatchAdapter.java",
        "R2dbcSeniorReviewAdapter.java", "R2dbcFlagAdapter.java", "R2dbcAuditAdapter.java", "ReviewSql.java", "PairReviewReader.java",
        "R2dbcQaQueryAdapter.java");
    /** The internal scope=all read that may name the internal review status (Product.reviewStatus). */
    static final String INTERNAL_STATUS_READER = "R2dbcProductAdapter.java";
    /** Every adapter that serves a public read; each must use the rule. */
    static final List<String> PUBLIC_ADAPTERS = List.of("R2dbcProductAdapter.java", "R2dbcProductDetailAdapter.java",
        "R2dbcProductInteractionsAdapter.java", "R2dbcClinicalDrugAdapter.java", "R2dbcSubstanceAdapter.java", "R2dbcSearchAdapter.java",
        "R2dbcCheckAdapter.java", "R2dbcStatsAdapter.java");

    static boolean usesTheRule(String source) {
        return source.contains("ReviewSql.latest(") || source.contains("ReviewSql.publicLabelOf(");
    }

    static boolean readsStatusWithoutTheRule(String source) {
        return source.contains("batch_item") && !usesTheRule(source);
    }

    /** The approval predicate and the hiding notes, written anywhere but ReviewSql. */
    static boolean writesItsOwnRule(String source) {
        return source.matches("(?s).*review\\s*=\\s*'ok'.*") || source.contains("removed from batch file")
               || source.contains("not found at source") || source.contains("not a registered Drug product");
    }

    @Test void everyPublicAdapterReadsStatusThroughTheOneRule() throws IOException {
        List<String> offenders = new ArrayList<>(), ruled = new ArrayList<>(), statusOf = new ArrayList<>(), ownRule = new ArrayList<>(),
            legacy = new ArrayList<>();
        try (Stream<Path> files = Files.list(DIR)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".java")).sorted().toList()) {
                String name = f.getFileName().toString(), src = Files.readString(f);
                if (src.contains("LATEST_PUBLIC")) legacy.add(name);
                if (REVIEWER_ONLY.contains(name)) continue;
                if (readsStatusWithoutTheRule(src)) offenders.add(name);
                if (usesTheRule(src)) ruled.add(name);
                if (src.contains("ReviewSql.statusOf(") && !name.equals(INTERNAL_STATUS_READER)) statusOf.add(name);
                if (writesItsOwnRule(src)) ownRule.add(name);
            }
        }
        assertThat(legacy).as("LATEST_PUBLIC is replaced by ReviewSql.latest").isEmpty();
        assertThat(offenders).isEmpty();
        assertThat(statusOf).as("statusOf outside the reviewer adapters and the internal product read").isEmpty();
        assertThat(ownRule).as("a public adapter with its own approval predicate or hiding note").isEmpty();
        assertThat(ruled).containsAll(PUBLIC_ADAPTERS);
    }

    @Test void theReviewerListNamesFilesThatExist() {
        for (String name : REVIEWER_ONLY) assertThat(DIR.resolve(name)).as(name).exists();
        for (String name : PUBLIC_ADAPTERS) assertThat(DIR.resolve(name)).as(name).exists();
    }

    @Test void theGuardCatchesARawRead() {
        assertThat(readsStatusWithoutTheRule("SELECT bi.review FROM ops.batch_item bi WHERE bi.concept_id = :c")).isTrue();
        assertThat(readsStatusWithoutTheRule("SELECT " + "ReviewSql.publicLabelOf(" + "\"bp.concept_id\", mode) FROM ops.batch_item")).isFalse();
        assertThat(readsStatusWithoutTheRule("\"WITH \" + " + "ReviewSql.latest(" + "mode) + \" SELECT 1 FROM ops.batch_item\"")).isFalse();
        // statusOf alone no longer satisfies the guard: it is not the public rule
        assertThat(readsStatusWithoutTheRule("SELECT " + "ReviewSql.statusOf(" + "\"bp.concept_id\") FROM ops.batch_item")).isTrue();
        assertThat(writesItsOwnRule("WHERE l.review = 'ok' AND l.note IS NULL")).isTrue();
        assertThat(writesItsOwnRule("WHERE l.pub")).isFalse();
    }
}
