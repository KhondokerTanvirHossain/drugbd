package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * The approval rule for one batch record. Only decisions made after the record's latest pipeline run
 * ({@code extracted_at}) count, and only those after the latest dismissal made since that run (spec §5.2, D57): a
 * dismissal is a review boundary like a re-run stamp. Older decisions stay in the history but decide nothing.
 * <ul>
 *   <li>{@code issue} when the latest counted decision is an issue;</li>
 *   <li>{@code ok} when a pharmacist or senior pharmacist recorded ok and no issue came after that ok (a carried approval,
 *       §8.3.1 item 8, counts as such an ok at the stamp, unless a dismissal came since);</li>
 *   <li>{@code pending} otherwise (an engineer's ok alone never approves), and whenever the newest decision since the
 *       stamp is a dismissal.</li>
 * </ul>
 * No counted decision, no dismissal and no carried approval gives empty: the pipeline's own value stays.
 * {@link #displayStatus} is the five-state status reviewers see (spec §5.2), computed once, here.
 */
public final class ApprovalRule {
    private ApprovalRule() {}
    public static final String OK = "ok", ISSUE = "issue", PENDING = "pending", PHARMACIST = "pharmacist", ENGINEER = "engineer";
    public static final String SENIOR = "senior", DISMISS = "dismiss";
    public static final String APPROVED = "approved", ENGINEER_CHECKED = "engineer_checked", BACK_IN_REVIEW = "back_in_review";

    private static final Comparator<ReviewDecision> CHRONOLOGICAL =
        Comparator.comparing(ReviewDecision::decidedAt).thenComparingLong(ReviewDecision::id);

    /** The one test for pharmacist powers (§5.13): a senior pharmacist is a pharmacist. */
    public static boolean actsAsPharmacist(String role) {
        return PHARMACIST.equals(role) || SENIOR.equals(role);
    }

    /** A decision counts when it was made after the latest run; without a run stamp every decision counts. */
    private static boolean counts(ReviewDecision d, Instant extractedAt) {
        return extractedAt == null || d.decidedAt().isAfter(extractedAt);
    }

    /** The decisions since the run stamp, oldest first (time, then id). */
    private static List<ReviewDecision> sinceStamp(List<ReviewDecision> decisions, Instant extractedAt) {
        return decisions.stream().filter(d -> counts(d, extractedAt)).sorted(CHRONOLOGICAL).toList();
    }

    private static int lastDismissal(List<ReviewDecision> since) {
        for (int i = since.size() - 1; i >= 0; i--) if (DISMISS.equals(since.get(i).decision())) return i;
        return -1;
    }

    /** The counted decisions: those since the stamp and after its latest dismissal, oldest first. */
    private static List<ReviewDecision> counted(List<ReviewDecision> decisions, Instant extractedAt) {
        List<ReviewDecision> since = sinceStamp(decisions, extractedAt);
        int last = lastDismissal(since);
        return last < 0 ? since : since.subList(last + 1, since.size());
    }

    public static Optional<String> review(List<ReviewDecision> decisions, Instant extractedAt) {
        return review(decisions, extractedAt, false);
    }

    /** {@code carried}: the item's stamp carried an approval from another batch (§8.3.1 item 8). */
    public static Optional<String> review(List<ReviewDecision> decisions, Instant extractedAt, boolean carried) {
        boolean dismissed = lastDismissal(sinceStamp(decisions, extractedAt)) >= 0;
        List<ReviewDecision> counted = counted(decisions, extractedAt);
        boolean carriedCounts = carried && !dismissed;
        if (counted.isEmpty())
            return dismissed ? Optional.of(PENDING) : carriedCounts ? Optional.of(OK) : Optional.empty();
        if (ISSUE.equals(counted.get(counted.size() - 1).decision())) return Optional.of(ISSUE);
        int lastApproval = carriedCounts ? 0 : -1;   // 1-based position in counted; 0 is the carried approval at the stamp
        for (int i = 0; i < counted.size(); i++)
            if (OK.equals(counted.get(i).decision()) && actsAsPharmacist(counted.get(i).reviewerRole())) lastApproval = i + 1;
        if (lastApproval < 0) return Optional.of(PENDING);
        for (int i = lastApproval; i < counted.size(); i++)
            if (ISSUE.equals(counted.get(i).decision())) return Optional.of(PENDING);
        return Optional.of(OK);
    }

    /**
     * Spec §5.2, in this order of precedence. {@code review} is the item's stored {@code batch_item.review}. "Counted"
     * means decided after max(the run stamp, the latest dismissal since it).
     * <ol>
     *   <li>{@code issue}: review is issue and the counted decisions contain an issue (the pipeline's own issue,
     *       "not found at source", has none and falls through to pending);</li>
     *   <li>{@code approved}: review is ok;</li>
     *   <li>{@code engineer_checked}: review is pending and a counted engineer ok has no issue after it;</li>
     *   <li>{@code back_in_review}: review is pending, nothing counted, no dismissal since the stamp, and the decisions
     *       at or before the run stamp had approved it;</li>
     *   <li>{@code pending}: everything else.</li>
     * </ol>
     */
    public static String displayStatus(List<ReviewDecision> decisions, Instant extractedAt, String review) {
        List<ReviewDecision> counted = counted(decisions, extractedAt);
        boolean dismissed = lastDismissal(sinceStamp(decisions, extractedAt)) >= 0;
        if (ISSUE.equals(review) && counted.stream().anyMatch(d -> ISSUE.equals(d.decision()))) return ISSUE;
        if (OK.equals(review)) return APPROVED;
        if (PENDING.equals(review)) {
            int lastIssue = -1;
            for (int i = 0; i < counted.size(); i++) if (ISSUE.equals(counted.get(i).decision())) lastIssue = i;
            for (int i = lastIssue + 1; i < counted.size(); i++)
                if (OK.equals(counted.get(i).decision()) && ENGINEER.equals(counted.get(i).reviewerRole())) return ENGINEER_CHECKED;
            if (counted.isEmpty() && extractedAt != null && !dismissed) {
                List<ReviewDecision> before = decisions.stream().filter(d -> !counts(d, extractedAt)).toList();
                if (review(before, null).filter(OK::equals).isPresent()) return BACK_IN_REVIEW;
            }
        }
        return PENDING;
    }

    /** §7.3 {@code openIssues}: the counted issue decisions (after the latest dismissal since the stamp), oldest first. */
    public static List<ReviewDecision> openIssues(List<ReviewDecision> decisions, Instant extractedAt) {
        return counted(decisions, extractedAt).stream().filter(d -> ISSUE.equals(d.decision())).toList();
    }
}
