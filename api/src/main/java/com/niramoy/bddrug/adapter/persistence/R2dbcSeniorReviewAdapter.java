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

    @Override public Mono<List<HeldRow>> held() {
        return db.sql("WITH " + LATEST + """
                SELECT l.batch_id, l.concept_id, coalesce(bp.trade_name, l.concept_id) AS trade_name, l.review, l.extracted_at,
                       bp.bdc_id, cd.display_name, cd.route, bpi.xm_code, bpi.ingredient_name, xm.bds_id, s.preferred_name,
                       CASE WHEN xm.bds_id IS NULL THEN NULL ELSE coalesce(ic.coverage, 'not_run') END AS coverage
                FROM latest l
                LEFT JOIN curated.brand_product bp ON bp.concept_id = l.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE l.note IS DISTINCT FROM '%s'
                ORDER BY l.batch_id COLLATE "C", trade_name, l.concept_id COLLATE "C", bpi.xm_code COLLATE "C\"""".formatted(ReviewSql.REMOVED_NOTE))
            .map(r -> new HeldRow(r.get("concept_id", String.class), r.get("batch_id", String.class), r.get("trade_name", String.class),
                r.get("review", String.class), at(r.get("extracted_at", OffsetDateTime.class)), r.get("bdc_id", String.class),
                r.get("display_name", String.class), r.get("route", String.class), r.get("xm_code", String.class),
                r.get("ingredient_name", String.class), r.get("bds_id", String.class), r.get("preferred_name", String.class),
                r.get("coverage", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<Code>> ddinterCodes(Collection<String> bdsIds) {
        if (bdsIds.isEmpty()) return Mono.just(List.of());
        return db.sql("SELECT bds_id, code, route_scope FROM curated.substance_code WHERE system = 'DDINTER' AND bds_id = ANY(:ids) " +
                      "ORDER BY bds_id, code")
            .bind("ids", arr(bdsIds))
            .map(r -> new Code(r.get("bds_id", String.class), r.get("code", String.class), r.get("route_scope", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<PairLite>> pairsAmong(Collection<String> codes) {
        if (codes.isEmpty()) return Mono.just(List.of());
        return db.sql("SELECT ddinter_a, ddinter_b, severity FROM curated.ddinter_pair WHERE ddinter_a = ANY(:c) AND ddinter_b = ANY(:c)")
            .bind("c", arr(codes))
            .map(r -> new PairLite(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("severity", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairDetails(Collection<String> as, Collection<String> bs) {
        if (as.isEmpty() || bs.isEmpty()) return Mono.just(List.of());
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management,
                       p.interaction_id
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE p.ddinter_a = ANY(:as) AND p.ddinter_b = ANY(:bs)""")
            .bind("as", arr(as)).bind("bs", arr(bs))
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

    @Override public Mono<Map<String, List<ReviewDecision>>> decisions(Collection<String> itemKeys) {
        if (itemKeys.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT batch_id, concept_id, id, decision, reviewer_role, decided_at FROM ops.review_decision
                WHERE batch_id || '|' || concept_id = ANY(:keys) ORDER BY decided_at, id""")
            .bind("keys", arr(itemKeys))
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
