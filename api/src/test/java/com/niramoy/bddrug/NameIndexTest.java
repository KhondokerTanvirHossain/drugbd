package com.niramoy.bddrug;

import com.niramoy.bddrug.application.NameIndex;
import com.niramoy.bddrug.application.port.NameIndexPort;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

class NameIndexTest {
    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-16T00:00:00Z");
        public ZoneId getZone() { return ZoneId.of("UTC"); }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    static final class FakePort implements NameIndexPort {
        List<String> names = List.of("Warfarin", "Napa");
        Set<String> publicNow = new HashSet<>(Set.of("Warfarin", "Napa"));
        int loads = 0;
        public Flux<String> publicNames() { loads++; return Flux.fromIterable(names); }
        public Mono<Boolean> stillPublic(String name) { return Mono.just(publicNow.contains(name)); }
    }

    @Test void suggestsOnlyForFiveOrMoreCharacters() {
        NameIndex index = new NameIndex(new FakePort(), new MutableClock());
        assertThat(index.suggest("nepa").block()).isNull();
        assertThat(index.suggest("warfrin").block()).isEqualTo("Warfarin");
    }

    @Test void refreshesEveryFiveMinutes() {
        FakePort port = new FakePort();
        MutableClock clock = new MutableClock();
        NameIndex index = new NameIndex(port, clock);
        index.suggest("warfrin").block();
        clock.now = clock.now.plus(Duration.ofMinutes(4));
        index.suggest("warfrin").block();
        assertThat(port.loads).isEqualTo(1);
        clock.now = clock.now.plus(Duration.ofMinutes(2));
        index.suggest("warfrin").block();
        assertThat(port.loads).isEqualTo(2);
    }

    @Test void aNameWhoseRecordLeftPublicViewIsDropped() {
        FakePort port = new FakePort();
        NameIndex index = new NameIndex(port, new MutableClock());
        assertThat(index.suggest("warfrin").block()).isEqualTo("Warfarin");
        port.publicNow.remove("Warfarin");     // the record went back into review inside the 5 minutes
        assertThat(index.suggest("warfrin").block()).isNull();
    }
}
