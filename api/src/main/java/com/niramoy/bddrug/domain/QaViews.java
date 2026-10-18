package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;

/**
 * Response shapes of the QA read endpoints (spec §7.9.3, §7.9.5). Built field by field from the stored rows: no email, no
 * decision note, no version token, nothing but pipeline output and computed status.
 */
public final class QaViews {
    private QaViews() {}

    /** One stage result of a batch item: {@code note} is the stored note, whole ("" when the stage has none). */
    public record Stage(String stage, String status, String note) {}
    /** {@code stages} in pipeline order; a stage with no result is absent. */
    public record BatchItem(String conceptId, String tradeName, String displayStatus, List<Stage> stages) {}
    /** {@code itemCount}: the batch's current items (removed ones excluded), as the review batch list counts them. */
    public record BatchItems(String batchId, String status, Instant runAt, int itemCount, List<BatchItem> items) {}

    /** Each stage's status, "ok", "warn" or "fail"; null when the stage has no result. */
    public record StageStatuses(String dgda, String substances, String clinical, String ddinter) {}
    public record RecordRow(String batchId, String conceptId, String tradeName, String displayStatus, StageStatuses stages) {}
    /** {@code stage} and {@code batch} are null when not asked for. */
    public record Records(String filter, String stage, String batch, int page, int size, long total, List<RecordRow> items) {}
}
