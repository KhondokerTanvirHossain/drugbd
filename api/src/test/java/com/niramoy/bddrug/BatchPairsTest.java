package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.BatchPairs.NotChecked;
import com.niramoy.bddrug.domain.BatchPairs.Pair;
import com.niramoy.bddrug.domain.BatchPairs.PairRow;
import com.niramoy.bddrug.domain.BatchPairs.PartnerRef;
import com.niramoy.bddrug.domain.BatchPairs.Product;
import com.niramoy.bddrug.domain.BatchPairs.Substance;
import com.niramoy.bddrug.domain.DdinterCode;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;

/** §5.6.2 batch pairs with RouteRule on both sides; the eye drop is checked against DDInter352 (§1.5). */
class BatchPairsTest {
    static DdinterCode dd(String id, String scope) { return new DdinterCode(id, scope); }
    static Substance sub(String bds, String name, String coverage, DdinterCode... codes) {
        return new Substance(bds, name, coverage, List.of(codes));
    }
    static Product p(String id, int index, String route, Substance... s) { return new Product(id, id + " brand", index, route, List.of(s)); }

    static final Substance WARFARIN = sub("BDS-1", "Warfarin", "full", dd("DDInter1951", "systemic"));
    static final Substance ASPIRIN = sub("BDS-2", "Acetylsalicylic acid", "full", dd("DDInter20", "systemic"));
    static final Substance CHLORAMPHENICOL = sub("BDS-3", "Chloramphenicol", "full",
        dd("DDInter351", "systemic"), dd("DDInter352", "ophthalmic"), dd("DDInter353", "otic"));
    static final Substance DOMPERIDONE = sub("BDS-4", "Domperidone", "none");
    static final Substance NEWMOL = sub(null, "Newmol", "not_run");
    static final Substance MUPIROCIN = sub("BDS-6", "Mupirocin", "full", dd("DDInter900", "topical"));
    static final Substance NEWCILLIN = sub("BDS-7", "Newcillin", "not_run");
    static final Substance AMOXICILLIN = sub("BDS-8", "Amoxicillin", "full", dd("DDInter83", "systemic"));
    static final Substance CLAVULANIC = sub("BDS-9", "Clavulanic acid", "full", dd("DDInter394", "systemic"));

    static final List<Product> BATCH = List.of(
        p("W", 1, "systemic", WARFARIN), p("W2", 2, "systemic", WARFARIN), p("A", 3, "systemic", ASPIRIN),
        p("EYE", 4, "ophthalmic", CHLORAMPHENICOL), p("CAP", 5, "systemic", CHLORAMPHENICOL), p("D", 6, "systemic", DOMPERIDONE),
        p("NEW", 7, "systemic", NEWMOL), p("NASAL", 8, "nasal", MUPIROCIN), p("NR", 9, "systemic", NEWCILLIN),
        p("COMBO", 10, "systemic", AMOXICILLIN, CLAVULANIC));

    static final List<PairRow> ROWS = List.of(
        new PairRow("DDInter1951", "DDInter20", "Warfarin", "Acetylsalicylic acid", "major", List.of("synergy"),
            "Aspirin may increase the anticoagulant effect of warfarin.", "Avoid the combination; monitor INR."),
        new PairRow("DDInter1951", "DDInter351", "Warfarin", "Chloramphenicol", "moderate", List.of("metabolism"), null, null),
        new PairRow("DDInter1951", "DDInter83", "Warfarin", "Amoxicillin", "minor", List.of(), null, null),
        new PairRow("DDInter20", "DDInter83", "Acetylsalicylic acid", "Amoxicillin", "unknown", List.of("unknown"), null, null),
        new PairRow("DDInter14", "DDInter1951", "Acetaminophen", "Warfarin", "moderate", List.of(), null, null));

    static final Set<String> COMPLETE = Set.of("DDInter1951", "DDInter20", "DDInter351", "DDInter352", "DDInter353",
        "DDInter83", "DDInter394");

    static PartnerRef ref(String id, int index) { return new PartnerRef(id, id + " brand", index); }

    @Test void theEyeDropIsCheckedAgainstTheOphthalmicEntryAndHasNoPilotPair() {
        BatchPairs.Result r = BatchPairs.compute("EYE", BATCH, ROWS, COMPLETE);
        assertThat(r.totalBatchPairs()).isEqualTo(4);
        assertThat(r.pairs()).isEmpty();
        assertThat(r.notChecked()).containsExactly(
            new NotChecked("Chloramphenicol", "Domperidone", List.of(ref("D", 6)), "no_data", "partner", "systemic"),
            new NotChecked("Chloramphenicol", "Newmol", List.of(ref("NEW", 7)), "unmapped", "partner", "systemic"),
            new NotChecked("Chloramphenicol", "Mupirocin", List.of(ref("NASAL", 8)), "no_route", "partner", "nasal"),
            new NotChecked("Chloramphenicol", "Newcillin", List.of(ref("NR", 9)), "not_run", "partner", "systemic"));
    }

    @Test void warfarinPairsAreRouteChosenOrderedBySeverityAndNeverWithItsOwnSubstance() {
        BatchPairs.Result r = BatchPairs.compute("W", BATCH, ROWS, COMPLETE);
        assertThat(r.pairs()).extracting(Pair::ddinterA, Pair::ddinterB, Pair::severity, Pair::partnerSubstance)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("DDInter1951", "DDInter20", "major", "Acetylsalicylic acid"),
                org.assertj.core.groups.Tuple.tuple("DDInter1951", "DDInter351", "moderate", "Chloramphenicol"),
                org.assertj.core.groups.Tuple.tuple("DDInter1951", "DDInter83", "minor", "Amoxicillin"));
        assertThat(r.pairs().get(1).partners()).as("the capsule, never the eye drop").containsExactly(ref("CAP", 5));
        assertThat(r.pairs().get(0).substance()).isEqualTo("Warfarin");
        assertThat(r.pairs().get(0).management()).isEqualTo("Avoid the combination; monitor INR.");
        assertThat(r.pairs()).noneMatch(x -> x.partners().contains(ref("W2", 2)));
    }

    @Test void onePairIsListedOnceWithEveryRecordThatCarriesThePartner() {
        BatchPairs.Result r = BatchPairs.compute("A", BATCH, ROWS, COMPLETE);
        assertThat(r.pairs()).hasSize(2);
        assertThat(r.pairs().get(0).partners()).containsExactly(ref("W", 1), ref("W2", 2));
        assertThat(r.pairs().get(1).severity()).isEqualTo("unknown");
        assertThat(r.pairs().get(1).partners()).containsExactly(ref("COMBO", 10));
    }

    @Test void aNoDataRecordListsEveryPartnerAsNotCheckedOnItsOwnSide() {
        BatchPairs.Result r = BatchPairs.compute("D", BATCH, ROWS, COMPLETE);
        assertThat(r.pairs()).isEmpty();
        assertThat(r.notChecked()).allMatch(n -> n.reason().equals("no_data") && n.side().equals("this"));
        assertThat(r.notChecked()).extracting(NotChecked::partnerSubstance).containsExactly("Warfarin", "Acetylsalicylic acid",
            "Chloramphenicol", "Newmol", "Mupirocin", "Newcillin", "Amoxicillin", "Clavulanic acid");
        assertThat(r.notChecked().get(0).partners()).containsExactly(ref("W", 1), ref("W2", 2));
        assertThat(r.notChecked().get(2).partners()).containsExactly(ref("EYE", 4), ref("CAP", 5));
    }

    @Test void aCombinationProductListsItsOwnPairAsSameProduct() {
        BatchPairs.Result r = BatchPairs.compute("COMBO", BATCH, ROWS, COMPLETE);
        assertThat(r.notChecked()).contains(
            new NotChecked("Amoxicillin", "Clavulanic acid", List.of(), "same_product", "this", "systemic"));
        assertThat(r.pairs()).extracting(Pair::substance).containsOnly("Amoxicillin");
    }

    @Test void anEntryWithoutACompletePairListIsNotRun() {
        Set<String> incomplete = Set.of("DDInter20", "DDInter351", "DDInter352", "DDInter353", "DDInter83", "DDInter394");
        BatchPairs.Result r = BatchPairs.compute("A", BATCH, ROWS, incomplete);
        assertThat(r.pairs()).extracting(Pair::ddinterA).containsExactly("DDInter20");
        assertThat(r.notChecked()).contains(
            new NotChecked("Acetylsalicylic acid", "Warfarin", List.of(ref("W", 1), ref("W2", 2)), "not_run", "partner", "systemic"));
    }

    @Test void anAbsentRecordGetsOnlyTheBatchCount() {
        BatchPairs.Result r = BatchPairs.compute("NOPE", BATCH, ROWS, COMPLETE);
        assertThat(r.totalBatchPairs()).isEqualTo(4);
        assertThat(r.pairs()).isEmpty();
        assertThat(r.notChecked()).isEmpty();
    }

    @Test void twoPartnersWithTheSameSubstanceAndReasonButDifferentRoutesStayTwoEntriesEachWithItsOwnRoute() {
        List<Product> batch = List.of(p("W", 1, "systemic", WARFARIN), p("MN", 2, "nasal", MUPIROCIN), p("MO", 3, "otic", MUPIROCIN));
        BatchPairs.Result r = BatchPairs.compute("W", batch, ROWS, COMPLETE);
        assertThat(r.notChecked()).containsExactly(
            new NotChecked("Warfarin", "Mupirocin", List.of(ref("MN", 2)), "no_route", "partner", "nasal"),
            new NotChecked("Warfarin", "Mupirocin", List.of(ref("MO", 3)), "no_route", "partner", "otic"));
    }

    @Test void twoPartnersWithTheSameSubstanceReasonAndRouteMergeIntoOneEntryWithBothPartners() {
        List<Product> batch = List.of(p("W", 1, "systemic", WARFARIN), p("MN", 2, "nasal", MUPIROCIN), p("MN2", 3, "nasal", MUPIROCIN));
        BatchPairs.Result r = BatchPairs.compute("W", batch, ROWS, COMPLETE);
        assertThat(r.notChecked()).containsExactly(
            new NotChecked("Warfarin", "Mupirocin", List.of(ref("MN", 2), ref("MN2", 3)), "no_route", "partner", "nasal"));
    }

    @Test void aNullRoutePartnerStaysApartFromANamedRoutePartner() {
        List<Product> batch = List.of(p("W", 1, "systemic", WARFARIN), p("MN", 2, "nasal", MUPIROCIN), p("MX", 3, null, MUPIROCIN));
        BatchPairs.Result r = BatchPairs.compute("W", batch, ROWS, COMPLETE);
        assertThat(r.notChecked()).extracting(NotChecked::route).containsExactly("nasal", null);
    }
}
