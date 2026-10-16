package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.PublicPairs;
import com.niramoy.bddrug.domain.PublicPairs.*;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;

class PublicPairsTest {
    static BatchPairs.Substance sub(String bds, String name, String coverage, DdinterCode... codes) {
        return new BatchPairs.Substance(bds, name, coverage, List.of(codes));
    }
    static DdinterCode sys(String id) { return new DdinterCode(id, "systemic"); }

    static final BatchPairs.Substance ACETAMINOPHEN = sub("BDS-1", "Acetaminophen", "full", sys("DDInter14"));
    static final BatchPairs.Substance WARFARIN = sub("BDS-3", "Warfarin", "full", sys("DDInter1951"));
    static final BatchPairs.Substance CHLOR = sub("BDS-9", "Chloramphenicol", "full", sys("DDInter351"),
        new DdinterCode("DDInter352", "ophthalmic"));
    static final List<Partner> PARTNERS = List.of(
        new Partner("NAPA", "Napa", "systemic", List.of(ACETAMINOPHEN)),                          // this product: skipped
        new Partner("ACE", "Ace", "systemic", List.of(ACETAMINOPHEN)),                            // same substance: skipped
        new Partner("GW", "G Warfarin", "systemic", List.of(WARFARIN)),
        new Partner("WA", "Warin", "systemic", List.of(WARFARIN)),
        new Partner("EYE", "Chloramex Eye", "ophthalmic", List.of(CHLOR)),                         // DDInter352: no row
        new Partner("CAP", "Chloramex", "systemic", List.of(CHLOR)),
        new Partner("DOM", "Motigut", "systemic", List.of(sub("BDS-10", "Domperidone", "none"))),
        new Partner("OTI", "Otimol", "systemic", List.of(sub("BDS-7", "Oticmol", "full", new DdinterCode("DDInter700", "otic")))),
        new Partner("ASP", "Asprin", "systemic", List.of(sub("BDS-4", "Aspirin", "full", sys("DDInter20")))),
        new Partner("AMX", "Moxaclav", "systemic", List.of(sub("BDS-8", "Amoxicillin", "full", sys("DDInter83")),
            sub("BDS-11", "Clavulanic acid", "full", sys("DDInter394")))),
        new Partner("HERB", "Herbex", null, List.of(sub("BDS-12", "Herbalol", "full", sys("DDInter500")))));
    static final List<Row> ROWS = List.of(
        new Row("DDInter14", "DDInter1951", "moderate", List.of("synergy"), "potentiates", "monitor INR"),
        new Row("DDInter14", "DDInter20", "unknown", List.of("unknown"), null, "None"),
        new Row("DDInter14", "DDInter351", "unknown", List.of("unknown"), null, null),
        new Row("DDInter14", "DDInter83", "unknown", List.of("unknown"), null, null),
        new Row("DDInter14", "DDInter500", "minor", List.of(), null, null));
    static final Set<String> COMPLETE = Set.of("DDInter14", "DDInter1951", "DDInter20", "DDInter351", "DDInter352", "DDInter700",
        "DDInter83", "DDInter394", "DDInter500");

    static Result napa(List<Partner> partners, List<Row> rows, Map<String, PairReviewRule.PublicReview> reviews, int page) {
        return PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), partners, rows, COMPLETE, reviews, page);
    }

    @Test void groupsByPartnerSubstanceWithEveryPublicBrandMajorFirst() {
        Result r = napa(PARTNERS, ROWS, Map.of(), 0);
        assertThat(r.conceptId()).isEqualTo("NAPA");
        assertThat(r.totalPartners()).isEqualTo(7);
        assertThat(r.partners()).extracting(p -> p.partnerSubstance().name() + ":" + p.severity())
            .containsExactly("Warfarin:moderate", "Herbalol:minor", "Amoxicillin:unknown", "Aspirin:unknown", "Chloramphenicol:unknown");
        Pair w = r.partners().get(0);
        assertThat(w.substance()).isEqualTo(new SubstanceRef("BDS-1", "Acetaminophen"));
        assertThat(w.brands()).containsExactly(new Brand("GW", "G Warfarin"), new Brand("WA", "Warin"));
        assertThat(w.brandCount()).isEqualTo(2);
        assertThat(w.management()).isEqualTo("monitor INR");
        assertThat(w.source()).isEqualTo("DDInter 2.0");
        assertThat(w.pairReview()).isEqualTo(PublicPairReviews.NONE);
        assertThat(w.routeAssumed()).isFalse();
    }

    @Test void theEyeDropBrandNeverJoinsTheSystemicChloramphenicolPair() {
        Pair c = napa(PARTNERS, ROWS, Map.of(), 0).partners().stream()
            .filter(p -> p.partnerSubstance().name().equals("Chloramphenicol")).findFirst().orElseThrow();
        assertThat(c.brands()).containsExactly(new Brand("CAP", "Chloramex"));
        assertThat(c.ddinterB()).isEqualTo("DDInter351");
    }

    @Test void unusablePartnersAreNotCheckedWithTheirReasonNeverDropped() {
        Result r = napa(PARTNERS, ROWS, Map.of(), 0);
        assertThat(r.notChecked()).containsExactly(
            new NotChecked(new SubstanceRef("BDS-1", "Acetaminophen"), new SubstanceRef("BDS-10", "Domperidone"), "no_data", null,
                List.of(new Brand("DOM", "Motigut")), 1),
            new NotChecked(new SubstanceRef("BDS-1", "Acetaminophen"), new SubstanceRef("BDS-7", "Oticmol"), "no_route", "systemic",
                List.of(new Brand("OTI", "Otimol")), 1));
    }

    @Test void aPartnerWithNoStoredRowIsLeftOut() {
        assertThat(napa(PARTNERS, ROWS, Map.of(), 0).partners()).noneMatch(p -> p.partnerSubstance().name().equals("Clavulanic acid"));
    }

    @Test void aPlaceholderTextIsNoText() {
        Pair a = napa(PARTNERS, ROWS, Map.of(), 0).partners().stream()
            .filter(p -> p.partnerSubstance().name().equals("Aspirin")).findFirst().orElseThrow();
        assertThat(a.management()).isNull();
    }

    @Test void aPartnerWithNoRouteIsRouteAssumed() {
        Pair h = napa(PARTNERS, ROWS, Map.of(), 0).partners().get(1);
        assertThat(h.partnerSubstance().name()).isEqualTo("Herbalol");
        assertThat(h.routeAssumed()).isTrue();
    }

    @Test void theReviewStateComesFromThePairKey() {
        PairReviewRule.PublicReview reviewed = new PairReviewRule.PublicReview("reviewed", Instant.parse("2026-10-16T05:20:00Z"));
        assertThat(napa(PARTNERS, ROWS, Map.of("DDInter14|DDInter1951", reviewed), 0).partners().get(0).pairReview()).isEqualTo(reviewed);
    }

    @Test void brandsAreCappedButCountedInFull() {
        List<Partner> many = new ArrayList<>();
        IntStream.range(0, 60).forEach(i -> many.add(new Partner("W" + i, String.format("Warfarin brand %02d", i), "systemic", List.of(WARFARIN))));
        Pair w = napa(many, ROWS, Map.of(), 0).partners().get(0);
        assertThat(w.brands()).hasSize(50);
        assertThat(w.brandCount()).isEqualTo(60);
        assertThat(w.brands().get(0).tradeName()).isEqualTo("Warfarin brand 00");
    }

    @Test void pagesHoldTwentyPartnerSubstances() {
        List<Partner> many = new ArrayList<>();
        List<Row> rows = new ArrayList<>();
        IntStream.range(0, 25).forEach(i -> {
            String id = "DDInter" + (1000 + i);
            many.add(new Partner("P" + i, "Brand " + i, "systemic", List.of(sub("BDS-" + (100 + i), String.format("Partner %02d", i), "full", sys(id)))));
            rows.add(new Row("DDInter14", id, "unknown", List.of(), null, null));
        });
        Set<String> complete = new HashSet<>(COMPLETE);
        rows.forEach(r -> complete.add(r.ddinterB()));
        Result p0 = PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), many, rows, complete, Map.of(), 0);
        Result p1 = PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), many, rows, complete, Map.of(), 1);
        Result p9 = PublicPairs.compute("NAPA", "systemic", List.of(ACETAMINOPHEN), many, rows, complete, Map.of(), 9);
        assertThat(p0.totalPartners()).isEqualTo(25);
        assertThat(p0.partners()).hasSize(20);
        assertThat(p1.partners()).hasSize(5);
        assertThat(p1.partners().get(0).partnerSubstance().name()).isEqualTo("Partner 20");
        assertThat(p9.partners()).isEmpty();
        assertThat(p9.page()).isEqualTo(9);
    }

    @Test void anUnusableSubstanceOfThisProductTakesNoPart() {
        Result r = PublicPairs.compute("DOMP", "systemic", List.of(sub("BDS-10", "Domperidone", "none")), PARTNERS, ROWS, COMPLETE, Map.of(), 0);
        assertThat(r.totalPartners()).isZero();
        assertThat(r.partners()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
    }
}
