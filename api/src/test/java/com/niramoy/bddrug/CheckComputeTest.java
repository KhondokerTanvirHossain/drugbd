package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InteractionCheckService;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.application.port.CheckQueryPort.*;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.CheckResult.*;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.Scope;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

/** §6.7.2 counting rule and the §7.4 CheckResult (§11.1 check-summary cases at the API, §11.3 CheckApiIntegrationTest cases in pure form). */
class CheckComputeTest {
    static final List<ProductRow> PRODUCTS = List.of(
        new ProductRow("EYE", "Chloramex Eye", "Chloramphenicol 0.5%", "ophthalmic", "ok"),
        new ProductRow("CAP", "Chloramex", "Chloramphenicol 250 mg", "systemic", "ok"),
        new ProductRow("W", "Warin", "Warfarin 5 mg", "systemic", "ok"),
        new ProductRow("W2", "Coumarol", "Warfarin 5 mg", "systemic", "ok"),
        new ProductRow("A", "Asprin", "Aspirin 75 mg", "systemic", "ok"),
        new ProductRow("D", "Motigut", "Domperidone 10 mg", "systemic", "ok"),
        new ProductRow("OTIC", "Otimol", "Oticmol 5 mg", "systemic", "ok"),
        new ProductRow("NR", "Newrun", "Newrunmol 5 mg", "systemic", "ok"),
        new ProductRow("UNM", "Newdrug", "Newmol 10 mg", "systemic", "ok"),
        new ProductRow("AMC", "Moxaclav", "Amoxicillin 500 mg + Clavulanic Acid 125 mg", "systemic", "ok"),
        new ProductRow("BARE", "Herbex", "Herbal mix", null, "ok"),
        new ProductRow("HID", "Hidasprin", "Aspirin 75 mg", "systemic", "pending"));
    static final List<IngredientRow> INGREDIENTS = List.of(
        new IngredientRow("EYE", "XMC", "Chloramphenicol", "BDS-3", "Chloramphenicol", "full"),
        new IngredientRow("CAP", "XMC", "Chloramphenicol", "BDS-3", "Chloramphenicol", "full"),
        new IngredientRow("W", "XMW", "Warfarin", "BDS-1", "Warfarin", "full"),
        new IngredientRow("W2", "XMW", "Warfarin", "BDS-1", "Warfarin", "full"),
        new IngredientRow("A", "XMA", "Aspirin", "BDS-2", "Aspirin", "full"),
        new IngredientRow("HID", "XMA", "Aspirin", "BDS-2", "Aspirin", "full"),
        new IngredientRow("D", "XMD", "Domperidone", "BDS-4", "Domperidone", "none"),
        new IngredientRow("OTIC", "XMO", "Oticmol", "BDS-7", "Oticmol", "full"),
        new IngredientRow("NR", "XMN", "Newrunmol", "BDS-6", "Newrunmol", null),
        new IngredientRow("UNM", "XM0000", "Newmol", null, null, null),
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
    static final Set<String> LISTED = Set.of("DDInter1951", "DDInter20", "DDInter351", "DDInter352", "DDInter600", "DDInter700",
        "DDInter80", "DDInter90");
    static final List<PairRow> PAIRS = List.of(
        new PairRow("DDInter1951", "DDInter20", "major", List.of("Avoid"), "bleeding", "avoid it", "3039"),
        new PairRow("DDInter1951", "DDInter351", "moderate", List.of("Monitor"), "levels rise", "monitor INR", null),
        new PairRow("DDInter1951", "DDInter80", "minor", List.of(), null, null, null));
    static final Map<String, String> NAMES = Map.of("DDInter352", "Chloramphenicol (ophthalmic)", "DDInter351", "Chloramphenicol",
        "DDInter1951", "Warfarin", "DDInter20", "Acetylsalicylic acid");
    static final Instant AT = Instant.parse("2026-10-16T05:20:00Z");

    static InteractionCheckService service(Map<String, List<PairReviewRule.Decision>> reviews) {
        CheckQueryPort port = ids -> Mono.just(new CheckData(
            PRODUCTS.stream().filter(p -> ids.contains(p.conceptId())).toList(),
            INGREDIENTS.stream().filter(i -> ids.contains(i.conceptId())).toList(), CODES, LISTED, PAIRS, reviews, NAMES));
        return new InteractionCheckService(port);
    }
    static CheckResult run(Scope scope, String... ids) { return service(Map.of()).check(List.of(ids), scope).block(); }
    static NotChecked between(CheckResult r, String a, String b) {
        return r.notChecked().stream().filter(n -> n.a().conceptId().equals(a) && n.b().conceptId().equals(b)).findFirst().orElseThrow();
    }

    @Test void eyeDropsAndWarfarinAreCheckedAgainstTheOphthalmicEntryWithNoInteractionListed() {
        CheckResult r = run(Scope.PUBLIC, "EYE", "W");
        assertThat(r.alerts()).isEmpty();
        assertThat(r.noData()).isEmpty();
        assertThat(r.noInteraction()).containsExactly(new NoInteraction(
            new Side("EYE", "Chloramex Eye", "BDS-3", "Chloramphenicol", "ophthalmic"),
            new Side("W", "Warin", "BDS-1", "Warfarin", "systemic"), "DDInter352", "DDInter1951"));
        assertThat(r.products().get(0).route()).isEqualTo("ophthalmic");
        assertThat(r.products().get(0).substances().get(0).ddinter())
            .containsExactly(new Chosen("DDInter352", "Chloramphenicol (ophthalmic)", "ophthalmic", false));
        assertThat(r.summary()).isEqualTo(new Summary(2, 1, 1, 0, 1, 0, 0, new BySeverity(0, 0, 0, 0)));
    }

    @Test void capsuleAndWarfarinGiveOneModerateAlertWithItsSidesAndIds() {
        CheckResult r = run(Scope.PUBLIC, "CAP", "W");
        assertThat(r.alerts()).hasSize(1);
        Alert a = r.alerts().get(0);
        assertThat(a.severity()).isEqualTo("moderate");
        assertThat(a.a()).isEqualTo(new Side("CAP", "Chloramex", "BDS-3", "Chloramphenicol", "systemic"));
        assertThat(a.b()).isEqualTo(new Side("W", "Warin", "BDS-1", "Warfarin", "systemic"));
        assertThat(a.ddinterA()).isEqualTo("DDInter1951");
        assertThat(a.ddinterB()).isEqualTo("DDInter351");
        assertThat(a.source()).isEqualTo("DDInter 2.0");
        assertThat(a.routeAssumed()).isFalse();
        assertThat(a.pairReview()).isEqualTo(PublicPairReviews.NONE);
        assertThat(r.summary().bySeverity()).isEqualTo(new BySeverity(0, 1, 0, 0));
        assertThat(r.summary().alertPairs()).isEqualTo(1);
    }

    static PairReviewRule.Decision reviewed(String hash) {
        return new PairReviewRule.Decision(1, "reviewed", "", hash, null, AT, false);
    }

    @Test void theAlertCarriesThePublicPairReviewAndItsInteractionId() {
        String current = PairContent.hash("DDInter1951", "DDInter20", new PairContent.Content("major", List.of("Avoid"), "bleeding", "avoid it"));
        CheckResult r = service(Map.of("DDInter1951|DDInter20", List.of(reviewed(current)))).check(List.of("W", "A"), Scope.PUBLIC).block();
        assertThat(r.alerts().get(0).pairReview()).isEqualTo(new PairReviewRule.PublicReview("reviewed", AT));
        assertThat(r.alerts().get(0).interactionId()).isEqualTo("3039");
        // reviewed before DDInter changed the pair: not reviewed, no date, and the alert is still served (G3)
        CheckResult stale = service(Map.of("DDInter1951|DDInter20", List.of(reviewed("0".repeat(64))))).check(List.of("W", "A"), Scope.PUBLIC).block();
        assertThat(stale.alerts()).hasSize(1);
        assertThat(stale.alerts().get(0).pairReview()).isEqualTo(PublicPairReviews.NONE);
    }

    @Test void everyNotCheckedReasonNamesTheSideItAppliesTo() {
        CheckResult r = run(Scope.PUBLIC, "W", "D", "OTIC", "NR", "UNM");
        assertThat(between(r, "W", "D")).extracting(NotChecked::reason, NotChecked::side).containsExactly("no_data", "b");
        assertThat(between(r, "W", "OTIC")).extracting(NotChecked::reason, NotChecked::side).containsExactly("no_route", "b");
        assertThat(between(r, "W", "NR")).extracting(NotChecked::reason, NotChecked::side).containsExactly("not_run", "b");
        assertThat(between(r, "W", "UNM")).extracting(NotChecked::reason, NotChecked::side).containsExactly("unmapped", "b");
        assertThat(between(r, "W", "UNM").b()).isEqualTo(new Side("UNM", "Newdrug", null, "Newmol", null));
        // both sides unusable: the first reason in REASON_ORDER wins (no_data before no_route)
        assertThat(between(r, "D", "OTIC")).extracting(NotChecked::reason, NotChecked::side).containsExactly("no_data", "a");
        assertThat(r.summary().totalPairs()).isEqualTo(10);
        assertThat(r.summary().checkedPairs()).isEqualTo(0);
        assertThat(r.summary().notCheckedPairs()).isEqualTo(10);
        assertThat(r.alerts()).isEmpty();
        assertThat(r.noInteraction()).isEmpty();
    }

    @Test void sameProductPairsAreListedButNeverCounted() {
        CheckResult r = run(Scope.PUBLIC, "AMC", "W");
        assertThat(r.notChecked()).hasSize(1);
        NotChecked same = r.notChecked().get(0);
        assertThat(same.reason()).isEqualTo("same_product");
        assertThat(List.of(same.a().name(), same.b().name())).containsExactly("Amoxicillin", "Clavulanic acid");
        assertThat(same.a().conceptId()).isEqualTo("AMC");
        assertThat(r.summary().totalPairs()).isEqualTo(2);
        assertThat(r.summary().checkedPairs()).isEqualTo(2);
        assertThat(r.summary().alertPairs()).isEqualTo(1);
        assertThat(r.summary().noInteractionPairs()).isEqualTo(1);
        assertThat(r.summary().notCheckedPairs()).isEqualTo(0);
    }

    @Test void theSameSubstanceInTwoProductsIsADuplicateAndNotCounted() {
        CheckResult r = run(Scope.PUBLIC, "W", "W2");
        assertThat(r.duplicates()).containsExactly(new Duplicate("BDS-1", "Warfarin", List.of("W", "W2")));
        assertThat(r.alerts()).isEmpty();
        assertThat(r.noInteraction()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
        assertThat(r.summary()).isEqualTo(new Summary(2, 0, 0, 0, 0, 0, 0, new BySeverity(0, 0, 0, 0)));
    }

    @Test void notReviewedProductsCountAsMedicinesOnlyAndCarryTheirTradeName() {
        CheckResult r = run(Scope.PUBLIC, "W", "HID");
        assertThat(r.notReviewed()).containsExactly(new NotReviewed("HID", "Hidasprin"));
        assertThat(r.products()).extracting(CheckedProduct::conceptId).containsExactly("W");
        assertThat(r.summary().medicines()).isEqualTo(2);
        assertThat(r.summary().notReviewed()).isEqualTo(1);
        assertThat(r.summary().totalPairs()).isEqualTo(0);
    }

    @Test void aProductWithNoIngredientMappingIsNeverSilentlyDropped() {
        CheckResult r = run(Scope.PUBLIC, "BARE", "W");
        assertThat(between(r, "BARE", "W")).extracting(NotChecked::reason, NotChecked::side).containsExactly("unmapped", "a");
        assertThat(between(r, "BARE", "W").a().name()).isEqualTo("Herbal mix");
        assertThat(r.products().get(0).substances()).isEmpty();
        assertThat(r.noData()).containsExactly(new NoData("BARE", null, "Herbal mix"));
        assertThat(r.summary().totalPairs()).isEqualTo(1);
    }

    @Test void alertsRunMajorFirstThenByBrandPair() {
        CheckResult r = run(Scope.PUBLIC, "CAP", "W", "A", "AMC");
        assertThat(r.alerts()).extracting(Alert::severity).containsExactly("major", "moderate", "minor");
        assertThat(r.summary().bySeverity()).isEqualTo(new BySeverity(1, 1, 1, 0));
    }

    @Test void anUnlistedChosenEntryIsNotRunNeverNoInteraction() {
        CheckQueryPort port = ids -> Mono.just(new CheckData(PRODUCTS.stream().filter(p -> ids.contains(p.conceptId())).toList(),
            INGREDIENTS.stream().filter(i -> ids.contains(i.conceptId())).toList(), CODES,
            Set.of("DDInter1951"), PAIRS, Map.of(), NAMES));
        CheckResult r = new InteractionCheckService(port).check(List.of("EYE", "W"), Scope.PUBLIC).block();
        assertThat(r.noInteraction()).isEmpty();
        assertThat(between(r, "EYE", "W")).extracting(NotChecked::reason, NotChecked::side).containsExactly("not_run", "a");
        assertThat(r.products().get(0).substances().get(0).ddinter()).isEmpty();
    }

    /** Two BDS ids the mapping resolves to one DDInter entry (a salt and its base): DDInter never assesses an entry against itself. */
    static CheckResult sameEntry(List<DdinterCode> besilateCodes, List<PairRow> pairs, String... ids) {
        CheckQueryPort port = q -> Mono.just(new CheckData(
            List.of(new ProductRow("AMB", "Amlobes", "Amlodipine besilate 5 mg", "systemic", "ok"),
                new ProductRow("AML", "Amlonor", "Amlodipine 5 mg", "systemic", "ok")),
            List.of(new IngredientRow("AMB", "XMAB", "Amlodipine besilate", "BDS-1", "Amlodipine besilate", "full"),
                new IngredientRow("AML", "XMAL", "Amlodipine", "BDS-2", "Amlodipine", "full")),
            Map.of("BDS-1", besilateCodes, "BDS-2", List.of(new DdinterCode("DDInter100", "systemic"))),
            Set.of("DDInter100", "DDInter101"), pairs, Map.of(), Map.of()));
        return new InteractionCheckService(port).check(List.of(ids), Scope.PUBLIC).block();
    }

    @Test void twoSubstancesSharingOneDdinterEntryAreADuplicateNeverNoInteractionListed() {
        List<DdinterCode> shared = List.of(new DdinterCode("DDInter100", "systemic"));
        CheckResult r = sameEntry(shared, List.of(), "AMB", "AML");
        assertThat(r.noInteraction()).isEmpty();
        assertThat(r.alerts()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
        assertThat(r.duplicates()).containsExactly(new Duplicate("BDS-1", "Amlodipine besilate", List.of("AMB", "AML")));
        assertThat(r.summary()).isEqualTo(new Summary(2, 0, 0, 0, 0, 0, 0, new BySeverity(0, 0, 0, 0)));
        // listed under the smaller BDS id whichever product comes first, conceptIds in request order
        assertThat(sameEntry(shared, List.of(), "AML", "AMB").duplicates())
            .containsExactly(new Duplicate("BDS-1", "Amlodipine besilate", List.of("AML", "AMB")));
    }

    @Test void aSharedEntryNeverHidesAStoredRowOfAnotherChosenEntry() {
        List<DdinterCode> two = List.of(new DdinterCode("DDInter100", "systemic"), new DdinterCode("DDInter101", "systemic"));
        CheckResult r = sameEntry(two, List.of(new PairRow("DDInter100", "DDInter101", "moderate", List.of(), "x", "y", null)),
            "AMB", "AML");
        assertThat(r.alerts()).singleElement().extracting(Alert::ddinterA, Alert::ddinterB).containsExactly("DDInter100", "DDInter101");
        assertThat(r.duplicates()).isEmpty();
        assertThat(r.noInteraction()).isEmpty();
        assertThat(r.summary()).isEqualTo(new Summary(2, 1, 1, 1, 0, 0, 0, new BySeverity(0, 1, 0, 0)));
    }
}
