package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * What the QA read endpoints (spec §7.9.5) need from the database. Current items only (never one marked "removed from batch
 * file"). Decisions are read without email or note: the QA reads only compute the display status from them.
 */
public interface QaQueryPort {
    record BatchRow(String batchId, String status, Instant runAt) {}
    /** {@code note} as stored (NOT NULL in ops.stage_result). */
    record StageRow(String stage, String status, String note) {}
    /** One current item; {@code stages} in pipeline order, only the stages that have a result. */
    record Item(String batchId, String conceptId, String tradeName, String review, Instant extractedAt, List<StageRow> stages) {}
    /** A batch item key, for the decisions of a page of records. */
    record Key(String batchId, String conceptId) {}
    /** A validated problem filter (§7.9.4); {@code stage} only with stage_warn, {@code batch} null for every batch. */
    record Filter(String filter, String stage, String batch) {}

    /** Empty for an unknown batch. */
    Mono<BatchRow> batch(String batchId);
    /** The batch's current items in concept order (byte order, COLLATE "C"). */
    Mono<List<Item>> batchItems(String batchId);
    /** Every decision on the batch's items, oldest first, keyed by concept id; {@code reviewerEmail} and {@code note} are null. */
    Mono<Map<String, List<ReviewDecision>>> batchDecisions(String batchId);

    /** One page of the current items matching {@code f}, in batch id then concept id order (COLLATE "C"). */
    Mono<List<Item>> records(Filter f, int offset, int limit);
    /** How many current items match {@code f}. */
    Mono<Long> recordCount(Filter f);
    /** Every decision on {@code keys}, oldest first; {@code reviewerEmail} and {@code note} are null. One query. */
    Mono<Map<Key, List<ReviewDecision>>> decisions(List<Key> keys);
}
