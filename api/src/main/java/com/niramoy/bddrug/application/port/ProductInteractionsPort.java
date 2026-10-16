package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairs;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Facts for §7.4 P10: this product, every other public product of any batch grouped by partner substance and route
 * (PublicPairs.PartnerGroup), and the stored pairs touching this product.
 */
public interface ProductInteractionsPort {
    record Facts(String route, List<BatchPairs.Substance> mine, List<PublicPairs.PartnerGroup> partners, List<PublicPairs.Row> rows,
                 Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews) {}
    Mono<Facts> facts(String conceptId);
}
