package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Response shapes of the reviewer read endpoints (spec §7.3). None carries an email. */
public final class ReviewViews {
    private ReviewViews() {}

    public record Counts(int approved, int issue, int needsReview, int engineerChecked, int backInReview, int noData, int warnings) {}
    public record BatchSummary(String batchId, String status, Instant runAt, int itemCount, Counts counts) {}
    /** The stale-detection token (spec §5.11): the run stamp exactly as stored, and the newest decision id. */
    public record Version(Instant extractedAt, Long lastDecisionId) {}
    public record ItemRow(int index, String conceptId, String tradeName, String clinicalDisplayName, String displayStatus,
                          ReviewTriage.Hint hint, Version version) {}
    public record ItemsPage(String batchId, int total, Map<String, Integer> filterCounts, List<ItemRow> items) {}
    public record VersionRow(String conceptId, Instant extractedAt, Long lastDecisionId, String displayStatus) {}
    public record Diff(Instant from, Instant to, String reason, List<SnapshotDiff.Row> rows) {}
}
