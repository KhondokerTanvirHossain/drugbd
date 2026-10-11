package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Batch;
import com.niramoy.bddrug.domain.BatchReport;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
public interface BatchQueryPort {
    Flux<Batch> list();
    Mono<Batch> find(String batchId);
    /** Empty for an unknown batch. */
    Mono<BatchReport> report(String batchId);
}
