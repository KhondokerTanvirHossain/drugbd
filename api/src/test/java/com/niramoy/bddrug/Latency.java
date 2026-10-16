package com.niramoy.bddrug;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.LongSupplier;

/**
 * The p95 the scale tests hold to §10.6 ("Server: API p95 ≤ 300 ms per call"). {@link #WARM_UPS} calls run first and are
 * never timed (cold JIT, connection pool and query plans), then {@link #TIMED} calls are timed and the 19th of the 20 sorted
 * timings is the p95. The bound itself stays in each test and is never loosened.
 */
final class Latency {
    private Latency() {}

    static final int WARM_UPS = 5;
    static final int TIMED = 20;

    static long p95Millis(Runnable call) {
        return p95Millis(call, System::nanoTime);
    }

    static long p95Millis(Runnable call, LongSupplier nanoTime) {
        for (int i = 0; i < WARM_UPS; i++) call.run();
        List<Long> ms = new ArrayList<>(TIMED);
        for (int i = 0; i < TIMED; i++) {
            long t = nanoTime.getAsLong();
            call.run();
            ms.add((nanoTime.getAsLong() - t) / 1_000_000);
        }
        Collections.sort(ms);
        return ms.get(TIMED - 2);
    }
}
