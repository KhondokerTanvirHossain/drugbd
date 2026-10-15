package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;

/** Reads for GET /v1/stats: four queries whatever the number of batches (no N+1, spec §7.3). */
public interface StatsQueryPort {
    record Totals(long productsLoaded, long substances, long approvedProducts, long inReviewProducts) {}
    record BatchRow(String batchId, String status) {}
    /** One batch item. {@code productPublic}: the product's latest item is ok and not removed from the batch file (§7.4). */
    record ItemRow(String batchId, String conceptId, String tradeName, String review, Instant extractedAt,
                   boolean removed, boolean productPublic) {}
    /** A decision without its note or email: the stats need only the decision, the role and the time. */
    record DecisionRow(String batchId, String conceptId, ReviewDecision decision) {}

    Mono<Totals> totals();
    /** Newest run first. */
    Flux<BatchRow> batches();
    /** By batch, then concept id (COLLATE "C"). */
    Flux<ItemRow> items();
    /** Oldest first. */
    Flux<DecisionRow> decisions();
}
