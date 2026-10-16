package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.assertThat;

/** The scale tests' p95 helper: warm-up calls run but are never timed (cold JIT, pool and plan caches); the bound holds the best of three samples. */
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

    @Test void threeIndependentSamplesEachWithItsOwnWarmUps() {
        AtomicLong clock = new AtomicLong();
        AtomicInteger calls = new AtomicInteger();
        // Within each sample of WARM_UPS + TIMED calls, warm-ups take a full second and timed calls 10, 20, 30 ms by sample.
        int perSample = Latency.WARM_UPS + Latency.TIMED;
        Latency.P95s p = Latency.p95Samples(() -> {
            int n = calls.getAndIncrement();
            clock.addAndGet(n % perSample < Latency.WARM_UPS ? 1_000_000_000L : (n / perSample + 1) * 10_000_000L);
        }, clock::get);
        assertThat(Latency.SAMPLES).isEqualTo(3);
        assertThat(calls.get()).isEqualTo(Latency.SAMPLES * perSample);
        assertThat(p.samples()).containsExactly(10L, 20L, 30L);
    }

    @Test void theBestSampleIsTheSmallestP95() {
        assertThat(new Latency.P95s(List.of(410L, 160L, 330L)).best()).isEqualTo(160L);
        assertThat(new Latency.P95s(List.of(120L, 120L, 900L)).best()).isEqualTo(120L);
    }

    @Test void oneSlowSampleDoesNotFailTheBoundButThreeDo() {
        assertThat(new Latency.P95s(List.of(450L, 180L, 175L)).best()).isLessThan(300L);
        assertThat(new Latency.P95s(List.of(450L, 310L, 301L)).best()).isGreaterThanOrEqualTo(300L);
    }

    @Test void theSamplesPrintInOrderForTheAssertionMessage() {
        assertThat(new Latency.P95s(List.of(410L, 160L, 330L)).toString()).isEqualTo("p95 samples [410, 160, 330] ms, best 160 ms");
    }
}
