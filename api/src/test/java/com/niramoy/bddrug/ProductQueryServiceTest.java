package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.domain.HiddenRecord;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import com.niramoy.bddrug.domain.Scope;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import java.util.ArrayList;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class ProductQueryServiceTest {
    static Product product(String id, String review) {
        return new Product(id, "dar", "Trade " + id, "Co", "Tablet", "Generic 5 mg", null, List.of(), "parsed", null, null, review);
    }

    static class FakePort implements ProductQueryPort {
        final List<Object[]> calls = new ArrayList<>();
        public Flux<Product> search(String term, int limit, int offset, boolean approvedOnly) {
            calls.add(new Object[]{term, limit, offset, approvedOnly}); return Flux.empty();
        }
        public Mono<Product> findByConceptId(String id) {
            return switch (id) {
                case "OK" -> Mono.just(product(id, "ok"));
                case "PEND" -> Mono.just(product(id, "pending"));
                case "ISS" -> Mono.just(product(id, "issue"));
                default -> Mono.empty();
            };
        }
        public Flux<LoadedProduct> loaded(boolean approvedOnly) {
            calls.add(new Object[]{"loaded", approvedOnly}); return Flux.empty();
        }
    }

    @Test void rejectsTooShortQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search(" a ", 0, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsTooLongQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search("x".repeat(101), 0, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsPageOutOfRange() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search("napa", 501, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
        StepVerifier.create(new ProductQueryService(new FakePort()).search("napa", -1, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void trimsLowercasesAndPagesBy20() {
        FakePort port = new FakePort();
        StepVerifier.create(new ProductQueryService(port).search("  NaPa ", 2, Scope.PUBLIC)).verifyComplete();
        assertThat(port.calls.get(0)).containsExactly("napa", 20, 40, true);
    }
    @Test void scopeDecidesWhetherOnlyApprovedProductsAreSearchedAndListed() {
        FakePort port = new FakePort();
        ProductQueryService service = new ProductQueryService(port);
        StepVerifier.create(service.search("napa", 0, Scope.ALL)).verifyComplete();
        StepVerifier.create(service.loaded(Scope.PUBLIC)).verifyComplete();
        StepVerifier.create(service.loaded(Scope.ALL)).verifyComplete();
        assertThat(port.calls.get(0)[3]).isEqualTo(false);
        assertThat(port.calls.get(1)).containsExactly("loaded", true);
        assertThat(port.calls.get(2)).containsExactly("loaded", false);
    }
    @Test void publicDetailHidesUnapprovedProducts() {
        ProductQueryService service = new ProductQueryService(new FakePort());
        StepVerifier.create(service.get("OK", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isInstanceOf(Product.class)).verifyComplete();
        StepVerifier.create(service.get("PEND", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("PEND", "Trade PEND", "pending"))).verifyComplete();
        StepVerifier.create(service.get("ISS", Scope.PUBLIC))
            .assertNext(v -> assertThat(((HiddenRecord.Product) v).reviewStatus()).isEqualTo("issue")).verifyComplete();
        StepVerifier.create(service.get("PEND", Scope.ALL))
            .assertNext(v -> assertThat(v).isInstanceOf(Product.class)).verifyComplete();
        StepVerifier.create(service.get("none", Scope.PUBLIC)).verifyComplete();
    }
}
