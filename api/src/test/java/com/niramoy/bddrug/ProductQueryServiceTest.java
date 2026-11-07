package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.application.port.ProductDetailPort;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.application.port.ProductQueryPort.LatestItem;
import com.niramoy.bddrug.domain.HiddenRecord;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import com.niramoy.bddrug.domain.ProductBrowse;
import com.niramoy.bddrug.domain.PublicProduct;
import com.niramoy.bddrug.domain.PublicProducts;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.presentation.InternalAuth;
import com.niramoy.bddrug.presentation.ProductController;
import com.niramoy.bddrug.presentation.UnauthorizedException;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductQueryServiceTest {
    static final ProductDetailPort DETAILS = (c, bdc, route) -> Mono.just(new PublicProducts.Facts("B-1", null, null, null,
        java.util.List.of(), java.util.Map.of(), java.util.Map.of(), java.util.Set.of(), 0, java.util.List.of()));

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
        public Mono<Map<String, Long>> browseCounts() {
            calls.add(new Object[]{"counts"}); return Mono.just(Map.of("B", 120L, "N", 3L, ProductBrowse.DIGITS, 2L));
        }
        public Flux<ProductBrowse.Row> browse(String letter, int limit, int offset) {
            calls.add(new Object[]{"browse", letter, limit, offset}); return Flux.empty();
        }
    }

    @Test void rejectsTooShortQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort(), DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty()).search(" a ", 0, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsTooLongQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort(), DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty()).search("x".repeat(101), 0, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsPageOutOfRange() {
        StepVerifier.create(new ProductQueryService(new FakePort(), DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty()).search("napa", 501, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
        StepVerifier.create(new ProductQueryService(new FakePort(), DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty()).search("napa", -1, Scope.PUBLIC))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void trimsLowercasesAndPagesBy20() {
        FakePort port = new FakePort();
        StepVerifier.create(new ProductQueryService(port, DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty()).search("  NaPa ", 2, Scope.PUBLIC)).verifyComplete();
        assertThat(port.calls.get(0)).containsExactly("napa", 20, 40, true);
    }
    @Test void scopeDecidesWhetherOnlyApprovedProductsAreSearchedAndListed() {
        FakePort port = new FakePort();
        ProductQueryService service = new ProductQueryService(port, DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty());
        StepVerifier.create(service.search("napa", 0, Scope.ALL)).verifyComplete();
        StepVerifier.create(service.loaded(Scope.PUBLIC)).verifyComplete();
        StepVerifier.create(service.loaded(Scope.ALL)).verifyComplete();
        assertThat(port.calls.get(0)[3]).isEqualTo(false);
        assertThat(port.calls.get(1)).containsExactly("loaded", true);
        assertThat(port.calls.get(2)).containsExactly("loaded", false);
    }
    @Test void publicDetailIsTheSection74StubForEveryNonPublicState() {
        ProductQueryService service = new ProductQueryService(new FakePort(), DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty());
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
        ProductQueryService service = new ProductQueryService(new FakePort(), DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty());
        StepVerifier.create(service.get("OK", Scope.PUBLIC)).assertNext(v -> assertThat(v).isInstanceOf(PublicProduct.class)).verifyComplete();
        StepVerifier.create(service.get("PEND", Scope.ALL)).assertNext(v -> assertThat(v).isInstanceOf(Product.class)).verifyComplete();
        StepVerifier.create(service.get("none", Scope.PUBLIC)).verifyComplete();
    }

    @Test void theStubCarriesNoReviewStatusField() {
        assertThat(java.util.Arrays.stream(HiddenRecord.Product.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("conceptId", "tradeName", "status", "batchId");
        assertThat(java.util.Arrays.stream(HiddenRecord.Substance.class.getRecordComponents()).map(c -> c.getName()))
            .containsExactly("bdsId", "preferredName");
    }

    @Test void suggestStripsLowerCasesAndDropsBlankAndRepeatedExcludes() {
        List<Object[]> calls = new ArrayList<>();
        ProductQueryService service = new ProductQueryService(new FakePort(), DETAILS, c -> Mono.empty(),
            (t, e, l) -> { calls.add(new Object[]{t, e, l}); return Flux.empty(); });
        StepVerifier.create(service.suggest("  NaPa ", java.util.Arrays.asList("A", "", null, "A", "B"))).verifyComplete();
        assertThat(calls.get(0)).containsExactly("napa", List.of("A", "B"), 10);
        StepVerifier.create(service.suggest("napa", null)).verifyComplete();
        assertThat(calls.get(1)).containsExactly("napa", List.of(), 10);
        List<String> twenty = java.util.stream.IntStream.range(0, 20).mapToObj(i -> "X" + i).toList();
        StepVerifier.create(service.suggest("napa", twenty)).verifyComplete();
        StepVerifier.create(service.suggest("napa", java.util.stream.Stream.concat(twenty.stream(), java.util.stream.Stream.of("X20")).toList()))
            .expectErrorSatisfies(e -> assertThat(((InvalidQueryException) e).field()).isEqualTo("exclude")).verify();
        StepVerifier.create(service.suggest(" \u0995 ", List.of()))
            .expectErrorSatisfies(e -> assertThat(((InvalidQueryException) e).field()).isEqualTo("q")).verify();
        assertThat(calls).hasSize(3);
    }

    // ---- §6.11.3 P17 browse

    static ProductQueryService browseService(FakePort port) {
        return new ProductQueryService(port, DETAILS, c -> Mono.empty(), (t, e, l) -> Flux.empty());
    }

    static Object[] browseCall(FakePort port) {
        return port.calls.stream().filter(c -> "browse".equals(c[0])).findFirst().orElseThrow();
    }

    @Test void browseRejectsAnyLetterButAToZOr09() {
        FakePort port = new FakePort();
        for (String bad : List.of("AB", "1", "5", "-", "0", "09", "0-9 ", " A", "  ", " ", "\t", "\u00c4", "\u00e9", "\u0995", "0\u20139", "a\u0000", "%", "all"))
            StepVerifier.create(browseService(port).browse(bad, 0))
                .expectErrorSatisfies(e -> assertThat(((InvalidQueryException) e).field()).as(bad).isEqualTo("letter")).verify();
        assertThat(port.calls).isEmpty();
    }

    @Test void browseRejectsAPageOutside0To9() {
        FakePort port = new FakePort();
        for (int bad : new int[]{-1, 10, 500})
            StepVerifier.create(browseService(port).browse("A", bad))
                .expectErrorSatisfies(e -> assertThat(((InvalidQueryException) e).field()).isEqualTo("page")).verify();
        assertThat(port.calls).isEmpty();
        StepVerifier.create(browseService(port).browse(null, 9)).expectNextCount(1).verifyComplete();
        assertThat(browseCall(port)).containsExactly("browse", null, 50, 450);
    }

    @Test void browseReadsALowerCaseLetterUpperCaseAndAnEmptyOneAsNoLetter() {
        FakePort port = new FakePort();
        StepVerifier.create(browseService(port).browse("b", 2))
            .assertNext(b -> assertThat(b.letter()).isEqualTo("B")).verifyComplete();
        assertThat(browseCall(port)).containsExactly("browse", "B", 50, 100);
        for (String none : java.util.Arrays.asList(null, "")) {
            FakePort p = new FakePort();
            StepVerifier.create(browseService(p).browse(none, 0))
                .assertNext(b -> assertThat(b.letter()).isNull()).verifyComplete();
            assertThat(browseCall(p)).containsExactly("browse", null, 50, 0);
        }
        FakePort digits = new FakePort();
        StepVerifier.create(browseService(digits).browse("0-9", 0))
            .assertNext(b -> assertThat(b.letter()).isEqualTo("0-9")).verifyComplete();
        assertThat(browseCall(digits)).containsExactly("browse", "0-9", 50, 0);
        assertThat(ProductBrowse.key("z")).isEqualTo("Z");
        assertThat(ProductBrowse.key("Z")).isEqualTo("Z");
        assertThat(ProductBrowse.key("[")).isNull();
        assertThat(ProductBrowse.key("@")).isNull();
        assertThat(ProductBrowse.key("{")).isNull();
        assertThat(ProductBrowse.key("`")).isNull();
    }

    @Test void browseListsAll27LettersWithZerosAndCountsTheTotalOfTheLetter() {
        FakePort port = new FakePort();
        StepVerifier.create(browseService(port).browse(null, 0)).assertNext(b -> {
            assertThat(b.letters()).hasSize(27);
            assertThat(b.letters().get(0)).isEqualTo(new ProductBrowse.LetterCount("A", 0));
            assertThat(b.letters().get(1)).isEqualTo(new ProductBrowse.LetterCount("B", 120));
            assertThat(b.letters().get(25).letter()).isEqualTo("Z");
            assertThat(b.letters().get(26)).isEqualTo(new ProductBrowse.LetterCount("0-9", 2));
            assertThat(b.total()).isEqualTo(125);
            assertThat(b.page()).isZero();
            assertThat(b.hasMore()).isTrue();
        }).verifyComplete();
        StepVerifier.create(browseService(port).browse("B", 1))
            .assertNext(b -> { assertThat(b.total()).isEqualTo(120); assertThat(b.hasMore()).isTrue(); }).verifyComplete();
        StepVerifier.create(browseService(port).browse("B", 2))
            .assertNext(b -> { assertThat(b.total()).isEqualTo(120); assertThat(b.hasMore()).isFalse(); }).verifyComplete();
        StepVerifier.create(browseService(port).browse("Q", 0))
            .assertNext(b -> { assertThat(b.total()).isZero(); assertThat(b.hasMore()).isFalse(); }).verifyComplete();
        assertThat(ProductBrowse.KEYS).hasSize(27).startsWith("A", "B").endsWith("Y", "Z", "0-9");
    }

    /** §6.11.3: public data only, but a present internal token must still match (as P16); the port is never reached. */
    @Test void browseRefusesATokenThatDoesNotMatch() {
        FakePort port = new FakePort();
        ProductController controller = new ProductController(browseService(port), new InternalAuth(TestSupport.TOKEN));
        assertThatThrownBy(() -> controller.browse(null, 0, "not-the-token")).isInstanceOf(UnauthorizedException.class);
        assertThat(port.calls).isEmpty();
        StepVerifier.create(controller.browse("a", 0, TestSupport.TOKEN))
            .assertNext(r -> assertThat(r.data().letter()).isEqualTo("A")).verifyComplete();
        StepVerifier.create(controller.browse("a", 0, null))
            .assertNext(r -> assertThat(r.data().letter()).isEqualTo("A")).verifyComplete();
    }
}
