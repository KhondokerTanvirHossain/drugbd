package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * reviewStatus is the product's current review (ok, pending or issue), for internal (scope=all) reads; null inside a batch
 * item, which has its own. review is its public label under the public mode (§7.4.1: approved, not_reviewed or problem),
 * null when the product is hidden; public reads decide from it alone, never from reviewStatus.
 */
public record Product(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                      String genericContentRaw, String qualityFlag, List<Ingredient> ingredients,
                      String parseStatus, String parseNote, ClinicalDrug clinicalDrug,
                      String reviewStatus, String review) {
    /** Approved-only shape (tests, batch items): the label is "approved" exactly when the status is ok. */
    public Product(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                   String genericContentRaw, String qualityFlag, List<Ingredient> ingredients,
                   String parseStatus, String parseNote, ClinicalDrug clinicalDrug, String reviewStatus) {
        this(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, ingredients, parseStatus, parseNote,
            clinicalDrug, reviewStatus, "ok".equals(reviewStatus) ? PublicReview.APPROVED : null);
    }
    public Product withIngredients(List<Ingredient> list) {
        return new Product(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, list,
            parseStatus, parseNote, clinicalDrug, reviewStatus, review);
    }
    public Product withClinicalDrug(ClinicalDrug drug) {
        return new Product(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, ingredients,
            parseStatus, parseNote, drug, reviewStatus, review);
    }
}
