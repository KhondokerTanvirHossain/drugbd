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
}
