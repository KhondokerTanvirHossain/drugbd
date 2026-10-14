package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.SubstanceQueryPort;
import com.niramoy.bddrug.domain.Substance;
import com.niramoy.bddrug.domain.SubstanceCode;
import com.niramoy.bddrug.domain.SubstanceName;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

@Component
public class R2dbcSubstanceAdapter implements SubstanceQueryPort {
    /** SQL rank for DDInter severities: major, moderate, minor, then unknown and anything else. */
    private static final String SEVERITY_RANK =
        "coalesce(array_position(ARRAY['major','moderate','minor','unknown'], %s), 4)";
    private static final String SYSTEM_RANK =
        "coalesce(array_position(ARRAY['ICD11_XM','RXCUI','ATC','DRUGBANK','SNOMEDCT','DDINTER'], system), 7)";
    /** This substance's DDInter entries, used to reach its pairs, diseases and foods. */
    private static final String MINE =
        "WITH mine AS (SELECT code, route_scope FROM curated.substance_code WHERE bds_id = :id AND system = 'DDINTER') ";

    private final DatabaseClient db;
    public R2dbcSubstanceAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<Substance> find(String bdsId, boolean approvedOnly) {
        return db.sql("SELECT bds_id, preferred_name FROM curated.substance WHERE bds_id = :id")
            .bind("id", bdsId)
            .map(r -> new Substance(r.get("bds_id", String.class), r.get("preferred_name", String.class),
                List.of(), List.of(), null, List.of(), List.of(), List.of(), List.of()))
            .one()
            .flatMap(s -> Mono.zip(names(bdsId), codes(bdsId), coverage(bdsId), products(bdsId, approvedOnly),
                    interactions(bdsId), diseases(bdsId), foods(bdsId))
                .map(t -> new Substance(s.bdsId(), s.preferredName(), t.getT1(), t.getT2(), t.getT3(), t.getT4(),
                    t.getT5(), t.getT6(), t.getT7())));
    }

    private Mono<List<SubstanceName>> names(String id) {
        return db.sql("SELECT name, name_type, source FROM curated.substance_name WHERE bds_id = :id ORDER BY name_type, name")
            .bind("id", id)
            .map(r -> new SubstanceName(r.get("name", String.class), r.get("name_type", String.class), r.get("source", String.class)))
            .all().collectList();
    }

    private Mono<List<SubstanceCode>> codes(String id) {
        return db.sql("SELECT system, code, route_scope, source, method, confidence FROM curated.substance_code " +
                      "WHERE bds_id = :id ORDER BY " + SYSTEM_RANK + ", code")
            .bind("id", id)
            .map(r -> new SubstanceCode(r.get("system", String.class), r.get("code", String.class),
                r.get("route_scope", String.class), r.get("source", String.class), r.get("method", String.class),
                r.get("confidence", BigDecimal.class).doubleValue()))
            .all().collectList();
    }

    private Mono<Substance.Coverage> coverage(String id) {
        return db.sql("SELECT coverage, note FROM curated.interaction_coverage WHERE bds_id = :id")
            .bind("id", id)
            .map(r -> new Substance.Coverage(r.get("coverage", String.class), r.get("note", String.class)))
            .one()
            .defaultIfEmpty(new Substance.Coverage("not_run", Substance.NOT_LOADED_NOTE));   // §7.3: no row = never ran
    }

    private Mono<List<Substance.ProductRef>> products(String id, boolean approvedOnly) {
        return db.sql("""
                SELECT p.concept_id, p.trade_name, p.company, %s AS review_status
                FROM (SELECT DISTINCT bp.concept_id, bp.trade_name, bp.company
                      FROM curated.substance_code c
                      JOIN curated.brand_product_ingredient bpi ON bpi.xm_code = c.code
                      JOIN curated.brand_product bp ON bp.concept_id = bpi.concept_id
                      WHERE c.bds_id = :id AND c.system = 'ICD11_XM') p
                ORDER BY p.trade_name, p.concept_id""".formatted(ReviewSql.statusOf("p.concept_id")))
            .bind("id", id)
            .map(r -> new Substance.ProductRef(r.get("concept_id", String.class), r.get("trade_name", String.class),
                r.get("company", String.class), r.get("review_status", String.class)))
            .all()
            .filter(p -> !approvedOnly || "ok".equals(p.reviewStatus()))
            .collectList();
    }

    /** Pairs are stored once (ddinter_a < ddinter_b); the partner is whichever side is not this substance's entry. */
    private Mono<List<Substance.Interaction>> interactions(String id) {
        return db.sql(MINE + """
                , sides AS (
                  SELECT p.ddinter_b AS partner_id, p.partner_name_b AS partner_name, p.severity, p.actions,
                         p.interaction_id, m.route_scope
                  FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_a = m.code
                  UNION ALL
                  SELECT p.ddinter_a, p.partner_name_a, p.severity, p.actions, p.interaction_id, m.route_scope
                  FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_b = m.code)
                SELECT s.partner_name, s.severity, s.actions, s.interaction_id, s.route_scope,
                       (SELECT min(c.bds_id) FROM curated.substance_code c
                         WHERE c.system = 'DDINTER' AND c.code = s.partner_id) AS partner_bds_id
                FROM sides s
                ORDER BY\s""" + SEVERITY_RANK.formatted("s.severity") +
                ", lower(s.partner_name), s.partner_name, s.route_scope, s.partner_id")
            .bind("id", id)
            .map(r -> new Substance.Interaction(r.get("partner_name", String.class), r.get("partner_bds_id", String.class),
                r.get("severity", String.class), list(r, "actions"), r.get("interaction_id", String.class),
                r.get("route_scope", String.class)))
            .all().collectList();
    }

    private Mono<List<Substance.Disease>> diseases(String id) {
        return db.sql(MINE + """
                SELECT d.disease_name, d.severity, d.text, d.refs, d.interaction_id, m.route_scope
                FROM mine m JOIN curated.ddinter_disease d ON d.ddinter_id = m.code
                ORDER BY\s""" + SEVERITY_RANK.formatted("d.severity") +
                ", lower(d.disease_name), d.disease_name, m.route_scope, d.interaction_id")
            .bind("id", id)
            .map(r -> new Substance.Disease(r.get("disease_name", String.class), r.get("severity", String.class),
                r.get("text", String.class), list(r, "refs"), r.get("interaction_id", String.class),
                r.get("route_scope", String.class)))
            .all().collectList();
    }

    private Mono<List<Substance.Food>> foods(String id) {
        return db.sql(MINE + """
                SELECT f.food, f.severity, f.mechanism, f.description, f.management, f.refs, f.interaction_id, m.route_scope
                FROM mine m JOIN curated.ddinter_food f ON f.ddinter_id = m.code
                ORDER BY\s""" + SEVERITY_RANK.formatted("f.severity") +
                ", lower(f.food), f.food, m.route_scope, f.interaction_id")
            .bind("id", id)
            .map(r -> new Substance.Food(r.get("food", String.class), r.get("severity", String.class),
                r.get("mechanism", String.class), r.get("description", String.class), r.get("management", String.class),
                list(r, "refs"), r.get("interaction_id", String.class), r.get("route_scope", String.class)))
            .all().collectList();
    }

    static List<String> list(Readable r, String column) {
        String[] values = r.get(column, String[].class);
        return values == null ? List.of() : Arrays.asList(values);
    }
}
