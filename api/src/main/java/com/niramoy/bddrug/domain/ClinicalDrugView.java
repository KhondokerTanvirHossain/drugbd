package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.util.List;

/**
 * §7.4 P8: a clinical drug, its ingredients and the brands that map to it (visible brands only under public scope), each
 * brand with its public label and the drug with the label it carries from them (PublicReview.carried, §7.4.1).
 */
public record ClinicalDrugView(String bdcId, String displayName, String doseForm, String route, List<Ingredient> ingredients,
                               List<ProductRef> products, String review) {
    public record Ingredient(String bdsId, String name, BigDecimal strengthValue, String strengthUnit, BigDecimal perValue, String perUnit) {}
    /** review: the brand's public label; null for a hidden brand (listed only under scope=all). */
    public record ProductRef(String conceptId, String tradeName, String company, String darNumber, String review) {}
}
