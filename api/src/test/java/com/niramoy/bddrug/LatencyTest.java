package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.assertThat;

/** The scale tests' p95 helper: warm-up calls run but are never timed (cold JIT, pool and plan caches). */
class LatencyTest {
    @Test void warmUpCallsRunButAreNotTimed() {
        AtomicLong clock = new AtomicLong();
        AtomicInteger calls = new AtomicInteger();
        // The first WARM_UPS calls each take a full second; every timed call takes 10 ms.
        long p95 = Latency.p95Millis(() -> clock.addAndGet(calls.getAndIncrement() < Latency.WARM_UPS ? 1_000_000_000L : 10_000_000L),
                                     clock::get);
        assertThat(calls.get()).isEqualTo(Latency.WARM_UPS + Latency.TIMED);
        assertThat(Latency.WARM_UPS).isGreaterThanOrEqualTo(5);
        assertThat(p95).isEqualTo(10L);
    }

    @Test void theP95IsTheNineteenthOfTwentySortedTimings() {
        AtomicLong clock = new AtomicLong();
        AtomicInteger calls = new AtomicInteger();
        // Timed call k (0-based) takes k ms, so the sorted timings are 0..19 and the 19th (index 18) is 18 ms.
        long p95 = Latency.p95Millis(() -> {
            int n = calls.getAndIncrement();
            clock.addAndGet(n < Latency.WARM_UPS ? 0L : (n - Latency.WARM_UPS) * 1_000_000L);
        }, clock::get);
        assertThat(Latency.TIMED).isEqualTo(20);
        assertThat(p95).isEqualTo(18L);
    }
}
