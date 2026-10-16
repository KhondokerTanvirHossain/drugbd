package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.SubstanceQueryPort;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.SourceLinks;
import com.niramoy.bddrug.domain.Substance;
import com.niramoy.bddrug.domain.SubstanceCode;
import com.niramoy.bddrug.domain.SubstanceInteractions;
import com.niramoy.bddrug.domain.SubstanceName;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
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
    /**
     * Both sides of each stored pair (ddinter_a < ddinter_b) for this substance's entries: partner_id is whichever side is
     * not this substance's entry. The substance detail and P9 both run over it; it follows MINE_CTE.
     */
    static final String SIDES_CTE = """
        , sides AS (
          SELECT p.ddinter_a, p.ddinter_b, p.ddinter_b AS partner_id, p.partner_name_b AS partner_name, p.severity, p.actions,
                 p.interaction_id, m.route_scope
          FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_a = m.code
          UNION ALL
          SELECT p.ddinter_a, p.ddinter_b, p.ddinter_a, p.partner_name_a, p.severity, p.actions, p.interaction_id, m.route_scope
          FROM mine m JOIN curated.ddinter_pair p ON p.ddinter_b = m.code)
        """;
    /** ICD-11 "fetched on" for a substance page: the DGDA register's latest fetch of any product carrying the XM code (as P1C's senior substance page). */
    static final String ICD11_FETCHED_AT = "SELECT max(rc.fetched_at) FROM curated.brand_product_ingredient bpi " +
        "JOIN raw.ocl_concept rc ON rc.concept_id = bpi.concept_id WHERE bpi.xm_code = c.code";

    private final DatabaseClient db;
    /** The per-entry count rule (IngredientSummaryReader.entries); a stateless reader over the same client. */
    private final IngredientSummaryReader entryReader;
    private final PairReviewReader pairReviews;
    public R2dbcSubstanceAdapter(DatabaseClient db, PairReviewReader pairReviews) {
        this.db = db;
        this.entryReader = new IngredientSummaryReader(db);
        this.pairReviews = pairReviews;
    }

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

    @Override public Mono<String> preferredName(String bdsId) {
        return db.sql("SELECT preferred_name FROM curated.substance WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("preferred_name", String.class)).one();
    }

    @Override public Mono<Boolean> isPublic(String bdsId) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBLIC_SUBSTANCES + " SELECT EXISTS (SELECT 1 FROM pubsub WHERE bds_id = :id) AS pub")
            .bind("id", bdsId).map(r -> Boolean.TRUE.equals(r.get("pub", Boolean.class))).one();
    }

    private record PairRow(String partnerName, String partnerBdsId, String ddinterA, String ddinterB, String routeScope, String severity,
                           List<String> actions, String interactionId, String interaction, String management) {}

    @Override public Mono<InteractionsPage> interactionsPage(String bdsId, String severity, int limit, int offset, boolean publicOnly) {
        String sides = "WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBLIC_SUBSTANCES + ", " + MINE_CTE + SIDES_CTE;
        String where = " WHERE (CAST(:sev AS text) IS NULL OR s.severity = :sev) ";
        DatabaseClient.GenericExecuteSpec count = db.sql(sides + "SELECT count(*) AS n FROM sides s" + where).bind("id", bdsId);
        count = severity == null ? count.bindNull("sev", String.class) : count.bind("sev", severity);
        DatabaseClient.GenericExecuteSpec page = db.sql(sides + """
                SELECT s.ddinter_a, s.ddinter_b, s.partner_name, s.severity, s.actions, s.interaction_id, s.route_scope,
                       t.interaction, t.management,\s""" + partnerBdsIdSql(publicOnly) + " AS partner_bds_id " +
                "FROM sides s LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = s.interaction_id" + where +
                "ORDER BY " + SEVERITY_RANK.formatted("s.severity") + ", lower(s.partner_name), s.partner_name, s.route_scope, s.partner_id " +
                "LIMIT :limit OFFSET :offset")
            .bind("id", bdsId).bind("limit", limit).bind("offset", offset);
        page = severity == null ? page.bindNull("sev", String.class) : page.bind("sev", severity);
        Mono<Integer> total = count.map(r -> r.get("n", Long.class).intValue()).one();
        Mono<List<PairRow>> rows = page.map(r -> new PairRow(r.get("partner_name", String.class), r.get("partner_bds_id", String.class),
                r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("route_scope", String.class),
                r.get("severity", String.class), list(r, "actions"), r.get("interaction_id", String.class),
                r.get("interaction", String.class), r.get("management", String.class)))
            .all().collectList();
        return Mono.zip(total, entries(bdsId), rows).flatMap(t -> {
            // §7.4: a pair review is served only for pairs between public products. Under public scope a pair whose partner
            // substance is not public (partnerBdsId null) is not even read, and reads not_reviewed with no date.
            List<PublicPairReviews.Pair> pairs = t.getT3().stream().filter(p -> !publicOnly || p.partnerBdsId() != null)
                .map(p -> new PublicPairReviews.Pair(p.ddinterA(), p.ddinterB(), p.severity(), p.actions(), p.interaction(),
                    p.management()))
                .toList();
            return pairReviews.forCodes(PublicPairReviews.codes(pairs), null).map(d -> PublicPairReviews.of(pairs, d))
                .map(rv -> new InteractionsPage(t.getT1(), t.getT2(), t.getT3().stream().map(p -> new SubstanceInteractions.Item(
                    p.partnerName(), p.partnerBdsId(), p.ddinterA(), p.ddinterB(), p.routeScope(), p.severity(), p.actions(),
                    p.interaction(), p.management(),
                    publicOnly && p.partnerBdsId() == null ? PublicPairReviews.NONE
                        : rv.getOrDefault(p.ddinterA() + "|" + p.ddinterB(), PublicPairReviews.NONE),
                    SourceLinks.pair(p.interactionId()).map(SourceLinks.Source::url).orElse(null))).toList()));
        });
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
     * The partner's BDS id for a row of SIDES_CTE. Under public scope it is looked up among public substances only (pubsub),
     * so a private partner is never linked and P9 serves it no pair review (§7.4). One rule for the substance detail and P9.
     */
    static String partnerBdsIdSql(boolean publicOnly) {
        return publicOnly
            ? "(SELECT min(c.bds_id) FROM curated.substance_code c JOIN pubsub ps ON ps.bds_id = c.bds_id " +
              "WHERE c.system = 'DDINTER' AND c.code = s.partner_id)"
            : "(SELECT min(c.bds_id) FROM curated.substance_code c WHERE c.system = 'DDINTER' AND c.code = s.partner_id)";
    }

    /** The substance detail's pair list: SIDES_CTE with the partner looked up by partnerBdsIdSql (§7.4). */
    private Mono<List<Substance.Interaction>> interactions(String id, boolean publicOnly) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBLIC_SUBSTANCES + ", " + MINE_CTE + SIDES_CTE + """
                SELECT s.partner_name, s.severity, s.actions, s.interaction_id, s.route_scope,\s""" + partnerBdsIdSql(publicOnly) + """
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

    /**
     * Per-entry counts come from IngredientSummaryReader.entries, the one rule the product page reads too (§6.5 item 4,
     * §6.6, §7.3), so both pages give the same numbers. A code with no row gets zero counts, no name and no link.
     */
    private Mono<List<Substance.Entry>> entries(String id) {
        return db.sql(MINE + "SELECT code, route_scope FROM mine")
            .bind("id", id)
            .map(r -> new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class)))
            .all().collectList()
            .flatMap(codes -> codes.isEmpty() ? Mono.just(List.<Substance.Entry>of())
                : entryReader.entries(codes.stream().map(DdinterCode::code).distinct().toArray(String[]::new))
                    .map(rows -> codes.stream().sorted(java.util.Comparator.comparing(DdinterCode::code, DdinterCode.ID_ORDER))
                        .map(c -> entry(c, rows.get(c.code()))).toList()));
    }

    private static Substance.Entry entry(DdinterCode c, IngredientSummaryReader.EntryRow row) {
        if (row == null) return new Substance.Entry(c.code(), null, c.routeScope(), new IngredientSummary.Counts(0, 0, 0, 0, 0), 0, 0, null);
        return new Substance.Entry(c.code(), row.name(), c.routeScope(),
            new IngredientSummary.Counts(row.major(), row.moderate(), row.minor(), row.unknown(), row.total()), row.disease(), row.food(),
            SourceLinks.code("DDINTER", c.code(), row.fetchedAt()).orElse(null));
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
