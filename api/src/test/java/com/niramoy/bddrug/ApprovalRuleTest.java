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

    // ---- displayStatus (spec §5.2): five states, in this order of precedence

    @Test void displayStatusIsPendingWithoutDecisions() {
        assertThat(ApprovalRule.displayStatus(List.of(), RUN, "pending")).isEqualTo("pending");
    }

    @Test void displayStatusIsApprovedWhenTheItemIsOk() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", 1)), RUN, "ok")).isEqualTo("approved");
    }

    @Test void displayStatusIsEngineerCheckedForACountedEngineerOkWithNoIssueAfterIt() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", 1)), RUN, "pending")).isEqualTo("engineer_checked");
        // an engineer ok before the run does not count
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", -1)), RUN, "pending")).isEqualTo("pending");
    }

    @Test void displayStatusIsIssueOnlyForACountedIssueDecision() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", 1), d("issue", "pharmacist", 2)), RUN, "issue"))
            .isEqualTo("issue");
        // the pipeline's own issue ("not found at source") has no decision: it is pending, with its failed check
        assertThat(ApprovalRule.displayStatus(List.of(), RUN, "issue")).isEqualTo("pending");
    }

    @Test void displayStatusIsBackInReviewWhenTheRecordWasApprovedBeforeItsLatestExtraction() {
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", -5)), RUN, "pending")).isEqualTo("back_in_review");
        // an engineer check before the run is not an approval; an issue fixed and re-run returns to pending
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "engineer", -5)), RUN, "pending")).isEqualTo("pending");
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", -9), d("issue", "pharmacist", -5)), RUN, "pending"))
            .isEqualTo("pending");
        // without a run stamp nothing is "before" it
        assertThat(ApprovalRule.displayStatus(List.of(d("ok", "pharmacist", -5)), null, "pending")).isEqualTo("pending");
    }
}
