package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.*;
import com.niramoy.bddrug.domain.PublicProducts.Facts;
import com.niramoy.bddrug.domain.PublicProducts.StageRow;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;

class PublicProductsTest {
    static final Instant EXTRACTED = Instant.parse("2026-10-11T21:28:00Z"), APPROVED = Instant.parse("2026-10-14T05:20:00Z"),
        FETCHED = Instant.parse("2026-10-11T21:00:00Z");
    static final ClinicalDrug CD = new ClinicalDrug("BDC-000001", "Acetaminophen 500 mg tablet", "Tablet", "systemic",
        List.of(new ClinicalIngredient("BDS-000001", "Acetaminophen", new BigDecimal("500"), "mg", null, null,
            List.of(new ClinicalIngredient.DdinterRef("DDInter14", "Acetaminophen", "systemic", false)))));
    static final Product NAPA = new Product("186-0030-006--napa", "186-0030-006", "Napa", "Beximco Pharmaceuticals Ltd.", "Tablet",
        "Paracetamol 500 mg", null, List.of(new Ingredient("XM5DJ7", "Paracetamol")), "parsed", null, CD, "ok");
    static final IngredientSummary SUMMARY = new IngredientSummary("BDS-000001", "Acetaminophen", "Paracetamol 500 mg",
        new BigDecimal("500"), "mg", null, null, List.of(), List.of(), new IngredientSummary.Coverage("full", ""),
        new IngredientSummary.Ddinter(List.of(), List.of()));

    static Facts facts(List<StageRow> stages, Set<String> publicIds) {
        return new Facts("0001-pilot", EXTRACTED, APPROVED, FETCHED, stages,
            Map.of("DDInter14", "Acetaminophen", "DDInter1675", "Simvastatin", "DDInter1951", "Warfarin"),
            Map.of("DDInter14|DDInter1675", "unknown", "DDInter14|DDInter1951", "moderate"), publicIds, 0, List.of(SUMMARY));
    }

    static final List<StageRow> STAGES = List.of(
        new StageRow("ddinter", "warn", "DDInter text not found for DDInter14/DDInter1675; DDInter text not found for DDInter14/DDInter1951",
            List.of(new String[]{"DDInter14", "DDInter1675"}, new String[]{"DDInter14", "DDInter1951"})),
        new StageRow("dgda", "ok", "", List.of()), new StageRow("clinical", "ok", "", List.of()), new StageRow("substances", "ok", "", List.of()));

    @Test void verificationSaysPharmacistWhateverTheApproverRole() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14")));
        assertThat(p.verification()).isEqualTo(new PublicProduct.Verification("approved", "pharmacist", APPROVED));
    }

    @Test void provenanceNamesTheBatchStampAndTheDgdaSource() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14")));
        assertThat(p.provenance().batchId()).isEqualTo("0001-pilot");
        assertThat(p.provenance().extractedAt()).isEqualTo(EXTRACTED);
        assertThat(p.provenance().source()).isEqualTo("DGDA register");
        assertThat(p.provenance().sourceLink()).isEqualTo(SourceLinks.brand("186-0030-006--napa", FETCHED));
        assertThat(p.provenance().sourceLink().label()).isEqualTo("DGDA register (OCL)");
    }

    @Test void stagesComeInPipelineOrder() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14")));
        assertThat(p.provenance().stages()).extracting(PublicProduct.Stage::stage).containsExactly("dgda", "substances", "clinical", "ddinter");
    }

    // Review Focus 1: the pipeline wrote the note against every product of the batch; only pairs whose two entries are
    // both carried by public products may be named in public (§7.4 visibility rule).
    @Test void textMissingPairsNameOnlyPublicSubstances() {
        PublicProduct.Stage ddinter = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14", "DDInter1951")))
            .provenance().stages().get(3);
        assertThat(ddinter.textMissing()).containsExactly(
            new PublicProduct.TextMissing("DDInter14", "Acetaminophen", "DDInter1951", "Warfarin", "moderate"));
        // the raw "text not found" notes are never sent: their ids could name a private partner
        assertThat(ddinter.notes()).noneMatch(n -> StageNotes.TEXT_MISSING.equals(n.kind()));
        assertThat(ddinter.status()).isEqualTo("warn");
        // with no public partner at all, the list is empty and nothing names Simvastatin or Warfarin
        PublicProduct.Stage none = PublicProducts.assemble(NAPA, facts(STAGES, Set.of("DDInter14"))).provenance().stages().get(3);
        assertThat(none.textMissing()).isEmpty();
        assertThat(none.toString()).doesNotContain("Simvastatin", "Warfarin", "DDInter1675", "DDInter1951");
    }

    @Test void otherNotesAreKeptAsParsed() {
        List<StageRow> stages = List.of(new StageRow("ddinter", "warn", "DDInter DDInter14 matched by name only", List.of()));
        assertThat(PublicProducts.assemble(NAPA, facts(stages, Set.of())).provenance().stages().get(0).notes())
            .extracting(StageNotes.Note::kind).containsExactly(StageNotes.NAME_ONLY);
    }

    @Test void eachClinicalIngredientCarriesItsSummary() {
        PublicProduct p = PublicProducts.assemble(NAPA, facts(STAGES, Set.of()));
        assertThat(p.clinicalDrug().bdcId()).isEqualTo("BDC-000001");
        assertThat(p.clinicalDrug().ingredients()).hasSize(1);
        assertThat(p.clinicalDrug().ingredients().get(0).summary()).isEqualTo(SUMMARY);
        assertThat(p.clinicalDrug().ingredients().get(0).ddinter()).extracting(ClinicalIngredient.DdinterRef::ddinterId).containsExactly("DDInter14");
    }

    @Test void noClinicalDrugStaysNull() {
        Product bare = new Product("x", "1", "X", "Co", "Tablet", "X 5 mg", null, List.of(), "parsed", null, null, "ok");
        assertThat(PublicProducts.assemble(bare, facts(List.of(), Set.of())).clinicalDrug()).isNull();
    }

    @Test void neverSendsTheInternalReviewStatus() {
        assertThat(java.util.Arrays.stream(PublicProduct.class.getRecordComponents()).map(c -> c.getName()))
            .doesNotContain("reviewStatus").contains("verification", "provenance", "otherBrandsCount");
    }

    static ReviewDecision rd(long id, String decision, String role, Instant at) {
        return new ReviewDecision(id, decision, null, null, role, at);
    }

    // Spec gap 10, §5.2 (D57): the newest counted pharmacist or senior ok of the latest item; a dismissal is a boundary.
    @Test void theVerificationDateIsTheNewestCountedOkOfTheLatestItem() {
        Instant t1 = EXTRACTED.plusSeconds(3600), t2 = t1.plusSeconds(600), t3 = t2.plusSeconds(600), t4 = t3.plusSeconds(600);
        // a pharmacist ok, an issue, a senior's dismissal, then a new ok: the new ok dates it
        assertThat(PublicProducts.approvedAt(List.of(rd(1, "ok", "pharmacist", t1), rd(2, "issue", "pharmacist", t2),
            rd(3, "dismiss", "senior", t3), rd(4, "ok", "pharmacist", t4)), EXTRACTED)).isEqualTo(t4);
        // any input order; an engineer's later ok never dates it; a senior's ok does (D49)
        assertThat(PublicProducts.approvedAt(List.of(rd(5, "ok", "engineer", t4), rd(4, "ok", "senior", t2)), EXTRACTED)).isEqualTo(t2);
        // an ok before the dismissal never dates the line
        assertThat(PublicProducts.approvedAt(List.of(rd(1, "ok", "pharmacist", t1), rd(2, "issue", "pharmacist", t2),
            rd(3, "dismiss", "senior", t3)), EXTRACTED)).isEqualTo(EXTRACTED);
        // an ok before the run stamp is an earlier run's: a carried approval counts at the stamp (§8.3.1 item 8)
        assertThat(PublicProducts.approvedAt(List.of(rd(1, "ok", "pharmacist", EXTRACTED.minusSeconds(60))), EXTRACTED)).isEqualTo(EXTRACTED);
        assertThat(PublicProducts.approvedAt(List.of(), null)).isNull();
    }
}
