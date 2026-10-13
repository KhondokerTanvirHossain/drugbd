package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * The approval rule for one batch record. Only decisions made after the record's latest pipeline run
 * ({@code extracted_at}) count; older ones stay in the history but no longer decide anything.
 * <ul>
 *   <li>{@code issue} when the latest counted decision is an issue;</li>
 *   <li>{@code ok} when a pharmacist recorded ok and no issue came after that ok;</li>
 *   <li>{@code pending} otherwise (an engineer's ok alone never approves).</li>
 * </ul>
 * No counted decision at all gives empty: the pipeline's own value (pending, or issue with its reason) stays.
 * {@link #displayStatus} is the five-state status reviewers see (spec §5.2), computed once, here.
 */
public final class ApprovalRule {
    private ApprovalRule() {}
    public static final String OK = "ok", ISSUE = "issue", PENDING = "pending", PHARMACIST = "pharmacist", ENGINEER = "engineer";
    public static final String APPROVED = "approved", ENGINEER_CHECKED = "engineer_checked", BACK_IN_REVIEW = "back_in_review";

    private static final Comparator<ReviewDecision> CHRONOLOGICAL =
        Comparator.comparing(ReviewDecision::decidedAt).thenComparingLong(ReviewDecision::id);

    /** A decision counts when it was made after the latest run; without a run stamp every decision counts. */
    private static boolean counts(ReviewDecision d, Instant extractedAt) {
        return extractedAt == null || d.decidedAt().isAfter(extractedAt);
    }

    /** The counted decisions, oldest first (time, then id). The one definition both rules below use. */
    private static List<ReviewDecision> counted(List<ReviewDecision> decisions, Instant extractedAt) {
        return decisions.stream().filter(d -> counts(d, extractedAt)).sorted(CHRONOLOGICAL).toList();
    }

    public static Optional<String> review(List<ReviewDecision> decisions, Instant extractedAt) {
        List<ReviewDecision> counted = counted(decisions, extractedAt);
        if (counted.isEmpty()) return Optional.empty();
        if (ISSUE.equals(counted.get(counted.size() - 1).decision())) return Optional.of(ISSUE);
        int lastPharmacistOk = -1;
        for (int i = 0; i < counted.size(); i++)
            if (OK.equals(counted.get(i).decision()) && PHARMACIST.equals(counted.get(i).reviewerRole())) lastPharmacistOk = i;
        if (lastPharmacistOk < 0) return Optional.of(PENDING);
        for (int i = lastPharmacistOk + 1; i < counted.size(); i++)
            if (ISSUE.equals(counted.get(i).decision())) return Optional.of(PENDING);
        return Optional.of(OK);
    }

    /**
     * Spec §5.2, in this order of precedence. {@code review} is the item's stored {@code batch_item.review}.
     * <ol>
     *   <li>{@code issue}: review is issue and the counted decisions contain an issue (the pipeline's own issue,
     *       "not found at source", has none and falls through to pending);</li>
     *   <li>{@code approved}: review is ok;</li>
     *   <li>{@code engineer_checked}: review is pending and a counted engineer ok has no issue after it;</li>
     *   <li>{@code back_in_review}: review is pending, nothing counted, and the decisions at or before the run
     *       stamp had approved it;</li>
     *   <li>{@code pending}: everything else.</li>
     * </ol>
     */
    public static String displayStatus(List<ReviewDecision> decisions, Instant extractedAt, String review) {
        List<ReviewDecision> counted = counted(decisions, extractedAt);
        if (ISSUE.equals(review) && counted.stream().anyMatch(d -> ISSUE.equals(d.decision()))) return ISSUE;
        if (OK.equals(review)) return APPROVED;
        if (PENDING.equals(review)) {
            int lastIssue = -1;
            for (int i = 0; i < counted.size(); i++) if (ISSUE.equals(counted.get(i).decision())) lastIssue = i;
            for (int i = lastIssue + 1; i < counted.size(); i++)
                if (OK.equals(counted.get(i).decision()) && ENGINEER.equals(counted.get(i).reviewerRole())) return ENGINEER_CHECKED;
            if (counted.isEmpty() && extractedAt != null) {
                List<ReviewDecision> before = decisions.stream().filter(d -> !counts(d, extractedAt)).toList();
                if (review(before, null).filter(OK::equals).isPresent()) return BACK_IN_REVIEW;
            }
        }
        return PENDING;
    }
}
