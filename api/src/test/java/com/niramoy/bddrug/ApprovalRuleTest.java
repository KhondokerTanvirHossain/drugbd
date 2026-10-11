package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;

class ApprovalRuleTest {
    static final Instant RUN = Instant.parse("2026-10-12T10:00:00Z");
    private long nextId = 1;

    private ReviewDecision d(String decision, String role, int minutesAfterRun) {
        return new ReviewDecision(nextId++, decision, "", "r@example.org", role, RUN.plusSeconds(60L * minutesAfterRun));
    }

    @Test void noDecisionsSinceTheRunLeavesThePipelineValue() {
        assertThat(ApprovalRule.review(List.of(), RUN)).isEmpty();
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", -5)), RUN)).isEmpty();
    }

    @Test void engineerOkAloneDoesNotApprove() {
        assertThat(ApprovalRule.review(List.of(d("ok", "engineer", 1)), RUN)).contains("pending");
    }

    @Test void pharmacistOkApproves() {
        assertThat(ApprovalRule.review(List.of(d("ok", "engineer", 1), d("ok", "pharmacist", 2)), RUN)).contains("ok");
    }

    @Test void issueAfterOkIsIssue() {
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2)), RUN)).contains("issue");
    }

    @Test void okAfterIssueNeedsAPharmacist() {
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2), d("ok", "engineer", 3)), RUN))
            .contains("pending");
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2), d("ok", "pharmacist", 3)), RUN))
            .contains("ok");
    }

    @Test void decisionsBeforeTheRunDoNotCount() {
        // Review Focus 3: a pharmacist ok before the latest run no longer approves; an engineer ok after it doesn't either.
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", -10), d("ok", "engineer", 1)), RUN)).contains("pending");
        // a decision stamped exactly at the run time saw the old data
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", 0)), RUN)).isEmpty();
        // an issue before the run is forgotten too
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", -10), d("ok", "pharmacist", 1)), RUN)).contains("ok");
    }

    @Test void orderIsByTimeThenIdWhateverTheInputOrder() {
        List<ReviewDecision> list = new ArrayList<>(List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2)));
        java.util.Collections.reverse(list);
        assertThat(ApprovalRule.review(list, RUN)).contains("issue");
        ReviewDecision first = new ReviewDecision(1, "issue", "x", "a@b", "engineer", RUN.plusSeconds(60));
        ReviewDecision second = new ReviewDecision(2, "ok", "", "a@b", "pharmacist", RUN.plusSeconds(60));
        assertThat(ApprovalRule.review(List.of(second, first), RUN)).contains("ok");
    }

    @Test void itemWithoutExtractedAtCountsEveryDecision() {
        assertThat(ApprovalRule.review(List.of(d("ok", "pharmacist", -100)), null)).contains("ok");
        assertThat(ApprovalRule.review(List.of(), null)).isEqualTo(Optional.empty());
    }
}
