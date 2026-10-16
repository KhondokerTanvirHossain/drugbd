package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.PublicProducts;
import reactor.core.publisher.Mono;

/** What the public product detail needs beyond the product row (§7.4 P5/P6/P7/P15). bdcId and route may be null. */
public interface ProductDetailPort {
    Mono<PublicProducts.Facts> facts(String conceptId, String bdcId, String route);
}
