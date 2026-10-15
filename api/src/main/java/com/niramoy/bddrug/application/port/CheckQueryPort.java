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
                   String management) {}
    /**
     * pairs holds every stored pair whose two sides are both among the loaded DDInter codes.
     * listedCodes holds the loaded codes that have a curated.ddinter_drug row, i.e. whose full pair list is stored
     * (§7.4, §8.1 item 5). A chosen code outside it was never read in full, so its substance is not checked.
     * {@code reviews}: the senior pair decisions among the loaded codes, keyed "{a}|{b}", for the public pairReview (§7.4).
     */
    record CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                     Set<String> listedCodes, List<PairRow> pairs, Map<String, List<PairReviewRule.Decision>> reviews) {
        public CheckData(List<ProductRow> products, List<IngredientRow> ingredients, Map<String, List<DdinterCode>> codesByBds,
                         Set<String> listedCodes, List<PairRow> pairs) {
            this(products, ingredients, codesByBds, listedCodes, pairs, Map.of());
        }
    }
}
