package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * GET /v1/products/{id} for a public product (§7.4 rows P5/P6/P7/P15): the Product fields without the internal review
 * status, the verification line, where the record comes from (with the DGDA source link, §6.5), each clinical
 * ingredient's IngredientSummary (codes with their source links, coverage, chosen entries and counts) and the number of
 * other public brands of the clinical drug.
 */
public record PublicProduct(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                            String genericContentRaw, String qualityFlag, List<Ingredient> ingredients, String parseStatus,
                            String parseNote, Clinical clinicalDrug, Verification verification, Provenance provenance,
                            int otherBrandsCount) {
    public record Clinical(String bdcId, String displayName, String doseForm, String route, List<ClinicalItem> ingredients) {}
    public record ClinicalItem(String bdsId, String name, BigDecimal strengthValue, String strengthUnit, BigDecimal perValue,
                               String perUnit, List<ClinicalIngredient.DdinterRef> ddinter, IngredientSummary summary) {}
    /** role is always "pharmacist": a senior's approval reads "Approved by a pharmacist" in public (D49). */
    public record Verification(String status, String role, Instant approvedAt) {}
    public record Provenance(String batchId, Instant extractedAt, String source, SourceLinks.Source sourceLink, List<Stage> stages) {}
    public record Stage(String stage, String status, List<StageNotes.Note> notes, List<TextMissing> textMissing) {}
    public record TextMissing(String ddinterA, String nameA, String ddinterB, String nameB, String severity) {}
}
