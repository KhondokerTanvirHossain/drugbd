package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;

/** What the reviewer read endpoints need from the database. Removed items ("removed from batch file") are never read. */
public interface ReviewQueryPort {
    record BatchRow(String batchId, String status, Instant runAt) {}
    /** {@code evidence} is the stored JSONB as text. */
    record StageRow(String stage, String status, String note, String evidence) {}
    /** One DGDA ingredient: {@code bdsId} null when no substance carries its XM code; {@code coverage} null then too. */
    record IngredientFact(String bdsId, String name, String dgdaName, String coverage) {}
    /** One current batch item; {@code decisions} oldest first, with emails (used only to compute {@code mine}). */
    record ItemFacts(String conceptId, String review, Instant extractedAt, String tradeName, String darNumber, String company,
                     String genericContentRaw, String clinicalDisplayName, List<StageRow> stages,
                     List<IngredientFact> ingredients, List<ReviewDecision> decisions) {}

    /** Newest run first. */
    Flux<BatchRow> batches();
    /** Empty for an unknown batch. */
    Mono<BatchRow> batch(String batchId);
    /** Current items of the batch in concept order (byte order, COLLATE "C"). */
    Mono<List<ItemFacts>> items(String batchId);
}
