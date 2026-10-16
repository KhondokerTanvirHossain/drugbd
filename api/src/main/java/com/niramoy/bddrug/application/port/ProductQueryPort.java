package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Products carry their current review status; {@code approvedOnly} keeps only products whose status is ok. */
public interface ProductQueryPort {
    Flux<Product> search(String normalisedTerm, int limit, int offset, boolean approvedOnly);
    Mono<Product> findByConceptId(String conceptId);
    Flux<LoadedProduct> loaded(boolean approvedOnly);

    /** The product's latest batch item, in ReviewSql.statusOf order; removed = marked "removed from batch file". */
    record LatestItem(String batchId, boolean removed) {}
    /** Empty when the product is in no batch. */
    Mono<LatestItem> latestItem(String conceptId);
}
