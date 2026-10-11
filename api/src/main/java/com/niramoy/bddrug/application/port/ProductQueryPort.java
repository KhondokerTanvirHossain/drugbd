package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Product;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
public interface ProductQueryPort {
    Flux<Product> search(String normalisedTerm, int limit, int offset);
    Mono<Product> findByConceptId(String conceptId);
}
