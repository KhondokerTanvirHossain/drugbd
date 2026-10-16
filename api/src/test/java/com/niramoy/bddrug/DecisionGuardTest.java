package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.DecisionGuard;
import com.niramoy.bddrug.domain.DecisionGuard.Attempt;
import com.niramoy.bddrug.domain.DecisionGuard.Item;
import com.niramoy.bddrug.domain.DecisionGuard.Refusal;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.2, steps 2 to 8, in order. */
class DecisionGuardTest {
    static final Instant RUN = Instant.parse("2026-10-12T10:00:00Z");
    static final Map<String, String> ALL_RAN = Map.of("dgda", "ok", "substances", "ok", "clinical", "warn", "ddinter", "warn");

    static Item item(String review, String note, Map<String, String> stages, String display) {
        return new Item(RUN, 7L, review, note, stages, display);
    }
    static Item pending() { return item("pending", null, ALL_RAN, "pending"); }
    static Attempt ok(String role) { return new Attempt("ok", role, RUN, 7L); }
    static Attempt issue() { return new Attempt("issue", "pharmacist", RUN, 7L); }
    static Optional<Refusal> refused(String field, String message) { return Optional.of(new Refusal(field, message)); }

    @Test void aCurrentRecordWithEveryCheckRunTakesEitherDecision() {
        assertThat(DecisionGuard.check(pending(), ok("pharmacist"))).isEmpty();
        assertThat(DecisionGuard.check(pending(), ok("engineer"))).isEmpty();
        assertThat(DecisionGuard.check(pending(), issue())).isEmpty();
    }

    @Test void step2AStaleRunStampIsRefusedFirst() {
        Item removedAndFailed = item("issue", "removed from batch file", Map.of(), "issue");
        assertThat(DecisionGuard.check(removedAndFailed, new Attempt("ok", "pharmacist", RUN.minusSeconds(1), 7L)))
            .isEqualTo(refused("extractedAt", DecisionGuard.STALE_RUN));
        // null = null matches; null against a stamp does not
        assertThat(DecisionGuard.check(pending(), new Attempt("issue", "pharmacist", null, 7L)))
            .isEqualTo(refused("extractedAt", DecisionGuard.STALE_RUN));
        assertThat(DecisionGuard.check(new Item(null, 7L, "pending", null, ALL_RAN, "pending"),
                                       new Attempt("issue", "pharmacist", null, 7L))).isEmpty();
    }

    @Test void step3AnotherReviewersDecisionIsRefused() {
        assertThat(DecisionGuard.check(pending(), new Attempt("ok", "pharmacist", RUN, 6L)))
            .isEqualTo(refused("lastDecisionId",
                "Another reviewer decided on this record after the page was loaded; reload it and review again"));
        assertThat(DecisionGuard.check(pending(), new Attempt("issue", "pharmacist", RUN, null)))
            .isEqualTo(refused("lastDecisionId", DecisionGuard.OTHER_REVIEWER));
        assertThat(DecisionGuard.check(new Item(RUN, null, "pending", null, ALL_RAN, "pending"),
                                       new Attempt("ok", "pharmacist", RUN, null))).isEmpty();
    }

    @Test void step4ARemovedRecordRefusesBothDecisions() {
        Item removed = item("pending", "removed from batch file", ALL_RAN, "pending");
        assertThat(DecisionGuard.check(removed, ok("pharmacist")))
            .isEqualTo(refused("conceptId", "This record was removed from the batch file"));
        assertThat(DecisionGuard.check(removed, issue())).isEqualTo(refused("conceptId", DecisionGuard.REMOVED));
    }

    @Test void step5OkNeedsAllFourChecksRunWithoutAFailureAndARunStamp() {
        String failed = "A check failed on this record. It returns to review after the fix and re-run.";
        Map<String, String> missingDdinter = new HashMap<>(ALL_RAN);
        missingDdinter.remove("ddinter");
        Map<String, String> dgdaFailed = new HashMap<>(ALL_RAN);
        dgdaFailed.put("dgda", "fail");
        for (Map<String, String> stages : java.util.List.of(missingDdinter, dgdaFailed, Map.<String, String>of())) {
            assertThat(DecisionGuard.check(item("pending", null, stages, "pending"), ok("pharmacist")))
                .isEqualTo(refused("stages", failed));
            assertThat(DecisionGuard.check(item("pending", null, stages, "pending"), issue())).isEmpty();
        }
        Item noStamp = new Item(null, 7L, "pending", null, ALL_RAN, "pending");
        assertThat(DecisionGuard.check(noStamp, new Attempt("ok", "pharmacist", null, 7L))).isEqualTo(refused("stages", failed));
        // the pipeline's own issue (not found at source) fails at step 5, before the issue guard
        Item pipelineIssue = item("issue", "not found at source", Map.of("dgda", "fail"), "pending");
        assertThat(DecisionGuard.check(pipelineIssue, ok("pharmacist"))).isEqualTo(refused("stages", failed));
    }

    @Test void step6OkWhileAnIssueIsOpenIsRefused() {
        // replaces ApprovalRuleTest.okAfterIssueNeedsAPharmacist: an ok can no longer clear an open issue
        Item open = item("issue", null, ALL_RAN, "issue");
        String msg = "An issue is open on this record. It returns to review after the fix and re-run.";
        assertThat(DecisionGuard.check(open, ok("pharmacist"))).isEqualTo(refused("review", msg));
        assertThat(DecisionGuard.check(open, ok("engineer"))).isEqualTo(refused("review", msg));
        assertThat(DecisionGuard.check(open, issue())).isEmpty();
    }

    @Test void step7AnApprovedRecordRefusesAnotherOk() {
        Item approved = item("ok", null, ALL_RAN, "approved");
        assertThat(DecisionGuard.check(approved, ok("pharmacist")))
            .isEqualTo(refused("review", "This record is already approved by a pharmacist"));
        assertThat(DecisionGuard.check(approved, ok("engineer"))).isEqualTo(refused("review", DecisionGuard.ALREADY_APPROVED));
        assertThat(DecisionGuard.check(approved, issue())).isEmpty();
    }

    @Test void step8ASecondEngineerCheckIsRefusedButAPharmacistMayApprove() {
        Item checked = item("pending", null, ALL_RAN, "engineer_checked");
        assertThat(DecisionGuard.check(checked, ok("engineer")))
            .isEqualTo(refused("review", "Your check is already recorded for this record"));
        assertThat(DecisionGuard.check(checked, ok("pharmacist"))).isEmpty();
    }

    // ---- P1C step 6d: a dismissal needs an open reviewer issue; steps 5-8 never apply to it (§7.2)

    static Attempt dismiss() { return new Attempt("dismiss", "senior", RUN, 7L); }

    @Test void aDismissalOfAnOpenIssuePassesEvenWithAFailedCheck() {
        Map<String, String> failed = new HashMap<>(ALL_RAN);
        failed.put("dgda", "fail");
        assertThat(DecisionGuard.check(item("issue", null, ALL_RAN, "issue"), dismiss())).isEmpty();
        assertThat(DecisionGuard.check(item("issue", null, failed, "issue"), dismiss())).isEmpty();
    }

    @Test void aDismissalWithoutAnOpenReviewerIssueIsRefusedOnReview() {
        assertThat(DecisionGuard.check(pending(), dismiss())).isEqualTo(refused("review", DecisionGuard.NO_ISSUE));
        assertThat(DecisionGuard.check(item("ok", null, ALL_RAN, "approved"), dismiss())).isEqualTo(refused("review", DecisionGuard.NO_ISSUE));
        // the pipeline's own issue ("not found at source") has display status pending: only a re-run clears it
        assertThat(DecisionGuard.check(item("issue", "not found at source", Map.of("dgda", "fail"), "pending"), dismiss()))
            .isEqualTo(refused("review", DecisionGuard.NO_ISSUE));
    }

    @Test void aDismissalStillMeetsStepsTwoToFourFirst() {
        assertThat(DecisionGuard.check(item("issue", null, ALL_RAN, "issue"), new Attempt("dismiss", "senior", RUN.minusSeconds(1), 7L)))
            .isEqualTo(refused("extractedAt", DecisionGuard.STALE_RUN));
        assertThat(DecisionGuard.check(item("issue", null, ALL_RAN, "issue"), new Attempt("dismiss", "senior", RUN, 6L)))
            .isEqualTo(refused("lastDecisionId", DecisionGuard.OTHER_REVIEWER));
        assertThat(DecisionGuard.check(item("issue", "removed from batch file", ALL_RAN, "issue"), dismiss()))
            .isEqualTo(refused("conceptId", DecisionGuard.REMOVED));
    }

    @Test void aSeniorOkMeetsThePharmacistGuards() {
        assertThat(DecisionGuard.check(pending(), ok("senior"))).isEmpty();
        assertThat(DecisionGuard.check(item("ok", null, ALL_RAN, "approved"), ok("senior")))
            .isEqualTo(refused("review", DecisionGuard.ALREADY_APPROVED));
        // step 8 stays engineer-only
        assertThat(DecisionGuard.check(item("pending", null, ALL_RAN, "engineer_checked"), ok("senior"))).isEmpty();
    }
}
