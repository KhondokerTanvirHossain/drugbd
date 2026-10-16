package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.NameIndexPort;
import com.niramoy.bddrug.domain.Suggest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * §7.4 "Suggestion (Decision: no schema change)": an in-memory index of publicly visible names, refreshed every 5 minutes;
 * for a query of 5 or more characters the single closest name at distance 2 or less. Before a candidate is returned the
 * API re-checks with one query that its record is still public, so a record that went back into review in the last 5
 * minutes never leaks a name.
 */
@Component
public class NameIndex {
    public static final Duration TTL = Duration.ofMinutes(5);
    public static final int MIN_LENGTH = 5;
    private record Snapshot(Instant loadedAt, List<String> names) {}

    private final NameIndexPort port;
    private final Clock clock;
    private final AtomicReference<Snapshot> snapshot = new AtomicReference<>();

    @Autowired
    public NameIndex(NameIndexPort port) { this(port, Clock.systemUTC()); }

    public NameIndex(NameIndexPort port, Clock clock) {
        this.port = port;
        this.clock = clock;
    }

    public Mono<String> suggest(String term) {
        if (term == null || term.codePointCount(0, term.length()) < MIN_LENGTH) return Mono.empty();
        return names().flatMap(list -> {
            String best = Suggest.closest(term, list);
            return best == null ? Mono.empty() : port.stillPublic(best).filter(Boolean::booleanValue).map(ok -> best);
        });
    }

    private Mono<List<String>> names() {
        Snapshot s = snapshot.get();
        Instant now = clock.instant();
        if (s != null && Duration.between(s.loadedAt(), now).compareTo(TTL) < 0) return Mono.just(s.names());
        return port.publicNames().collectList().map(list -> {
            snapshot.set(new Snapshot(now, List.copyOf(list)));
            return list;
        });
    }
}
