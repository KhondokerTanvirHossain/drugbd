package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.SeniorReviewPort;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SeniorViews;
import com.niramoy.bddrug.domain.SourceLinks;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Senior review SQL (§7.7). Held products come from the latest current item only (statusOf semantics, PO D7). */
@Component
public class R2dbcSeniorReviewAdapter implements SeniorReviewPort {
    static final String LATEST = "latest AS (SELECT DISTINCT ON (concept_id) batch_id, concept_id, review, note, extracted_at "
        + "FROM ops.batch_item ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC)";

    protected final DatabaseClient db;
    protected final IngredientSummaryReader ingredients;
    protected final PairReviewReader pairReviews;
    public R2dbcSeniorReviewAdapter(DatabaseClient db, IngredientSummaryReader ingredients, PairReviewReader pairReviews) {
        this.db = db;
        this.ingredients = ingredients;
        this.pairReviews = pairReviews;
    }

    private static Instant at(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
    private static String[] arr(Collection<String> c) { return c.stream().distinct().toArray(String[]::new); }

    /**
     * Narrow, unordered rows (one per held product and ingredient); the substance and clinical-drug facts are looked up by key
     * in two small queries. No ORDER BY: Task 7b measured an ORDER BY on the collated trade name over every held product
     * (it spilled to disk) against the §10.6 300 ms p95; the service orders only the lists it shows (BRAND_ORDER).
     */
    @Override public Mono<List<HeldRow>> held() {
        Mono<List<Narrow>> rows = db.sql("WITH " + LATEST + """
                SELECT l.batch_id, l.concept_id, coalesce(bp.trade_name, l.concept_id) AS trade_name, bp.bdc_id, bpi.xm_code
                FROM latest l
                LEFT JOIN curated.brand_product bp ON bp.concept_id = l.concept_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                WHERE l.note IS DISTINCT FROM '%s'""".formatted(ReviewSql.REMOVED_NOTE))
            .map(r -> new Narrow(r.get(0, String.class), r.get(1, String.class), r.get(2, String.class), r.get(3, String.class),
                r.get(4, String.class)))
            .all().collectList();
        return rows.flatMap(list -> {
            String[] xm = list.stream().map(Narrow::xmCode).filter(Objects::nonNull).distinct().toArray(String[]::new);
            String[] bdc = list.stream().map(Narrow::bdcId).filter(Objects::nonNull).distinct().toArray(String[]::new);
            return Mono.zip(xmFacts(xm), clinical(bdc)).map(t -> heldRows(list, t.getT1(), t.getT2()));
        });
    }

    private record Narrow(String batchId, String conceptId, String tradeName, String bdcId, String xmCode) {}
    private record XmFact(String bdsId, String substance, String coverage) {}
    private record Clinical(String displayName, String route) {}

    private static List<HeldRow> heldRows(List<Narrow> rows, Map<String, XmFact> facts, Map<String, Clinical> clinical) {
        List<HeldRow> out = new ArrayList<>(rows.size());
        for (Narrow n : rows) {
            XmFact f = n.xmCode() == null ? null : facts.get(n.xmCode());
            Clinical c = n.bdcId() == null ? null : clinical.get(n.bdcId());
            out.add(new HeldRow(n.conceptId(), n.batchId(), n.tradeName(), n.bdcId(), c == null ? null : c.displayName(),
                c == null ? null : c.route(), n.xmCode(), f == null ? null : f.bdsId(), f == null ? null : f.substance(),
                f == null ? null : f.coverage()));
        }
        return out;
    }

    /** The substance, its name and its coverage behind each XM code (one query). */
    private Mono<Map<String, XmFact>> xmFacts(String[] xmCodes) {
        if (xmCodes.length == 0) return Mono.just(Map.of());
        return db.sql("""
                SELECT xm.code, xm.bds_id, s.preferred_name, coalesce(ic.coverage, 'not_run') AS coverage
                FROM curated.substance_code xm
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE xm.system = 'ICD11_XM' AND xm.code = ANY(:codes)""")
            .bind("codes", xmCodes)
            .map(r -> Map.entry(r.get(0, String.class), new XmFact(r.get(1, String.class), r.get(2, String.class), r.get(3, String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** Display name and route of each clinical drug (one query). */
    private Mono<Map<String, Clinical>> clinical(String[] bdcIds) {
        if (bdcIds.length == 0) return Mono.just(Map.of());
        return db.sql("SELECT bdc_id, display_name, route FROM curated.clinical_drug WHERE bdc_id = ANY(:ids)")
            .bind("ids", bdcIds)
            .map(r -> Map.entry(r.get(0, String.class), new Clinical(r.get(1, String.class), r.get(2, String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** Read beside held() (not after it): the substances are found in SQL, so no rows travel twice. */
    @Override public Mono<List<Code>> heldDdinterCodes() {
        return db.sql("WITH " + LATEST + """
                SELECT dd.bds_id, dd.code, dd.route_scope FROM curated.substance_code dd
                WHERE dd.system = 'DDINTER' AND dd.bds_id IN (
                  SELECT xm.bds_id FROM curated.substance_code xm
                  JOIN curated.brand_product_ingredient bpi ON bpi.xm_code = xm.code
                  JOIN latest l ON l.concept_id = bpi.concept_id
                  WHERE xm.system = 'ICD11_XM' AND l.note IS DISTINCT FROM '%s')
                ORDER BY dd.bds_id COLLATE "C", dd.code COLLATE "C\"""".formatted(ReviewSql.REMOVED_NOTE))
            .map(r -> new Code(r.get(0, String.class), r.get(1, String.class), r.get(2, String.class)))
            .all().collectList();
    }

    @Override public Mono<List<PairLite>> pairsAmong(Collection<String> codes) {
        if (codes.isEmpty()) return Mono.just(List.of());
        return db.sql("SELECT ddinter_a, ddinter_b, severity FROM curated.ddinter_pair WHERE ddinter_a = ANY(:c) AND ddinter_b = ANY(:c)")
            .bind("c", arr(codes))
            .map(r -> new PairLite(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("severity", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairDetails(List<String> as, List<String> bs) {
        if (as.isEmpty()) return Mono.just(List.of());
        if (as.size() != bs.size()) throw new IllegalArgumentException("pairDetails: as and bs must be aligned");
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management,
                       p.interaction_id
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE (p.ddinter_a, p.ddinter_b) IN (SELECT * FROM unnest(:as::text[], :bs::text[]))""")
            .bind("as", as.toArray(String[]::new)).bind("bs", bs.toArray(String[]::new))
            .map(R2dbcReviewQueryAdapter::pairRow).all().collectList();
    }

    @Override public Mono<Map<String, List<PairReviewRule.Decision>>> reviews(Collection<String> codes, String viewerEmail) {
        return pairReviews.forCodes(codes, viewerEmail);
    }

    @Override public Mono<Map<String, EntryInfo>> entries(Collection<String> codes) {
        if (codes.isEmpty()) return Mono.just(Map.of());
        return db.sql("SELECT ddinter_id, name, fetched_at FROM curated.ddinter_drug WHERE ddinter_id = ANY(:ids)")
            .bind("ids", arr(codes))
            .map(r -> Map.entry(r.get("ddinter_id", String.class),
                new EntryInfo(r.get("name", String.class), at(r.get("fetched_at", OffsetDateTime.class)))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    @Override public Mono<Map<String, ItemState>> itemStates(Collection<String> itemKeys) {
        if (itemKeys.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT batch_id, concept_id, review, extracted_at FROM ops.batch_item
                WHERE (batch_id, concept_id) IN (SELECT * FROM unnest(:b::text[], :c::text[]))""")
            .bind("b", batches(itemKeys)).bind("c", concepts(itemKeys))
            .map(r -> Map.entry(r.get(0, String.class) + "|" + r.get(1, String.class),
                new ItemState(r.get(2, String.class), at(r.get(3, OffsetDateTime.class)))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** Item keys are "{batchId}|{conceptId}"; batch ids never hold '|'. Aligned by index with {@link #concepts}. */
    private static String[] batches(Collection<String> itemKeys) {
        return itemKeys.stream().distinct().map(k -> k.substring(0, k.indexOf('|'))).toArray(String[]::new);
    }

    private static String[] concepts(Collection<String> itemKeys) {
        return itemKeys.stream().distinct().map(k -> k.substring(k.indexOf('|') + 1)).toArray(String[]::new);
    }

    @Override public Mono<Map<String, List<ReviewDecision>>> decisions(Collection<String> itemKeys) {
        if (itemKeys.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT batch_id, concept_id, id, decision, reviewer_role, decided_at FROM ops.review_decision
                WHERE (batch_id, concept_id) IN (SELECT * FROM unnest(:b::text[], :c::text[])) ORDER BY decided_at, id""")
            .bind("b", batches(itemKeys)).bind("c", concepts(itemKeys))
            .map(r -> Map.entry(r.get("batch_id", String.class) + "|" + r.get("concept_id", String.class),
                new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
                    r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant())))
            .all()
            .collect(HashMap<String, List<ReviewDecision>>::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()))
            .map(m -> (Map<String, List<ReviewDecision>>) m);
    }

    @Override public Mono<SubstanceFacts> substance(String bdsId) {
        Mono<List<SeniorViews.Name>> names = db.sql("SELECT name, name_type, source FROM curated.substance_name WHERE bds_id = :id " +
                                                    "ORDER BY " + IngredientSummaryReader.NAME_RANK + ", name")
            .bind("id", bdsId)
            .map(r -> new SeniorViews.Name(r.get("name", String.class), r.get("name_type", String.class), r.get("source", String.class)))
            .all().collectList();
        // ICD-11 comes from the DGDA register: the latest OCL fetch of any product carrying the XM code (§5.6.6).
        Mono<List<IngredientSummary.Code>> codes = db.sql(IngredientSummaryReader.codesSql(
                "SELECT max(rc.fetched_at) FROM curated.brand_product_ingredient bpi JOIN raw.ocl_concept rc ON rc.concept_id = bpi.concept_id " +
                "WHERE bpi.xm_code = c.code"))
            .bind("ids", new String[]{bdsId})
            .map(IngredientSummaryReader::code).all().collectList();
        Mono<String> coverage = db.sql("SELECT coverage FROM curated.interaction_coverage WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("coverage", String.class)).one().defaultIfEmpty("not_run");
        return db.sql("SELECT bds_id, preferred_name FROM curated.substance WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("preferred_name", String.class)).one()
            .flatMap(name -> Mono.zip(names, codes, coverage).flatMap(t -> {
                String[] dd = t.getT2().stream().filter(c -> "DDINTER".equals(c.system())).map(IngredientSummary.Code::code).toArray(String[]::new);
                Mono<Map<String, IngredientSummaryReader.EntryRow>> rows = dd.length == 0 ? Mono.just(Map.of()) : ingredients.entries(dd);
                return rows.map(e -> {
                    List<IngredientSummary.Entry> list = t.getT2().stream().filter(c -> "DDINTER".equals(c.system())).map(c -> {
                        IngredientSummaryReader.EntryRow x = e.get(c.code());
                        IngredientSummary.Counts counts = x == null ? new IngredientSummary.Counts(0, 0, 0, 0, 0)
                            : new IngredientSummary.Counts(x.major(), x.moderate(), x.minor(), x.unknown(), x.total());
                        return new IngredientSummary.Entry(c.code(), x == null ? null : x.name(), c.routeScope(), counts,
                            x == null ? 0 : x.disease(), x == null ? 0 : x.food(),
                            SourceLinks.code("DDINTER", c.code(), x == null ? null : x.fetchedAt()).orElse(null));
                    }).toList();
                    return new SubstanceFacts(bdsId, name, t.getT1(), t.getT2(), t.getT3(), list);
                });
            }));
    }

    @Override public Mono<Map<String, String>> strengths(Collection<String> bdcIds, String bdsId) {
        if (bdcIds.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT bdc_id, strength_value, strength_unit, per_value, per_unit FROM curated.clinical_drug_ingredient
                WHERE bdc_id = ANY(:bdc) AND bds_id = :bds""")
            .bind("bdc", arr(bdcIds)).bind("bds", bdsId)
            .map(r -> Map.entry(r.get("bdc_id", String.class), strengthText(r.get("strength_value", BigDecimal.class),
                r.get("strength_unit", String.class), r.get("per_value", BigDecimal.class), r.get("per_unit", String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** "{value} {unit}[ per {perValue} {perUnit}]", numbers without trailing zeros (web/lib/relations.ts strengthText). */
    static String strengthText(BigDecimal value, String unit, BigDecimal per, String perUnit) {
        if (value == null) return "";
        String base = (ClinicalDrugReader.plain(value).toPlainString() + " " + (unit == null ? "" : unit)).trim();
        return per == null ? base : (base + " per " + ClinicalDrugReader.plain(per).toPlainString() + " " + (perUnit == null ? "" : perUnit)).trim();
    }
}
