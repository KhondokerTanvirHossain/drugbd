package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.ReviewTriage;
import com.niramoy.bddrug.domain.ReviewTriage.Facts;
import com.niramoy.bddrug.domain.ReviewTriage.Hint;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §5.3 filters and §5.4 hints, checked against the expected pilot triage after the route fix (§1.6 item 7). */
class ReviewTriageTest {
    static Map<String, String> stages(String ddinter) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("dgda", "ok"); m.put("substances", "ok"); m.put("clinical", "ok"); m.put("ddinter", ddinter);
        return m;
    }
    static Facts pending(String ddinter, int pairs, String... coverages) {
        return new Facts("pending", stages(ddinter), pairs, List.of(coverages));
    }

    /** The 10 pilot records after the P0 re-run, in DAR order. */
    static final List<Facts> PILOT = List.of(
        pending("warn", 4, "full"),          // Amlodipine-5
        pending("warn", 5, "full"),          // Aspirin
        pending("warn", 4, "full"),          // Simvastatin
        pending("ok", 0, "full"),            // Chloramphenicol eye drops
        pending("warn", 0, "none"),          // Domperidone
        pending("warn", 1, "full"),          // G Warfarin
        pending("warn", 5, "full"),          // G-Metformin
        pending("warn", 6, "full"),          // Napa
        pending("warn", 2, "full"),          // Clarith
        pending("warn", 5, "full", "full")); // Amoxycillin Clavulanic Acid

    @Test void thePilotTriageMatchesTheSpec() {
        assertThat(PILOT.stream().map(ReviewTriage::hint).toList()).containsExactly(
            new Hint(0, 1, 4, false, false), new Hint(0, 1, 5, false, false), new Hint(0, 1, 4, false, false),
            new Hint(0, 0, 0, false, false), new Hint(0, 1, 0, true, false), new Hint(0, 1, 1, false, false),
            new Hint(0, 1, 5, false, false), new Hint(0, 1, 6, false, false), new Hint(0, 1, 2, false, false),
            new Hint(0, 1, 5, false, false));
        Map<String, Integer> counts = ReviewTriage.filterCounts(PILOT);
        assertThat(counts.keySet()).containsExactly("all", "needs", "warn", "issue", "approved", "nodata");
        assertThat(counts).containsEntry("all", 10).containsEntry("needs", 10).containsEntry("warn", 9)
            .containsEntry("issue", 0).containsEntry("approved", 0).containsEntry("nodata", 1);
    }

    @Test void needsReviewIsPendingBackInReviewOrEngineerChecked() {
        for (String s : List.of("pending", "back_in_review", "engineer_checked")) assertThat(ReviewTriage.needsReview(s)).isTrue();
        for (String s : List.of("approved", "issue")) assertThat(ReviewTriage.needsReview(s)).isFalse();
    }

    @Test void filtersFollowTheTable() {
        Facts approved = new Facts("approved", stages("ok"), 0, List.of("full"));
        Facts issue = new Facts("issue", stages("ok"), 0, List.of("full"));
        Facts missingStage = new Facts("pending", Map.of("dgda", "ok"), 0, List.of());
        Facts notRun = pending("ok", 0, "not_run");
        assertThat(ReviewTriage.inFilter("approved", approved)).isTrue();
        assertThat(ReviewTriage.inFilter("needs", approved)).isFalse();
        assertThat(ReviewTriage.inFilter("issue", issue)).isTrue();
        assertThat(ReviewTriage.inFilter("warn", missingStage)).as("a stage with no result is not OK").isTrue();
        assertThat(ReviewTriage.inFilter("nodata", notRun)).as("not_run is never no-data").isFalse();
        assertThat(ReviewTriage.hint(notRun)).isEqualTo(new Hint(0, 0, 0, false, true));
        assertThat(ReviewTriage.inFilter("all", issue)).isTrue();
    }

    @Test void failedAndWarningStagesAreCountedSeparately() {
        Map<String, String> s = new LinkedHashMap<>(stages("warn"));
        s.put("dgda", "fail");
        s.put("clinical", "fail");
        assertThat(ReviewTriage.hint(new Facts("pending", s, 3, new ArrayList<>(List.of("full")))))
            .isEqualTo(new Hint(2, 1, 3, false, false));
    }

    @Test void aStageWithNoResultCountsAsFailedNeverAllOk() {
        // Same rule as hasWarning, the Failed row in "Automated checks" and DecisionGuard step 5: a missing stage blocks.
        assertThat(ReviewTriage.hint(new Facts("pending", Map.of("dgda", "ok"), 0, List.of())))
            .isEqualTo(new Hint(3, 0, 0, false, false));
    }
}
