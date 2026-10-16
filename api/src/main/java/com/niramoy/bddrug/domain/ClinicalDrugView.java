package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.util.List;

/** §7.4 P8: a clinical drug, its ingredients and the brands that map to it (public brands only under public scope). */
public record ClinicalDrugView(String bdcId, String displayName, String doseForm, String route, List<Ingredient> ingredients,
                               List<ProductRef> products) {
    public record Ingredient(String bdsId, String name, BigDecimal strengthValue, String strengthUnit, BigDecimal perValue, String perUnit) {}
    public record ProductRef(String conceptId, String tradeName, String company, String darNumber) {}
}
