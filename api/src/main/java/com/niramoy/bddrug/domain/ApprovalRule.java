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
 */
public final class ApprovalRule {
    private ApprovalRule() {}
    public static final String OK = "ok", ISSUE = "issue", PENDING = "pending", PHARMACIST = "pharmacist";

    private static final Comparator<ReviewDecision> CHRONOLOGICAL =
        Comparator.comparing(ReviewDecision::decidedAt).thenComparingLong(ReviewDecision::id);

    public static Optional<String> review(List<ReviewDecision> decisions, Instant extractedAt) {
        List<ReviewDecision> counted = decisions.stream()
            .filter(d -> extractedAt == null || d.decidedAt().isAfter(extractedAt))
            .sorted(CHRONOLOGICAL).toList();
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
}
