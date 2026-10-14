package com.niramoy.bddrug.domain;
import java.math.BigDecimal;
import java.util.List;

/**
 * One ingredient of a product as reviewers (and, from P2, approved product pages) see it (spec §7.3). Coverage
 * {@code not_run} means DDInter mapping never ran for the substance (no curated.interaction_coverage row): it is never
 * shown as "no data". An ingredient with no substance has {@code bdsId} null.
 */
public record IngredientSummary(String bdsId, String name, String raw, BigDecimal strengthValue, String strengthUnit,
                                BigDecimal perValue, String perUnit, List<Name> names, List<Code> codes, Coverage coverage,
                                Ddinter ddinter) {
    public record Name(String name, String type, String source) {}
    public record Code(String system, String code, String routeScope, String method, double confidence) {}
    public record Coverage(String coverage, String note) {}
    public record Chosen(String ddinterId, String name, String routeScope, boolean routeAssumed) {}
    public record Counts(int major, int moderate, int minor, int unknown, int total) {}
    public record Entry(String ddinterId, String name, String routeScope, Counts counts, int diseaseCount, int foodCount) {}
    public record Ddinter(List<Chosen> chosen, List<Entry> entries) {}
}
