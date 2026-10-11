package com.niramoy.bddrug.domain;
import java.util.List;
public record CheckResult(List<CheckedProduct> products, List<InteractionAlert> alerts, List<Duplicate> duplicates,
                          List<NoData> noData) {
    public record CheckedProduct(String conceptId, String tradeName, List<SubstanceCoverage> substances) {}
    public record SubstanceCoverage(String bdsId, String name, String coverage) {}
    public record Duplicate(String bdsId, String name, List<String> conceptIds) {}
    /** A product substance the checker has no interaction data for. Always listed, never treated as safe. */
    public record NoData(String conceptId, String bdsId, String name) {}
}
