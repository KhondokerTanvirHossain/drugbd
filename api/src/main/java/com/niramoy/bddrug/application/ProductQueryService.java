package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ProductDetailPort;
import com.niramoy.bddrug.application.port.ProductInteractionsPort;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.application.port.ProductQueryPort.LatestItem;
import com.niramoy.bddrug.domain.ClinicalDrug;
import com.niramoy.bddrug.domain.HiddenRecord;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import com.niramoy.bddrug.domain.PublicPairs;
import com.niramoy.bddrug.domain.PublicProducts;
import com.niramoy.bddrug.domain.Scope;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.Locale;
import java.util.Optional;

@Service
public class ProductQueryService {
    public static final int PAGE_SIZE = 20, MAX_PAGE = 500, MIN_LEN = 2, MAX_LEN = 100;
    public static final int INTERACTIONS_PAGE_MAX = 10_000;
    private final ProductQueryPort port;
    private final ProductDetailPort details;
    private final ProductInteractionsPort interactions;
    public ProductQueryService(ProductQueryPort port, ProductDetailPort details, ProductInteractionsPort interactions) {
        this.port = port;
        this.details = details;
        this.interactions = interactions;
    }

    public Flux<Product> search(String q, int page, Scope scope) {
        String term = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (term.length() < MIN_LEN || term.length() > MAX_LEN)
            return Flux.error(new InvalidQueryException("q must be 2-100 characters"));
        if (page < 0 || page > MAX_PAGE)
            return Flux.error(new InvalidQueryException("page must be 0-500"));
        return port.search(term, PAGE_SIZE, page * PAGE_SIZE, scope == Scope.PUBLIC);
    }

    /** Public: the PublicProduct, or the §7.4 stub; scope=all: the internal Product. Empty when unknown. */
    public Mono<Object> get(String conceptId, Scope scope) {
        return port.findByConceptId(conceptId).flatMap(p -> {
            if (scope != Scope.PUBLIC) return Mono.just((Object) p);
            if (!"ok".equals(p.reviewStatus()))
                return port.latestItem(conceptId).map(Optional::of).defaultIfEmpty(Optional.empty())
                    .map(item -> (Object) stub(p, item.orElse(null)));
            ClinicalDrug cd = p.clinicalDrug();
            return details.facts(conceptId, cd == null ? null : cd.bdcId(), cd == null ? null : cd.route())
                .map(f -> (Object) PublicProducts.assemble(p, f));
        });
    }

    /** §7.4 P10: the grouped pairs of a public product; the stub when it is not public; empty when unknown. */
    public Mono<Object> interactions(String conceptId, int page, Scope scope) {
        if (page < 0 || page > INTERACTIONS_PAGE_MAX)
            return Mono.error(new InvalidQueryException("page", "page must be 0-" + INTERACTIONS_PAGE_MAX));
        return port.findByConceptId(conceptId).flatMap(p -> {
            if (scope == Scope.PUBLIC && !"ok".equals(p.reviewStatus()))
                return port.latestItem(conceptId).map(Optional::of).defaultIfEmpty(Optional.empty())
                    .map(item -> (Object) stub(p, item.orElse(null)));
            return interactions.facts(conceptId).map(f -> (Object) PublicPairs.computeGroups(conceptId, f.route(), f.mine(), f.partners(),
                f.rows(), f.complete(), f.reviews(), page));
        });
    }

    /** §6.4: "removed" whatever the last decision when the latest item left the batch file; otherwise "not_reviewed". */
    public static HiddenRecord.Product stub(Product p, LatestItem item) {
        String status = item != null && item.removed() ? HiddenRecord.REMOVED : HiddenRecord.NOT_REVIEWED;
        return new HiddenRecord.Product(p.conceptId(), p.tradeName(), status, item == null ? null : item.batchId());
    }

    public Flux<LoadedProduct> loaded(Scope scope) { return port.loaded(scope == Scope.PUBLIC); }
}
