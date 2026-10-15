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
 * §7.4 PO D7, §11.3: every public adapter reads a product's status through ReviewSql.statusOf or ReviewSql.LATEST_PUBLIC,
 * the one rule (a latest item marked "removed from batch file" is never public). Reviewer adapters read batch items
 * directly and are listed by name, so a new adapter must either use the rule or be added here in review.
 */
class PublicStatusGuardTest {
    static final Path DIR = Path.of("src/main/java/com/niramoy/bddrug/adapter/persistence");
    static final Set<String> REVIEWER_ONLY = Set.of("R2dbcReviewAdapter.java", "R2dbcReviewQueryAdapter.java", "R2dbcBatchAdapter.java",
        "R2dbcSeniorReviewAdapter.java", "R2dbcFlagAdapter.java", "R2dbcAuditAdapter.java", "ReviewSql.java", "PairReviewReader.java");

    static boolean readsStatusWithoutTheRule(String source) {
        return source.contains("batch_item") && !source.contains("ReviewSql.statusOf(") && !source.contains("ReviewSql.LATEST_PUBLIC");
    }

    @Test void everyPublicAdapterReadsStatusThroughTheOneRule() throws IOException {
        List<String> offenders = new ArrayList<>(), ruled = new ArrayList<>();
        try (Stream<Path> files = Files.list(DIR)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".java")).sorted().toList()) {
                String name = f.getFileName().toString(), src = Files.readString(f);
                if (REVIEWER_ONLY.contains(name)) continue;
                if (readsStatusWithoutTheRule(src)) offenders.add(name);
                if (src.contains("ReviewSql.statusOf(") || src.contains("ReviewSql.LATEST_PUBLIC")) ruled.add(name);
            }
        }
        assertThat(offenders).isEmpty();
        assertThat(ruled).contains("R2dbcProductAdapter.java", "R2dbcSubstanceAdapter.java", "R2dbcCheckAdapter.java", "R2dbcStatsAdapter.java");
    }

    @Test void theReviewerListNamesFilesThatExist() {
        for (String name : REVIEWER_ONLY) assertThat(DIR.resolve(name)).as(name).exists();
    }

    @Test void theGuardCatchesARawRead() {
        assertThat(readsStatusWithoutTheRule("SELECT bi.review FROM ops.batch_item bi WHERE bi.concept_id = :c")).isTrue();
        assertThat(readsStatusWithoutTheRule("SELECT " + "ReviewSql.statusOf(" + "\"bp.concept_id\") FROM ops.batch_item")).isFalse();
    }
}
