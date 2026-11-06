package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Products carry their internal review status and their public label under the public mode (§7.4.1); {@code publicOnly}
 * keeps only the products that are visible publicly (a non-null label).
 */
public interface ProductQueryPort {
    Flux<Product> search(String normalisedTerm, int limit, int offset, boolean publicOnly);
    Mono<Product> findByConceptId(String conceptId);
    Flux<LoadedProduct> loaded(boolean publicOnly);

    /**
     * The product's latest batch item, in ReviewSql's latest-item order; removed = marked "removed from batch file";
     * loadFailure = a DGDA load failure note ("not found at source", "not a registered Drug product").
     */
    record LatestItem(String batchId, boolean removed, boolean loadFailure) {
        public LatestItem(String batchId, boolean removed) { this(batchId, removed, false); }
    }
    /** Empty when the product is in no batch. */
    Mono<LatestItem> latestItem(String conceptId);
}
