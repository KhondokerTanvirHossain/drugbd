package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.util.List;

/**
 * One ingredient of a clinical drug, with its own strength. {@code ddinter} lists the DDInter entries
 * chosen for this product's route (empty when none is usable).
 */
public record ClinicalIngredient(String bdsId, String name, BigDecimal strengthValue, String strengthUnit,
                                 BigDecimal perValue, String perUnit, List<DdinterRef> ddinter) {
    public record DdinterRef(String ddinterId, String name, String routeScope, boolean routeAssumed) {}
}
