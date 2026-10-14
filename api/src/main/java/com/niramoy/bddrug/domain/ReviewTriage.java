package com.niramoy.bddrug.domain;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Spec §5.3 filters and §5.4 row hints, from one record's facts. The web turns a {@link Hint} into words; the order of
 * the hint rules (failed, then warnings) is the web's (§5.4), this class only counts.
 */
public final class ReviewTriage {
    private ReviewTriage() {}

    public static final List<String> SHOWS = List.of("all", "needs", "warn", "issue", "approved", "nodata");

    /**
     * {@code stages} maps a stage to its status (a stage with no result is absent); {@code pairsWithoutText} is the
     * DDInter stage's {@code evidence.text_missing} count; {@code coverages} holds one of full, none, not_run per mapped
     * ingredient (an ingredient with no substance is left out: it is unmapped, not "not run").
     */
    public record Facts(String displayStatus, Map<String, String> stages, int pairsWithoutText, List<String> coverages) {}
    public record Hint(int failed, int warnings, int pairsWithoutText, boolean noData, boolean notRun) {}

    public static boolean needsReview(String displayStatus) {
        return ApprovalRule.PENDING.equals(displayStatus) || ApprovalRule.BACK_IN_REVIEW.equals(displayStatus)
            || ApprovalRule.ENGINEER_CHECKED.equals(displayStatus);
    }

    /** Any of the four stages whose status is not ok, a missing result included. */
    static boolean hasWarning(Facts f) {
        return DecisionGuard.STAGES.stream().anyMatch(s -> !"ok".equals(f.stages().get(s)));
    }

    public static boolean inFilter(String show, Facts f) {
        return switch (show) {
            case "needs" -> needsReview(f.displayStatus());
            case "warn" -> hasWarning(f);
            case "issue" -> ApprovalRule.ISSUE.equals(f.displayStatus());
            case "approved" -> ApprovalRule.APPROVED.equals(f.displayStatus());
            case "nodata" -> f.coverages().contains("none");
            default -> true;
        };
    }

    public static Hint hint(Facts f) {
        int failed = 0, warnings = 0;
        for (String s : DecisionGuard.STAGES) {
            String status = f.stages().get(s);
            if (status == null || "fail".equals(status)) failed++;      // no result blocks approval like a failure (§7.2 step 5)
            else if ("warn".equals(status)) warnings++;
        }
        return new Hint(failed, warnings, f.pairsWithoutText(), f.coverages().contains("none"), f.coverages().contains("not_run"));
    }

    public static Map<String, Integer> filterCounts(List<Facts> all) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (String show : SHOWS) out.put(show, (int) all.stream().filter(f -> inFilter(show, f)).count());
        return out;
    }
}
