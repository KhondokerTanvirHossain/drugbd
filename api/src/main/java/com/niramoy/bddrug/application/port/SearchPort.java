package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.SearchResult;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Search reads under the §7.4 visibility rule. term is stripped and lower-cased. */
public interface SearchPort {
    record Counts(long substances, long approved, long stubs) {}
    Mono<Counts> counts(String term);
    Flux<SearchResult.SubstanceHit> substances(String term, int limit, int offset);
    Flux<SearchResult.ProductHit> approved(String term, int limit, int offset);
    Flux<SearchResult.StubHit> stubs(String term, int limit, int offset);
}
