package com.niramoy.bddrug.application;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/** The in-memory spelling index (§7.4 "Suggestion"). Task 13 fills it; until then it never suggests. */
@Component
public class NameIndex {
    public Mono<String> suggest(String term) { return Mono.empty(); }
}
