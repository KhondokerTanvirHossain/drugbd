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

    // ---- P1C: the senior role, dismissals (§5.2, D57) and carried approvals (§8.3.1 item 8)

    @Test void aSeniorOkApproves() {
        assertThat(ApprovalRule.review(List.of(d("ok", "senior", 1)), RUN)).contains("ok");
        assertThat(ApprovalRule.review(List.of(d("ok", "senior", 1), d("issue", "engineer", 2)), RUN)).contains("issue");
        assertThat(ApprovalRule.actsAsPharmacist("senior")).isTrue();
        assertThat(ApprovalRule.actsAsPharmacist("pharmacist")).isTrue();
        assertThat(ApprovalRule.actsAsPharmacist("engineer")).isFalse();
    }

    @Test void aCarriedApprovalWithNoLaterDecisionApprovesAndAnIssueAfterItIsAnIssue() {
        assertThat(ApprovalRule.review(List.of(), RUN, true)).contains("ok");
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1)), RUN, true)).contains("issue");
        // an engineer's check after a carried approval leaves it approved
        assertThat(ApprovalRule.review(List.of(d("ok", "engineer", 1)), RUN, true)).contains("ok");
        // a decision before the stamp is not the carried approval
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", -1)), RUN, true)).contains("ok");
    }

    @Test void aDismissalAfterAnIssueIsPendingEvenWhenAPharmacistApprovedBeforeTheIssue() {
        List<ReviewDecision> ds = List.of(d("ok", "pharmacist", 1), d("issue", "engineer", 2), d("dismiss", "senior", 3));
        assertThat(ApprovalRule.review(ds, RUN)).contains("pending");
        assertThat(ApprovalRule.displayStatus(ds, RUN, "pending")).isEqualTo("pending");
    }

    @Test void reviewIsPendingNeverEmptyWhenTheNewestDecisionIsADismissal() {
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2)), RUN)).contains("pending");
    }

    @Test void decisionsAtOrBeforeADismissalDoNotCount() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2), d("ok", "engineer", 3));
        assertThat(ApprovalRule.review(ds, RUN)).contains("pending");
        assertThat(ApprovalRule.displayStatus(ds, RUN, "pending")).isEqualTo("engineer_checked");
        // a senior approves again after the dismissal
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2), d("ok", "senior", 3)), RUN))
            .contains("ok");
    }

    @Test void aNewIssueAfterADismissalIsAnIssue() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2), d("issue", "engineer", 3));
        assertThat(ApprovalRule.review(ds, RUN)).contains("issue");
        assertThat(ApprovalRule.displayStatus(ds, RUN, "issue")).isEqualTo("issue");
    }

    @Test void aDismissalNeverShowsBackInReview() {
        // approved before the latest run, then an issue and its dismissal after it
        List<ReviewDecision> ds = List.of(d("ok", "pharmacist", -5), d("issue", "pharmacist", 1), d("dismiss", "senior", 2));
        assertThat(ApprovalRule.displayStatus(ds, RUN, "pending")).isEqualTo("pending");
    }

    @Test void aDismissalUndoesACarriedApprovalToo() {
        assertThat(ApprovalRule.review(List.of(d("issue", "pharmacist", 1), d("dismiss", "senior", 2)), RUN, true)).contains("pending");
    }

    @Test void aDismissalBeforeTheRunStampIsForgottenLikeAnyDecision() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", -9), d("dismiss", "senior", -8), d("issue", "engineer", 1));
        assertThat(ApprovalRule.review(ds, RUN)).contains("issue");
    }

    @Test void openIssuesAreTheCountedIssuesAfterTheLatestDismissal() {
        List<ReviewDecision> ds = List.of(d("issue", "pharmacist", -3), d("issue", "engineer", 1), d("dismiss", "senior", 2),
            d("issue", "senior", 3), d("issue", "pharmacist", 4));
        assertThat(ApprovalRule.openIssues(ds, RUN)).extracting(ReviewDecision::reviewerRole).containsExactly("senior", "pharmacist");
        assertThat(ApprovalRule.openIssues(List.of(d("issue", "engineer", 1)), RUN)).hasSize(1);
        assertThat(ApprovalRule.openIssues(List.of(d("issue", "engineer", 1), d("dismiss", "senior", 2)), RUN)).isEmpty();
    }

    @Test void latestApprovalIsTheLastCountedPharmacistOrSeniorOk() {
        // an ok before the run stamp and one before a dismissal are ignored; an engineer ok is ignored; the last senior ok wins
        List<ReviewDecision> ds = List.of(d("ok", "pharmacist", -5), d("ok", "pharmacist", 1), d("dismiss", "senior", 2),
            d("ok", "pharmacist", 3), d("ok", "senior", 4), d("ok", "engineer", 5));
        assertThat(ApprovalRule.latestApproval(ds, RUN)).contains(RUN.plusSeconds(60L * 4));
        // nothing counts: empty
        assertThat(ApprovalRule.latestApproval(List.of(), RUN)).isEmpty();
        assertThat(ApprovalRule.latestApproval(List.of(d("ok", "pharmacist", -1)), RUN)).isEmpty();
        assertThat(ApprovalRule.latestApproval(List.of(d("ok", "pharmacist", 1), d("dismiss", "senior", 2)), RUN)).isEmpty();
        assertThat(ApprovalRule.latestApproval(List.of(d("ok", "engineer", 1)), RUN)).isEmpty();
    }
}
