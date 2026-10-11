package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.domain.ClinicalDrug;
import com.niramoy.bddrug.domain.ClinicalIngredient;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.RouteRule;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.util.*;

/** Loads clinical drugs (with ingredients and their route-chosen DDInter entries) for a set of BDC ids in two queries. */
@Component
class ClinicalDrugReader {
    private final DatabaseClient db;
    ClinicalDrugReader(DatabaseClient db) { this.db = db; }

    private record IngredientRow(String bdcId, String displayName, String doseForm, String route, String bdsId, String name,
                                 BigDecimal strengthValue, String strengthUnit, BigDecimal perValue, String perUnit) {}
    private record CodeRow(String bdsId, DdinterCode code, String name) {}

    Mono<Map<String, ClinicalDrug>> byIds(Collection<String> bdcIds) {
        String[] ids = bdcIds.stream().filter(Objects::nonNull).distinct().toArray(String[]::new);
        if (ids.length == 0) return Mono.just(Map.of());
        Mono<List<IngredientRow>> rows = db.sql("""
                SELECT cd.bdc_id, cd.display_name, cd.dose_form, cd.route, i.bds_id, s.preferred_name,
                       i.strength_value, i.strength_unit, i.per_value, i.per_unit
                FROM curated.clinical_drug cd
                LEFT JOIN curated.clinical_drug_ingredient i ON i.bdc_id = cd.bdc_id
                LEFT JOIN curated.substance s ON s.bds_id = i.bds_id
                WHERE cd.bdc_id = ANY(:ids)
                ORDER BY cd.bdc_id, lower(s.preferred_name), i.bds_id""")
            .bind("ids", ids)
            .map(r -> new IngredientRow(r.get("bdc_id", String.class), r.get("display_name", String.class),
                r.get("dose_form", String.class), r.get("route", String.class), r.get("bds_id", String.class),
                r.get("preferred_name", String.class), plain(r.get("strength_value", BigDecimal.class)),
                r.get("strength_unit", String.class), plain(r.get("per_value", BigDecimal.class)), r.get("per_unit", String.class)))
            .all().collectList();
        Mono<List<CodeRow>> codes = db.sql("""
                SELECT c.bds_id, c.code, c.route_scope, d.name
                FROM curated.substance_code c
                LEFT JOIN curated.ddinter_drug d ON d.ddinter_id = c.code
                WHERE c.system = 'DDINTER'
                  AND c.bds_id IN (SELECT i.bds_id FROM curated.clinical_drug_ingredient i WHERE i.bdc_id = ANY(:ids))""")
            .bind("ids", ids)
            .map(r -> new CodeRow(r.get("bds_id", String.class),
                new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class)), r.get("name", String.class)))
            .all().collectList();
        return Mono.zip(rows, codes).map(t -> assemble(t.getT1(), t.getT2()));
    }

    private static Map<String, ClinicalDrug> assemble(List<IngredientRow> rows, List<CodeRow> codes) {
        Map<String, List<DdinterCode>> codesByBds = new HashMap<>();
        Map<String, String> ddinterNames = new HashMap<>();
        for (CodeRow c : codes) {
            codesByBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(c.code());
            ddinterNames.put(c.code().code(), c.name());
        }
        Map<String, ClinicalDrug> out = new LinkedHashMap<>();
        for (IngredientRow r : rows) {
            ClinicalDrug cd = out.computeIfAbsent(r.bdcId(),
                k -> new ClinicalDrug(r.bdcId(), r.displayName(), r.doseForm(), r.route(), new ArrayList<>()));
            if (r.bdsId() == null) continue;   // clinical drug without ingredient rows
            List<ClinicalIngredient.DdinterRef> refs = RouteRule.choose(codesByBds.getOrDefault(r.bdsId(), List.of()), r.route())
                .map(choice -> choice.codes().stream().map(c -> new ClinicalIngredient.DdinterRef(
                    c.code(), ddinterNames.get(c.code()), c.routeScope(), choice.routeAssumed())).toList())
                .orElse(List.of());
            cd.ingredients().add(new ClinicalIngredient(r.bdsId(), r.name(), r.strengthValue(), r.strengthUnit(),
                r.perValue(), r.perUnit(), refs));
        }
        out.replaceAll((k, cd) -> new ClinicalDrug(cd.bdcId(), cd.displayName(), cd.doseForm(), cd.route(),
            List.copyOf(cd.ingredients())));
        return out;
    }

    /** 500.000 -> 500, 0.50 -> 0.5; never exponent notation for whole numbers. */
    static BigDecimal plain(BigDecimal v) {
        if (v == null) return null;
        BigDecimal s = v.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }
}
