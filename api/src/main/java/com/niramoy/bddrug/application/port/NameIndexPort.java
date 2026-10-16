package com.niramoy.bddrug.application.port;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Publicly visible names (§7.4): public products' trade names, public substances' preferred names and synonyms. */
public interface NameIndexPort {
    Flux<String> publicNames();
    /** One query: is the record behind this name public now? */
    Mono<Boolean> stillPublic(String name);
}
