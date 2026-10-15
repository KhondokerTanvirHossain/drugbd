package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SeniorViews;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** What the senior review service reads (§7.7). "Held" = the latest current item of a product, never one marked removed. */
public interface SeniorReviewPort {
    /**
     * One row per held product and DGDA ingredient (a product with none has one row with null ingredient columns). Narrow on
     * purpose (§10.6): the review state of an item is read only for the brands a page shows ({@link #itemStates}).
     */
    record HeldRow(String conceptId, String batchId, String tradeName, String bdcId, String clinicalName, String route,
                   String xmCode, String bdsId, String substance, String coverage) {}
    /** The review state of one held item (its latest current batch_item row). */
    record ItemState(String review, Instant extractedAt) {}
    record Code(String bdsId, String code, String routeScope) {}
    record PairLite(String ddinterA, String ddinterB, String severity) {}
    record EntryInfo(String name, Instant fetchedAt) {}
    record SubstanceFacts(String bdsId, String name, List<SeniorViews.Name> names, List<IngredientSummary.Code> codes,
                          String coverage, List<IngredientSummary.Entry> entries) {}

    /** Held products, one row per product and ingredient, unordered (§10.6: no sort over the whole register). */
    Mono<List<HeldRow>> held();
    /** The DDINTER codes of every held substance (the held set is found in SQL, so this can run beside held()). */
    Mono<List<Code>> heldDdinterCodes();
    /** Every stored pair whose two sides are both in {@code codes}: ids and severity only. */
    Mono<List<PairLite>> pairsAmong(Collection<String> codes);
    /** The stored pairs (as[i], bs[i]) exactly (the two lists are aligned by index), with their (cleaned) texts. */
    Mono<List<BatchPairs.PairRow>> pairDetails(List<String> as, List<String> bs);
    Mono<Map<String, List<PairReviewRule.Decision>>> reviews(Collection<String> codes, String viewerEmail);
    Mono<Map<String, EntryInfo>> entries(Collection<String> codes);
    /** The review state of these items, keyed "{batchId}|{conceptId}". */
    Mono<Map<String, ItemState>> itemStates(Collection<String> itemKeys);
    /** Decisions (no emails) of these items, keyed "{batchId}|{conceptId}", oldest first. */
    Mono<Map<String, List<ReviewDecision>>> decisions(Collection<String> itemKeys);
    /** Empty when the substance does not exist. */
    Mono<SubstanceFacts> substance(String bdsId);
    /** The strength text of {@code bdsId} in each clinical drug, by bdc_id. */
    Mono<Map<String, String>> strengths(Collection<String> bdcIds, String bdsId);

    record NewPairDecision(String decision, String note, String reviewerEmail, String expectedContentHash,
                           Long expectedLastPairReviewId, UUID requestId) {}
    /** {@code outcome} is the error code (CONFLICT or INVALID_QUERY); email, role and target only when they were valid. */
    record PairRejection(String ddinterA, String ddinterB, String actorEmail, String actorRole, String outcome, UUID requestId) {}

    /**
     * §7.7, one transaction, SELECT … FOR UPDATE on the pair row: (1) a requestId already used for a pair decision answers
     * replayed for the same pair and decision, else InvalidQueryException(requestId); (2) NotFoundException(pair) when the
     * pair is not stored, a ≥ b, or a side is not held; (3) ConflictException(contentHash); (4) ConflictException(lastPairReviewId);
     * (5) ConflictException(state) for reviewed on a reviewed pair; then the pair_review row and its pair_decision audit row.
     */
    Mono<SeniorViews.PairOutcome> decide(String ddinterA, String ddinterB, NewPairDecision decision);
    /** One pair_decision_rejected audit row, in its own transaction. */
    Mono<Void> recordRejection(PairRejection rejection);
}
