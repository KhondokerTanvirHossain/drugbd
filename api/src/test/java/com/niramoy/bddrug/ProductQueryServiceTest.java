package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.application.port.ProductQueryPort.LatestItem;
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
import java.util.Map;
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
                case "REM" -> Mono.just(product(id, "pending"));
                case "LOOSE" -> Mono.just(product(id, "pending"));
                default -> Mono.empty();
            };
        }
        public Flux<LoadedProduct> loaded(boolean approvedOnly) {
            calls.add(new Object[]{"loaded", approvedOnly}); return Flux.empty();
        }
        static final Map<String, LatestItem> ITEMS = Map.of(
            "PEND", new LatestItem("B-2", false), "ISS", new LatestItem("B-2", false), "REM", new LatestItem("B-3", true));
        public Mono<LatestItem> latestItem(String id) { return Mono.justOrEmpty(ITEMS.get(id)); }
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
    @Test void publicDetailIsTheSection74StubForEveryNonPublicState() {
        ProductQueryService service = new ProductQueryService(new FakePort());
        StepVerifier.create(service.get("PEND", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("PEND", "Trade PEND", "not_reviewed", "B-2"))).verifyComplete();
        // an issue is never named in public: the stub says not_reviewed (§7.4: "no product response names issue")
        StepVerifier.create(service.get("ISS", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("ISS", "Trade ISS", "not_reviewed", "B-2"))).verifyComplete();
        StepVerifier.create(service.get("REM", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("REM", "Trade REM", "removed", "B-3"))).verifyComplete();
        StepVerifier.create(service.get("LOOSE", Scope.PUBLIC))
            .assertNext(v -> assertThat(v).isEqualTo(new HiddenRecord.Product("LOOSE", "Trade LOOSE", "not_reviewed", null))).verifyComplete();
    }

    @Test void approvedAndScopeAllDetailsAreNotStubs() {
        ProductQueryService service = new ProductQueryService(new FakePort());
        StepVerifier.create(service.get("OK", Scope.PUBLIC)).assertNext(v -> assertThat(v).isInstanceOf(Product.class)).verifyComplete();
        StepVerifier.create(service.get("PEND", Scope.ALL)).assertNext(v -> assertThat(v).isInstanceOf(Product.class)).verifyComplete();
        StepVerifier.create(service.get("none", Scope.PUBLIC)).verifyComplete();
    }

    @Test void theStubCarriesNoReviewStatusField() {
        assertThat(java.util.Arrays.stream(HiddenRecord.Product.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("conceptId", "tradeName", "status", "batchId");
        assertThat(java.util.Arrays.stream(HiddenRecord.Substance.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("bdsId", "preferredName");
    }
}
