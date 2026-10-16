package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.SubstanceQueryPort;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.SourceLinks;
import com.niramoy.bddrug.domain.Substance;
import com.niramoy.bddrug.domain.SubstanceCode;
import com.niramoy.bddrug.domain.SubstanceName;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

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
    private static final String MINE_CTE = "mine AS (SELECT code, route_scope FROM curated.substance_code WHERE bds_id = :id AND system = 'DDINTER')";
    /** Substances carried by a public product (§7.4: "a substance is public only when at least one public product carries it"). */
    static final String PUBLIC_SUBSTANCES = """
        pubsub AS (SELECT DISTINCT x.bds_id FROM curated.brand_product bp
                   JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                   JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                   JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code)""";
    /** ICD-11 "fetched on" for a substance page: the DGDA register's latest fetch of any product carrying the XM code (as P1C's senior substance page). */
    static final String ICD11_FETCHED_AT = "SELECT max(rc.fetched_at) FROM curated.brand_product_ingredient bpi " +
        "JOIN raw.ocl_concept rc ON rc.concept_id = bpi.concept_id WHERE bpi.xm_code = c.code";

    private final DatabaseClient db;
    public R2dbcSubstanceAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<Substance> find(String bdsId, boolean approvedOnly) {
        return db.sql("SELECT bds_id, preferred_name FROM curated.substance WHERE bds_id = :id")
            .bind("id", bdsId)
            .map(r -> new String[]{r.get("bds_id", String.class), r.get("preferred_name", String.class)})
            .one()
            .flatMap(s -> Mono.zip(List.of(names(bdsId), codes(bdsId), coverage(bdsId), products(bdsId, approvedOnly),
                    interactions(bdsId, approvedOnly), diseases(bdsId), foods(bdsId), entries(bdsId), clinicalDrugs(bdsId, approvedOnly)),
                    a -> a)
                .map(a -> new Substance(s[0], s[1], cast(a[0]), cast(a[1]), (Substance.Coverage) a[2], cast(a[3]), cast(a[4]),
                    cast(a[5]), cast(a[6]), cast(a[7]), cast(a[8]))));
    }

    @SuppressWarnings("unchecked")
    private static <T> List<T> cast(Object o) { return (List<T>) o; }

    private Mono<List<SubstanceName>> names(String id) {
        return db.sql("SELECT name, name_type, source FROM curated.substance_name WHERE bds_id = :id ORDER BY name_type, name")
            .bind("id", id)
            .map(r -> new SubstanceName(r.get("name", String.class), r.get("name_type", String.class), r.get("source", String.class)))
            .all().collectList();
    }

    /** Each code with its provenance text and the §5.6.6 link P1C's one "fetched on" rule gives it (two queries in parallel). */
    private Mono<List<SubstanceCode>> codes(String id) {
        Mono<List<SubstanceCode>> rows = db.sql("SELECT system, code, route_scope, source, method, confidence FROM curated.substance_code " +
                      "WHERE bds_id = :id ORDER BY " + SYSTEM_RANK + ", code")
            .bind("id", id)
            .map(r -> new SubstanceCode(r.get("system", String.class), r.get("code", String.class),
                r.get("route_scope", String.class), r.get("source", String.class), r.get("method", String.class),
                r.get("confidence", BigDecimal.class).doubleValue(), null))
            .all().collectList();
        Mono<Map<String, SourceLinks.Source>> links = db.sql(IngredientSummaryReader.codesSql(ICD11_FETCHED_AT))
            .bind("ids", new String[]{id})
            .map(IngredientSummaryReader::code)
            .all().filter(c -> c.source() != null)
            .collectMap(c -> c.system() + "|" + c.code(), IngredientSummary.Code::source);
        return Mono.zip(rows, links).map(t -> t.getT1().stream().map(c -> new SubstanceCode(c.system(), c.code(), c.routeScope(),
            c.source(), c.method(), c.confidence(), t.getT2().get(c.system() + "|" + c.code()))).toList());
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

    /**
     * Pairs are stored once (ddinter_a < ddinter_b); the partner is whichever side is not this substance's entry. Under
     * public scope the partner's BDS id is looked up among public substances only, so a private partner is never linked (§7.4).
     */
    private Mono<List<Substance.Interaction>> interactions(String id, boolean publicOnly) {
        String partner = publicOnly
            ? "(SELECT min(c.bds_id) FROM curated.substance_code c JOIN pubsub ps ON ps.bds_id = c.bds_id " +
              "WHERE c.system = 'DDINTER' AND c.code = s.partner_id)"
            : "(SELECT min(c.bds_id) FROM curated.substance_code c WHERE c.system = 'DDINTER' AND c.code = s.partner_id)";
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBLIC_SUBSTANCES + ", " + MINE_CTE + """
                , sides AS (
                  SELECT p.ddinter_b AS partner_id, p.partner_name_b AS partner_name, p.severity, p.actions,
                         p.interaction_id, m.route_scope
                  FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_a = m.code
                  UNION ALL
                  SELECT p.ddinter_a, p.partner_name_a, p.severity, p.actions, p.interaction_id, m.route_scope
                  FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_b = m.code)
                SELECT s.partner_name, s.severity, s.actions, s.interaction_id, s.route_scope,\s""" + partner + """
                 AS partner_bds_id
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

    private Mono<List<Substance.Entry>> entries(String id) {
        return db.sql("""
                WITH e AS (SELECT c.code AS id, c.route_scope FROM curated.substance_code c WHERE c.bds_id = :id AND c.system = 'DDINTER'),
                sides AS (SELECT p.ddinter_a AS id, p.severity FROM curated.ddinter_pair p JOIN e ON p.ddinter_a = e.id
                          UNION ALL SELECT p.ddinter_b, p.severity FROM curated.ddinter_pair p JOIN e ON p.ddinter_b = e.id)
                SELECT e.id, e.route_scope, d.name, d.fetched_at,
                       count(s.severity) FILTER (WHERE s.severity = 'major') AS major,
                       count(s.severity) FILTER (WHERE s.severity = 'moderate') AS moderate,
                       count(s.severity) FILTER (WHERE s.severity = 'minor') AS minor,
                       count(s.severity) FILTER (WHERE s.severity NOT IN ('major','moderate','minor')) AS unknown,
                       count(s.severity) AS total,
                       (SELECT count(*) FROM curated.ddinter_disease x WHERE x.ddinter_id = e.id) AS disease,
                       (SELECT count(*) FROM curated.ddinter_food x WHERE x.ddinter_id = e.id) AS food
                FROM e LEFT JOIN curated.ddinter_drug d ON d.ddinter_id = e.id LEFT JOIN sides s ON s.id = e.id
                GROUP BY e.id, e.route_scope, d.name, d.fetched_at""")
            .bind("id", id)
            .map(r -> {
                String code = r.get("id", String.class);
                OffsetDateTime at = r.get("fetched_at", OffsetDateTime.class);
                return new Substance.Entry(code, r.get("name", String.class), r.get("route_scope", String.class),
                    new IngredientSummary.Counts(n(r, "major"), n(r, "moderate"), n(r, "minor"), n(r, "unknown"), n(r, "total")),
                    n(r, "disease"), n(r, "food"),
                    SourceLinks.code("DDINTER", code, at == null ? null : at.toInstant()).orElse(null));
            })
            .all().collectList()
            .map(list -> list.stream().sorted(java.util.Comparator.comparing(Substance.Entry::ddinterId, DdinterCode.ID_ORDER)).toList());
    }

    private static int n(Readable r, String column) {
        Long v = r.get(column, Long.class);
        return v == null ? 0 : v.intValue();
    }

    private Mono<List<Substance.ClinicalDrugRef>> clinicalDrugs(String id, boolean publicOnly) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " + """
                SELECT DISTINCT cd.bdc_id, cd.display_name
                FROM curated.clinical_drug_ingredient i
                JOIN curated.clinical_drug cd ON cd.bdc_id = i.bdc_id
                WHERE i.bds_id = :id AND (NOT :pub OR EXISTS (
                  SELECT 1 FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                  WHERE bp.bdc_id = cd.bdc_id))
                ORDER BY cd.display_name, cd.bdc_id""")
            .bind("id", id).bind("pub", publicOnly)
            .map(r -> new Substance.ClinicalDrugRef(r.get("bdc_id", String.class), r.get("display_name", String.class)))
            .all().collectList();
    }

    static List<String> list(Readable r, String column) {
        String[] values = r.get(column, String[].class);
        return values == null ? List.of() : Arrays.asList(values);
    }
}
