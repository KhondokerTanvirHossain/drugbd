package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.SuggestRow;
import reactor.core.publisher.Flux;
import java.util.List;

public interface SuggestPort {
    /** term stripped and lower-cased; exclude: concept ids already selected. Trade-name prefix first, then approved, then name. */
    Flux<SuggestRow> suggest(String term, List<String> exclude, int limit);
}
