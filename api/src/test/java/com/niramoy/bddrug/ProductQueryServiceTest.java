package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.domain.Product;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import java.util.ArrayList;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class ProductQueryServiceTest {
    static class FakePort implements ProductQueryPort {
        final List<Object[]> calls = new ArrayList<>();
        public Flux<Product> search(String term, int limit, int offset) { calls.add(new Object[]{term, limit, offset}); return Flux.empty(); }
        public Mono<Product> findByConceptId(String id) { return Mono.empty(); }
    }

    @Test void rejectsTooShortQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search(" a ", 0))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsTooLongQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search("x".repeat(101), 0))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsPageOutOfRange() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search("napa", 501))
            .expectError(InvalidQueryException.class).verify();
        StepVerifier.create(new ProductQueryService(new FakePort()).search("napa", -1))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void trimsLowercasesAndPagesBy20() {
        FakePort port = new FakePort();
        StepVerifier.create(new ProductQueryService(port).search("  NaPa ", 2)).verifyComplete();
        assertThat(port.calls.get(0)).containsExactly("napa", 20, 40);
    }
}
