package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairQueue;
import com.niramoy.bddrug.domain.PairQueue.Entry;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.17.1: filters, counts that follow the scope, and the order (severity, applying first, state, names). */
class PairQueueTest {
    static Entry e(String a, String b, String severity, String nameA, String nameB, boolean applies, String state) {
        return new Entry(a, b, severity, "BDS-" + a, nameA, "BDS-" + b, nameB, applies, state);
    }

    static final List<Entry> ALL = List.of(
        e("DDInter1951", "DDInter351", "moderate", "Warfarin", "Chloramphenicol", false, "not_reviewed"),
        e("DDInter14", "DDInter1951", "moderate", "Acetaminophen", "Warfarin", true, "reviewed"),
        e("DDInter1951", "DDInter20", "major", "Warfarin", "Aspirin", true, "changed"),
        e("DDInter20", "DDInter83", "moderate", "Aspirin", "Amoxicillin", true, "issue"),
        e("DDInter1951", "DDInter5", "weird", "Warfarin", "Alpha", true, "not_reviewed"),
        e("DDInter1951", "DDInter999", "minor", "Warfarin", "Herb", true, "not_reviewed"));

    @Test void theOrderIsSeverityThenApplyingThenStateThenNames() {
        assertThat(PairQueue.select(ALL, "all", "all", null)).extracting(Entry::ddinterB).containsExactly(
            "DDInter20", "DDInter83", "DDInter1951", "DDInter351", "DDInter999", "DDInter5");
    }

    @Test void todoIsNotReviewedAndChanged() {
        assertThat(PairQueue.select(ALL, "todo", "all", null)).extracting(Entry::ddinterB)
            .containsExactly("DDInter20", "DDInter351", "DDInter999", "DDInter5");
        assertThat(PairQueue.select(ALL, "issue", "all", null)).extracting(Entry::ddinterB).containsExactly("DDInter83");
        assertThat(PairQueue.select(ALL, "reviewed", "all", null)).extracting(Entry::ddinterB).containsExactly("DDInter1951");
        assertThat(PairQueue.select(ALL, "changed", "all", null)).extracting(Entry::ddinterB).containsExactly("DDInter20");
    }

    @Test void theScopeHidesNonApplyingPairsAndTheCountsFollowIt() {
        assertThat(PairQueue.select(ALL, "all", "applies", null)).extracting(Entry::ddinterB).doesNotContain("DDInter351");
        assertThat(PairQueue.counts(ALL, "all")).containsExactly(java.util.Map.entry("todo", 4), java.util.Map.entry("changed", 1),
            java.util.Map.entry("issue", 1), java.util.Map.entry("reviewed", 1), java.util.Map.entry("all", 6));
        assertThat(PairQueue.counts(ALL, "applies").get("todo")).isEqualTo(3);
        assertThat(PairQueue.counts(ALL, "applies").get("all")).isEqualTo(5);
    }

    @Test void anyOtherSeverityIsUnknownAndNeverMinor() {
        assertThat(PairQueue.select(ALL, "all", "all", "unknown")).extracting(Entry::ddinterB).containsExactly("DDInter5");
        assertThat(PairQueue.select(ALL, "all", "all", "minor")).extracting(Entry::ddinterB).containsExactly("DDInter999");
        assertThat(PairQueue.severityOf("weird")).isEqualTo("unknown");
    }
}
