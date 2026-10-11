package com.niramoy.bddrug.domain;
import java.util.List;

/** reviewStatus is the product's current review (ok, pending or issue); null inside a batch item, which has its own. */
public record Product(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                      String genericContentRaw, String qualityFlag, List<Ingredient> ingredients,
                      String parseStatus, String parseNote, ClinicalDrug clinicalDrug,
                      String reviewStatus) {
    public Product withIngredients(List<Ingredient> list) {
        return new Product(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, list,
            parseStatus, parseNote, clinicalDrug, reviewStatus);
    }
    public Product withClinicalDrug(ClinicalDrug drug) {
        return new Product(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, ingredients,
            parseStatus, parseNote, drug, reviewStatus);
    }
}
