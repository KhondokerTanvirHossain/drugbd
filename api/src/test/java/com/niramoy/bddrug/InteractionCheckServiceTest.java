package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InteractionCheckService;
import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.application.port.CheckQueryPort.CheckData;
import com.niramoy.bddrug.application.port.CheckQueryPort.IngredientRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.PairRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.ProductRow;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.DdinterCode;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;

class InteractionCheckServiceTest {
    static final List<ProductRow> PRODUCTS = List.of(
        new ProductRow("W", "Warin", "Warfarin 5 mg", "systemic"),
        new ProductRow("EYE", "Optimycin", "Chloramphenicol 0.5%", "ophthalmic"),
        new ProductRow("CAP", "Chloramex", "Chloramphenicol 250 mg", "systemic"),
        new ProductRow("NOBDC", "Asprin Plus", "Aspirin 75 mg + herb", null),
        new ProductRow("D", "Motigut", "Domperidone 10 mg", "systemic"),
        new ProductRow("NOCOV", "Newcov", "Newcovmol 5 mg", "systemic"),
        new ProductRow("OTIC", "Otimol", "Oticmol 5 mg", "systemic"),
        new ProductRow("AMC", "Moxaclav", "Amoxicillin 500 mg + Clavulanic Acid 125 mg", "systemic"),
        new ProductRow("W2", "Coumarol", "Warfarin 5 mg", "systemic"));
    static final List<IngredientRow> INGREDIENTS = List.of(
        new IngredientRow("W", "XMW", "Warfarin", "BDS-1", "Warfarin", "full"),
        new IngredientRow("W2", "XMW", "Warfarin", "BDS-1", "Warfarin", "full"),
        new IngredientRow("EYE", "XMC", "Chloramphenicol", "BDS-3", "Chloramphenicol", "full"),
        new IngredientRow("CAP", "XMC", "Chloramphenicol", "BDS-3", "Chloramphenicol", "full"),
        new IngredientRow("NOBDC", "XMA", "Aspirin", "BDS-2", "Aspirin", "full"),
        new IngredientRow("D", "XMD", "Domperidone", "BDS-4", "Domperidone", "none"),
        new IngredientRow("NOCOV", "XMN", "Newcovmol", "BDS-6", "Newcovmol", null),
        new IngredientRow("OTIC", "XMO", "Oticmol", "BDS-7", "Oticmol", "full"),
        new IngredientRow("AMC", "XMAM", "Amoxicillin", "BDS-8", "Amoxicillin", "full"),
        new IngredientRow("AMC", "XMCL", "Clavulanic acid", "BDS-9", "Clavulanic acid", "full"));
    static final Map<String, List<DdinterCode>> CODES = Map.of(
        "BDS-1", List.of(new DdinterCode("DDInter1951", "systemic")),
        "BDS-2", List.of(new DdinterCode("DDInter20", "systemic")),
        "BDS-3", List.of(new DdinterCode("DDInter351", "systemic"), new DdinterCode("DDInter352", "ophthalmic")),
        "BDS-6", List.of(new DdinterCode("DDInter600", "systemic")),
        "BDS-7", List.of(new DdinterCode("DDInter700", "otic")),
        "BDS-8", List.of(new DdinterCode("DDInter80", "systemic")),
        "BDS-9", List.of(new DdinterCode("DDInter90", "systemic")));
    static final List<PairRow> PAIRS = List.of(
        new PairRow("DDInter1951", "DDInter20", "major", List.of("Avoid"), "bleeding", "avoid it"),
        new PairRow("DDInter1951", "DDInter351", "minor", List.of(), null, null),
        new PairRow("DDInter1951", "DDInter352", "moderate", List.of("Monitor"), "eye text", "monitor INR"),
        new PairRow("DDInter1951", "DDInter700", "major", List.of(), null, null),
        new PairRow("DDInter80", "DDInter90", "major", List.of(), null, null));

    static class FakePort implements CheckQueryPort {
        final List<List<String>> calls = new ArrayList<>();
        public Mono<CheckData> load(List<String> conceptIds) {
            calls.add(conceptIds);
            return Mono.just(new CheckData(
                PRODUCTS.stream().filter(p -> conceptIds.contains(p.conceptId())).toList(),
                INGREDIENTS.stream().filter(i -> conceptIds.contains(i.conceptId())).toList(), CODES, PAIRS));
        }
    }

    final FakePort port = new FakePort();
    final InteractionCheckService service = new InteractionCheckService(port);

    private CheckResult check(String... ids) { return service.check(Arrays.asList(ids)).block(); }

    @Test void rejectsInvalidIdListsWithoutQuerying() {
        List<List<String>> bad = new ArrayList<>();
        bad.add(null);
        bad.add(List.of());
        bad.add(List.of("W"));
        bad.add(List.of("W", "W"));
        bad.add(List.of("W", " "));
        bad.add(Arrays.asList("W", null));
        bad.add(IntStream.rangeClosed(1, 21).mapToObj(i -> "P" + i).toList());
        for (List<String> ids : bad) {
            StepVerifier.create(service.check(ids))
                .expectErrorSatisfies(e -> {
                    assertThat(e).isInstanceOf(InvalidQueryException.class);
                    assertThat(((InvalidQueryException) e).field()).isEqualTo("conceptIds");
                }).verify();
        }
        assertThat(port.calls).isEmpty();
    }

    @Test void unknownIdIsNotFound() {
        StepVerifier.create(service.check(List.of("W", "missing")))
            .expectErrorSatisfies(e -> assertThat(e).isInstanceOf(NotFoundException.class).hasMessage("Product not found: missing"))
            .verify();
    }

    @Test void eyeProductUsesOnlyTheOphthalmicEntry() {
        CheckResult r = check("EYE", "W");
        assertThat(r.alerts()).hasSize(1);
        var alert = r.alerts().get(0);
        assertThat(alert.severity()).isEqualTo("moderate");
        assertThat(alert.interaction()).isEqualTo("eye text");
        assertThat(alert.routeAssumed()).isFalse();
        assertThat(alert.a().conceptId()).isEqualTo("EYE");
        assertThat(alert.b().bdsId()).isEqualTo("BDS-1");
        assertThat(alert.source()).isEqualTo("DDInter 2.0");
        // the systemic capsule gets the systemic entry's pair instead
        assertThat(check("CAP", "W").alerts()).extracting(a -> a.severity()).containsExactly("minor");
    }

    @Test void productWithoutRouteAssumesIt() {
        var alerts = check("NOBDC", "W").alerts();
        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0).routeAssumed()).isTrue();
        assertThat(alerts.get(0).severity()).isEqualTo("major");
    }

    @Test void noCoverageMissingCoverageAndNoRouteEntryAreAllNoData() {
        CheckResult r = check("W", "D", "NOCOV", "OTIC");
        assertThat(r.alerts()).isEmpty();
        assertThat(r.noData()).extracting(n -> n.conceptId() + "/" + n.bdsId() + "/" + n.name())
            .containsExactly("D/BDS-4/Domperidone", "NOCOV/BDS-6/Newcovmol", "OTIC/BDS-7/Oticmol");
        assertThat(r.products()).hasSize(4);
        assertThat(r.products().get(2).substances().get(0).coverage()).isEqualTo("none");
    }

    @Test void sameSubstanceInTwoProductsIsADuplicateNotAnAlert() {
        CheckResult r = check("W", "W2");
        assertThat(r.alerts()).isEmpty();
        assertThat(r.duplicates()).hasSize(1);
        assertThat(r.duplicates().get(0).bdsId()).isEqualTo("BDS-1");
        assertThat(r.duplicates().get(0).conceptIds()).containsExactly("W", "W2");
    }

    @Test void ingredientsOfOneProductDoNotAlertEachOther() {
        assertThat(check("AMC", "W").alerts()).isEmpty();
        assertThat(check("AMC", "W").products().get(0).substances()).extracting(s -> s.name())
            .containsExactly("Amoxicillin", "Clavulanic acid");
    }

    @Test void alertsAreOrderedBySeverity() {
        var alerts = check("CAP", "W", "NOBDC").alerts();
        assertThat(alerts).extracting(a -> a.severity()).containsExactly("major", "minor");
    }
}
