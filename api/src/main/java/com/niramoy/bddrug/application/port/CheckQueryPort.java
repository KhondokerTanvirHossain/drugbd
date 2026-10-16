package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairReviewRule;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Loads what the interaction checker needs for a set of products, in a few set-based queries. */
public interface CheckQueryPort {
    Mono<CheckData> load(List<String> conceptIds);

    /**
     * route is the clinical drug's route, or null when the product has no clinical drug.
     * reviewStatus is the product's current review: ok, pending or issue.
     */
    record ProductRow(String conceptId, String tradeName, String genericContentRaw, String route, String reviewStatus) {}
    /** bdsId/preferredName are null when the XM code has no substance; coverage is null without a coverage row. */
    record IngredientRow(String conceptId, String xmCode, String ingredientName, String bdsId, String preferredName,
                         String coverage) {}
    record PairRow(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction,
                   String management, String interactionId) {}
    /**
     * pairs holds every stored pair whose two sides are both among the loaded DDInter codes. listedCodes holds the loaded
     * codes that have a curated.ddinter_drug row (their full pair list is stored, §7.4, §8.1 item 5). reviews (P1C): the
     * senior pair decisions among the loaded codes, keyed "a|b" (stored order), for the public pairReview (§7.4).
     * entryNames maps a code to DDInter's own name.
     */
    record CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                     Set<String> listedCodes, List<PairRow> pairs, Map<String, List<PairReviewRule.Decision>> reviews,
                     Map<String, String> entryNames) {
        public CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                         Set<String> listedCodes, List<PairRow> pairs) {
            this(products, ingredients, codesByBds, listedCodes, pairs, Map.of(), Map.of());
        }
    }
}
