package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.ItemHistory;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.ReviewItem;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;

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

    /** The brand, clinical drug, DGDA ingredients and source of one current item; empty when unknown or removed. */
    record ItemDetail(String conceptId, String sourceJson, ReviewItem.Brand brand, ReviewItem.Clinical clinical, String bdcId,
                      List<ReviewItem.DgdaIngredient> dgdaIngredients) {}

    Mono<ItemDetail> itemDetail(String batchId, String conceptId);
    /** The product's ingredients in XM-code order, with names, codes, coverage and DDInter entries chosen for {@code route}. */
    Mono<List<IngredientSummary>> ingredients(String conceptId, String bdcId, String route);
    /** Every current product of the batch with its substances and their DDInter codes (for RouteRule on both sides). */
    Mono<List<BatchPairs.Product>> batchProducts(String batchId);
    /** Stored pairs whose two sides are both in {@code ids}; DDInter placeholder text already removed. */
    Mono<List<BatchPairs.PairRow>> pairRows(Collection<String> ids);
    /** DDInter names of the entries in {@code ids} that have a curated.ddinter_drug row (a complete pair list, §8.1). */
    Mono<Map<String, String>> entryNames(Collection<String> ids);
    /** The item's snapshots, oldest first. */
    Mono<List<ItemHistory.Snapshot>> snapshots(String batchId, String conceptId);
    /** run_at of every full batch run (no concept ids), oldest first. */
    Mono<List<Instant>> fullRuns(String batchId);
    /** The snapshot payload stamped exactly {@code extractedAt}; empty when there is none. */
    Mono<String> payload(String batchId, String conceptId, Instant extractedAt);

    /**
     * §7.3 otherPairs: the latest current item of every product held outside this batch (never one marked removed, never a
     * product with a current item in this batch), with its substances and DDInter codes, ordered by batch, then trade name.
     * {@code approved} is true when that item's review is ok (display status approved).
     */
    Mono<List<BatchPairs.OtherProduct>> otherProducts(String batchId);
    /** Stored pairs between one of {@code mine} and one of {@code theirs} (both orders); placeholder text removed. */
    Mono<List<BatchPairs.PairRow>> pairRowsTouching(Collection<String> mine, Collection<String> theirs);
    /** Every senior pair decision among {@code codes}, keyed "{a}|{b}" (PairReviewReader). */
    Mono<Map<String, List<PairReviewRule.Decision>>> pairReviews(Collection<String> codes, String viewerEmail);
}
