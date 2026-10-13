package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.domain.DdinterCode;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.util.*;

/** Four set-based queries per check: products, ingredients, DDInter codes (with their ddinter_drug row), then pairs among those codes. */
@Component
public class R2dbcCheckAdapter implements CheckQueryPort {
    private final DatabaseClient db;
    public R2dbcCheckAdapter(DatabaseClient db) { this.db = db; }

    private record CodeRow(String bdsId, DdinterCode code, boolean listed) {}
    private record Codes(Map<String, List<DdinterCode>> byBds, Set<String> listed) {}

    @Override public Mono<CheckData> load(List<String> conceptIds) {
        String[] ids = conceptIds.toArray(String[]::new);
        Mono<List<ProductRow>> products = db.sql("""
                SELECT bp.concept_id, bp.trade_name, bp.generic_content_raw, cd.route, %s AS review_status
                FROM curated.brand_product bp LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                WHERE bp.concept_id = ANY(:ids)""".formatted(ReviewSql.statusOf("bp.concept_id")))
            .bind("ids", ids)
            .map(r -> new ProductRow(r.get("concept_id", String.class), r.get("trade_name", String.class),
                r.get("generic_content_raw", String.class), r.get("route", String.class),
                r.get("review_status", String.class)))
            .all().collectList();
        Mono<List<IngredientRow>> ingredients = db.sql("""
                SELECT bpi.concept_id, bpi.xm_code, bpi.ingredient_name, s.bds_id, s.preferred_name, ic.coverage
                FROM curated.brand_product_ingredient bpi
                LEFT JOIN curated.substance_code c ON c.system = 'ICD11_XM' AND c.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = c.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = s.bds_id
                WHERE bpi.concept_id = ANY(:ids)
                ORDER BY bpi.concept_id, bpi.xm_code""")
            .bind("ids", ids)
            .map(r -> new IngredientRow(r.get("concept_id", String.class), r.get("xm_code", String.class),
                r.get("ingredient_name", String.class), r.get("bds_id", String.class), r.get("preferred_name", String.class),
                r.get("coverage", String.class)))
            .all().collectList();
        return Mono.zip(products, ingredients).flatMap(t -> {
            String[] bds = t.getT2().stream().map(IngredientRow::bdsId).filter(Objects::nonNull).distinct()
                .toArray(String[]::new);
            return codes(bds).flatMap(codes -> pairs(codes.byBds()).map(pairs ->
                new CheckData(t.getT1(), t.getT2(), codes.byBds(), codes.listed(), pairs)));
        });
    }

    /** Every DDINTER code of the substances; listed = it has a ddinter_drug row (its full pair list is stored, §7.4). */
    private Mono<Codes> codes(String[] bdsIds) {
        if (bdsIds.length == 0) return Mono.just(new Codes(Map.of(), Set.of()));
        return db.sql("""
                SELECT c.bds_id, c.code, c.route_scope, d.ddinter_id IS NOT NULL AS listed
                FROM curated.substance_code c
                LEFT JOIN curated.ddinter_drug d ON d.ddinter_id = c.code
                WHERE c.system = 'DDINTER' AND c.bds_id = ANY(:bds)""")
            .bind("bds", bdsIds)
            .map(r -> new CodeRow(r.get("bds_id", String.class),
                new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class)),
                Boolean.TRUE.equals(r.get("listed", Boolean.class))))
            .all().collectList()
            .map(rows -> {
                Map<String, List<DdinterCode>> byBds = new HashMap<>();
                Set<String> listed = new HashSet<>();
                for (CodeRow c : rows) {
                    byBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(c.code());
                    if (c.listed()) listed.add(c.code().code());
                }
                return new Codes(byBds, listed);
            });
    }

    private Mono<List<PairRow>> pairs(Map<String, List<DdinterCode>> codes) {
        String[] all = codes.values().stream().flatMap(List::stream).map(DdinterCode::code).distinct().toArray(String[]::new);
        if (all.length < 2) return Mono.just(List.of());
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.severity, p.actions, t.interaction, t.management
                FROM curated.ddinter_pair p
                LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE p.ddinter_a = ANY(:codes) AND p.ddinter_b = ANY(:codes)""")
            .bind("codes", all)
            .map(r -> new PairRow(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class),
                r.get("severity", String.class), R2dbcSubstanceAdapter.list(r, "actions"),
                r.get("interaction", String.class), r.get("management", String.class)))
            .all().collectList();
    }
}
