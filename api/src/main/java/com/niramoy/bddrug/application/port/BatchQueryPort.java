package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Batch;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
public interface BatchQueryPort {
    Flux<Batch> list();
    Mono<Batch> find(String batchId);
}
