package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.IngredientSummary.*;
import com.niramoy.bddrug.domain.RouteRule;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.util.*;

/**
 * Builds {@link IngredientSummary} for one product (spec §7.3). The ingredient list follows the DGDA ingredient rows
 * (XM-code order), so a product whose clinical drug is missing still lists its substances. Five queries, never per row.
 */
@Component
public class IngredientSummaryReader {
    static final String SYSTEM_RANK =
        "coalesce(array_position(ARRAY['ICD11_XM','RXCUI','ATC','DRUGBANK','SNOMEDCT','DDINTER'], system), 7)";
    static final String NAME_RANK = "coalesce(array_position(ARRAY['icd11','rxnorm','dgda_content','ddinter'], name_type), 5)";

    private final DatabaseClient db;
    public IngredientSummaryReader(DatabaseClient db) { this.db = db; }

    private record Row(String ingredientName, String bdsId, String preferredName, String raw, BigDecimal value, String unit,
                       BigDecimal per, String perUnit, String coverage, String coverageNote) {}
    private record EntryRow(String id, String name, int major, int moderate, int minor, int unknown, int total, int disease, int food) {}

    public Mono<List<IngredientSummary>> read(String conceptId, String bdcId, String route) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                SELECT bpi.ingredient_name, xm.bds_id, s.preferred_name, cdi.raw_text, cdi.strength_value, cdi.strength_unit,
                       cdi.per_value, cdi.per_unit, ic.coverage, ic.note
                FROM curated.brand_product_ingredient bpi
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.clinical_drug_ingredient cdi ON cdi.bdc_id = :bdc AND cdi.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE bpi.concept_id = :c
                ORDER BY bpi.xm_code COLLATE "C\"""").bind("c", conceptId);
        spec = bdcId == null ? spec.bindNull("bdc", String.class) : spec.bind("bdc", bdcId);
        return spec.map(r -> new Row(r.get("ingredient_name", String.class), r.get("bds_id", String.class),
                r.get("preferred_name", String.class), r.get("raw_text", String.class),
                ClinicalDrugReader.plain(r.get("strength_value", BigDecimal.class)), r.get("strength_unit", String.class),
                ClinicalDrugReader.plain(r.get("per_value", BigDecimal.class)), r.get("per_unit", String.class),
                r.get("coverage", String.class), r.get("note", String.class)))
            .all().collectList()
            .flatMap(all -> {
                List<Row> rows = new ArrayList<>();
                Set<String> seen = new HashSet<>();
                for (Row r : all) if (r.bdsId() == null || seen.add(r.bdsId())) rows.add(r);
                String[] ids = rows.stream().map(Row::bdsId).filter(Objects::nonNull).toArray(String[]::new);
                if (ids.length == 0) return Mono.just(assemble(rows, Map.of(), Map.of(), Map.of(), route));
                return Mono.zip(names(ids), codes(ids)).flatMap(t -> {
                    String[] dd = t.getT2().values().stream().flatMap(List::stream).filter(c -> "DDINTER".equals(c.system()))
                        .map(Code::code).distinct().toArray(String[]::new);
                    Mono<Map<String, EntryRow>> entries = dd.length == 0 ? Mono.just(Map.of()) : entries(dd);
                    return entries.map(e -> assemble(rows, t.getT1(), t.getT2(), e, route));
                });
            });
    }

    private Mono<Map<String, List<Name>>> names(String[] ids) {
        return db.sql("SELECT bds_id, name, name_type, source FROM curated.substance_name WHERE bds_id = ANY(:ids) " +
                      "ORDER BY bds_id, " + NAME_RANK + ", name")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class),
                new Name(r.get("name", String.class), r.get("name_type", String.class), r.get("source", String.class))))
            .all().collect(LinkedHashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }

    private Mono<Map<String, List<Code>>> codes(String[] ids) {
        return db.sql("SELECT bds_id, system, code, route_scope, method, confidence FROM curated.substance_code " +
                      "WHERE bds_id = ANY(:ids) ORDER BY bds_id, " + SYSTEM_RANK + ", code")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class), new Code(r.get("system", String.class), r.get("code", String.class),
                r.get("route_scope", String.class), r.get("method", String.class), r.get("confidence", BigDecimal.class).doubleValue())))
            .all().collect(LinkedHashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }

    /** Pair counts by severity (both sides of the stored pair), disease and food counts, and the DDInter name. */
    private Mono<Map<String, EntryRow>> entries(String[] ids) {
        return db.sql("""
                WITH e AS (SELECT unnest(CAST(:ids AS text[])) AS id),
                sides AS (SELECT p.ddinter_a AS id, p.severity FROM curated.ddinter_pair p WHERE p.ddinter_a = ANY(:ids)
                          UNION ALL
                          SELECT p.ddinter_b, p.severity FROM curated.ddinter_pair p WHERE p.ddinter_b = ANY(:ids))
                SELECT e.id, (SELECT d.name FROM curated.ddinter_drug d WHERE d.ddinter_id = e.id) AS name,
                       count(s.severity) FILTER (WHERE s.severity = 'major') AS major,
                       count(s.severity) FILTER (WHERE s.severity = 'moderate') AS moderate,
                       count(s.severity) FILTER (WHERE s.severity = 'minor') AS minor,
                       count(s.severity) FILTER (WHERE s.severity NOT IN ('major','moderate','minor')) AS unknown,
                       count(s.severity) AS total,
                       (SELECT count(*) FROM curated.ddinter_disease d WHERE d.ddinter_id = e.id) AS disease,
                       (SELECT count(*) FROM curated.ddinter_food f WHERE f.ddinter_id = e.id) AS food
                FROM e LEFT JOIN sides s ON s.id = e.id GROUP BY e.id""")
            .bind("ids", ids)
            .map(r -> new EntryRow(r.get("id", String.class), r.get("name", String.class), n(r.get("major", Long.class)),
                n(r.get("moderate", Long.class)), n(r.get("minor", Long.class)), n(r.get("unknown", Long.class)),
                n(r.get("total", Long.class)), n(r.get("disease", Long.class)), n(r.get("food", Long.class))))
            .all().collectMap(EntryRow::id, e -> e);
    }

    private static int n(Long v) { return v == null ? 0 : v.intValue(); }

    private static List<IngredientSummary> assemble(List<Row> rows, Map<String, List<Name>> names, Map<String, List<Code>> codes,
                                                    Map<String, EntryRow> entries, String route) {
        List<IngredientSummary> out = new ArrayList<>();
        for (Row r : rows) {
            if (r.bdsId() == null) {
                out.add(new IngredientSummary(null, r.ingredientName(), r.ingredientName(), null, null, null, null, List.of(),
                    List.of(), new Coverage("not_run", ""), new Ddinter(List.of(), List.of())));
                continue;
            }
            List<Code> mine = codes.getOrDefault(r.bdsId(), List.of());
            List<DdinterCode> dd = mine.stream().filter(c -> "DDINTER".equals(c.system()))
                .map(c -> new DdinterCode(c.code(), c.routeScope())).sorted(Comparator.comparing(DdinterCode::code, DdinterCode.ID_ORDER))
                .toList();
            List<Chosen> chosen = RouteRule.choose(dd, route).map(choice -> choice.codes().stream()
                .map(c -> new Chosen(c.code(), name(entries, c.code()), c.routeScope(), choice.routeAssumed())).toList()).orElse(List.of());
            List<Entry> list = dd.stream().map(c -> {
                EntryRow e = entries.get(c.code());
                Counts counts = e == null ? new Counts(0, 0, 0, 0, 0) : new Counts(e.major(), e.moderate(), e.minor(), e.unknown(), e.total());
                return new Entry(c.code(), name(entries, c.code()), c.routeScope(), counts, e == null ? 0 : e.disease(), e == null ? 0 : e.food());
            }).toList();
            Coverage coverage = r.coverage() == null ? new Coverage("not_run", "") : new Coverage(r.coverage(), r.coverageNote() == null ? "" : r.coverageNote());
            out.add(new IngredientSummary(r.bdsId(), r.preferredName(), r.raw() != null ? r.raw() : r.ingredientName(), r.value(),
                r.unit(), r.per(), r.perUnit(), names.getOrDefault(r.bdsId(), List.of()), mine, coverage, new Ddinter(chosen, list)));
        }
        return List.copyOf(out);
    }

    private static String name(Map<String, EntryRow> entries, String id) {
        EntryRow e = entries.get(id);
        return e == null ? null : e.name();
    }
}
