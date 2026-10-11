package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Substance;
import reactor.core.publisher.Mono;
public interface SubstanceQueryPort {
    Mono<Substance> find(String bdsId);
}
