package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * The decision guards of spec §7.2, steps 2 to 8, as one pure function (step 1, requestId idempotency, needs the audit
 * table and lives in the adapter). The first failing step wins. An {@code issue} passes every step after step 4: a
 * reviewer can always report a problem on a current, non-removed record, even one whose checks failed.
 */
public final class DecisionGuard {
    private DecisionGuard() {}

    /** The four pipeline checks; the same list the batch report orders its stages by. */
    public static final List<String> STAGES = BatchReport.STAGE_ORDER;
    /** The note the ETL writes on an item dropped from the batch file (a cross-component contract with the ETL). */
    public static final String REMOVED_NOTE = "removed from batch file";

    public static final String STALE_RUN = "This record was re-run after the page was loaded; reload it and review again";
    public static final String OTHER_REVIEWER =
        "Another reviewer decided on this record after the page was loaded; reload it and review again";
    public static final String REMOVED = "This record was removed from the batch file";
    public static final String CHECK_FAILED = "A check failed on this record. It returns to review after the fix and re-run.";
    public static final String ISSUE_OPEN = "An issue is open on this record. It returns to review after the fix and re-run.";
    public static final String ALREADY_APPROVED = "This record is already approved by a pharmacist";
    public static final String ALREADY_CHECKED = "Your check is already recorded for this record";

    /** The locked item as the decision transaction sees it; {@code stages} maps a stage name to its status. */
    public record Item(Instant extractedAt, Long lastDecisionId, String review, String note,
                       Map<String, String> stages, String displayStatus) {}
    /** What the reviewer sent: the decision, their role, and the version their page showed. */
    public record Attempt(String decision, String reviewerRole, Instant expectedExtractedAt, Long expectedLastDecisionId) {}
    /** A refused decision: the error's {@code field} and message (409 CONFLICT). */
    public record Refusal(String field, String message) {}

    public static Optional<Refusal> check(Item item, Attempt a) {
        if (!Objects.equals(a.expectedExtractedAt(), item.extractedAt())) return refuse("extractedAt", STALE_RUN);
        if (!Objects.equals(a.expectedLastDecisionId(), item.lastDecisionId())) return refuse("lastDecisionId", OTHER_REVIEWER);
        if (REMOVED_NOTE.equals(item.note())) return refuse("conceptId", REMOVED);
        if (!ApprovalRule.OK.equals(a.decision())) return Optional.empty();
        boolean checksFailed = item.extractedAt() == null || STAGES.stream()
            .anyMatch(s -> !item.stages().containsKey(s) || "fail".equals(item.stages().get(s)));
        if (checksFailed) return refuse("stages", CHECK_FAILED);
        if (ApprovalRule.ISSUE.equals(item.review())) return refuse("review", ISSUE_OPEN);
        if (ApprovalRule.OK.equals(item.review())) return refuse("review", ALREADY_APPROVED);
        if (ApprovalRule.ENGINEER.equals(a.reviewerRole()) && ApprovalRule.ENGINEER_CHECKED.equals(item.displayStatus()))
            return refuse("review", ALREADY_CHECKED);
        return Optional.empty();
    }

    private static Optional<Refusal> refuse(String field, String message) {
        return Optional.of(new Refusal(field, message));
    }
}
