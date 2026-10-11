package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Substance;
import reactor.core.publisher.Mono;
public interface SubstanceQueryPort {
    /** {@code approvedOnly} keeps only approved products in {@link Substance#products()}. */
    Mono<Substance> find(String bdsId, boolean approvedOnly);
}
