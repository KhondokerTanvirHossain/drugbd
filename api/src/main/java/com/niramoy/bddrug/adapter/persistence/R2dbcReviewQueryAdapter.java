package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ReviewQueryPort;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.DdinterText;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.ItemHistory;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.ReviewItem;
import com.niramoy.bddrug.domain.SourceLinks;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** All reviewer read SQL (spec §7.3). Every query skips items marked "removed from batch file". */
@Component
public class R2dbcReviewQueryAdapter implements ReviewQueryPort {
    static final String STAGE_ORDER = "array_position(ARRAY['dgda','substances','clinical','ddinter'], stage)";

    protected final DatabaseClient db;
    private final IngredientSummaryReader ingredientsReader;
    private final PairReviewReader pairReviews;
    public R2dbcReviewQueryAdapter(DatabaseClient db, IngredientSummaryReader ingredientsReader, PairReviewReader pairReviews) {
        this.db = db;
        this.ingredientsReader = ingredientsReader;
        this.pairReviews = pairReviews;
    }

    private static BatchRow toBatch(Readable r) {
        return new BatchRow(r.get("batch_id", String.class), r.get("status", String.class),
            r.get("run_at", OffsetDateTime.class).toInstant());
    }

    @Override public Flux<BatchRow> batches() {
        return db.sql("SELECT batch_id, status, run_at FROM ops.batch ORDER BY run_at DESC, batch_id COLLATE \"C\"")
            .map(R2dbcReviewQueryAdapter::toBatch).all();
    }

    @Override public Mono<BatchRow> batch(String batchId) {
        return db.sql("SELECT batch_id, status, run_at FROM ops.batch WHERE batch_id = :b").bind("b", batchId)
            .map(R2dbcReviewQueryAdapter::toBatch).one();
    }

    private record ItemRow(String conceptId, String review, Instant extractedAt, String tradeName, String darNumber,
                           String company, String generic, String clinical) {}

    private static <T> Mono<HashMap<String, List<T>>> grouped(Flux<Map.Entry<String, T>> rows) {
        return rows.collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }

    @Override public Mono<List<ItemFacts>> items(String batchId) {
        Mono<List<ItemRow>> rows = db.sql("""
                SELECT bi.concept_id, bi.review, bi.extracted_at, coalesce(bp.trade_name, bi.concept_id) AS trade_name,
                       bp.dar_number, bp.company, bp.generic_content_raw, cd.display_name
                FROM ops.batch_item bi
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                WHERE bi.batch_id = :b AND %s
                ORDER BY bi.concept_id COLLATE "C\"""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId)
            .map(r -> new ItemRow(r.get("concept_id", String.class), r.get("review", String.class),
                instant(r.get("extracted_at", OffsetDateTime.class)), r.get("trade_name", String.class),
                r.get("dar_number", String.class), r.get("company", String.class), r.get("generic_content_raw", String.class),
                r.get("display_name", String.class)))
            .all().collectList();
        Mono<HashMap<String, List<StageRow>>> stages = grouped(db.sql(
                "SELECT concept_id, stage, status, note, evidence::text AS evidence FROM ops.stage_result WHERE batch_id = :b " +
                "ORDER BY concept_id, " + STAGE_ORDER)
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), new StageRow(r.get("stage", String.class),
                r.get("status", String.class), r.get("note", String.class), r.get("evidence", String.class))))
            .all());
        Mono<HashMap<String, List<IngredientFact>>> ingredients = grouped(db.sql("""
                SELECT bpi.concept_id, bpi.ingredient_name, xm.bds_id, s.preferred_name,
                       CASE WHEN xm.bds_id IS NULL THEN NULL ELSE coalesce(ic.coverage, 'not_run') END AS coverage
                FROM ops.batch_item bi
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bi.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE bi.batch_id = :b
                ORDER BY bpi.concept_id, bpi.xm_code COLLATE "C\"""")
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), new IngredientFact(r.get("bds_id", String.class),
                r.get("preferred_name", String.class) != null ? r.get("preferred_name", String.class) : r.get("ingredient_name", String.class),
                r.get("ingredient_name", String.class), r.get("coverage", String.class))))
            .all());
        Mono<HashMap<String, List<ReviewDecision>>> decisions = grouped(db.sql("""
                SELECT concept_id, id, decision, note, reviewer_email, reviewer_role, decided_at FROM ops.review_decision
                WHERE batch_id = :b ORDER BY decided_at, id""")
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), new ReviewDecision(r.get("id", Long.class),
                r.get("decision", String.class), r.get("note", String.class), r.get("reviewer_email", String.class),
                r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant())))
            .all());
        return Mono.zip(rows, stages, ingredients, decisions).map(t -> t.getT1().stream().map(i -> new ItemFacts(i.conceptId(),
                i.review(), i.extractedAt(), i.tradeName(), i.darNumber(), i.company(), i.generic(), i.clinical(),
                List.copyOf(t.getT2().getOrDefault(i.conceptId(), List.of())),
                List.copyOf(t.getT3().getOrDefault(i.conceptId(), List.of())),
                List.copyOf(t.getT4().getOrDefault(i.conceptId(), List.of())))).toList());
    }

    @Override public Mono<ItemDetail> itemDetail(String batchId, String conceptId) {
        Mono<List<ReviewItem.DgdaIngredient>> dgda = db.sql(
                "SELECT xm_code, ingredient_name FROM curated.brand_product_ingredient WHERE concept_id = :c ORDER BY xm_code COLLATE \"C\"")
            .bind("c", conceptId)
            .map(r -> new ReviewItem.DgdaIngredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class)))
            .all().collectList();
        return db.sql("""
                SELECT bi.concept_id, rc.payload::text AS source_json, bp.concept_id AS brand_id, bp.dar_number, bp.trade_name,
                       bp.company, bp.dosage_form, bp.generic_content_raw, bp.quality_flag, bp.parse_status, bp.parse_note,
                       bp.bdc_id, cd.display_name, cd.dose_form, cd.route, cd.signature, rc.fetched_at AS ocl_fetched_at
                FROM ops.batch_item bi
                LEFT JOIN raw.ocl_concept rc ON rc.source = bi.source AND rc.concept_id = bi.concept_id
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                WHERE bi.batch_id = :b AND bi.concept_id = :c AND %s""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> {
                String brandId = r.get("brand_id", String.class);
                String bdcId = r.get("bdc_id", String.class);
                OffsetDateTime fetched = r.get("ocl_fetched_at", OffsetDateTime.class);
                ReviewItem.Brand brand = brandId == null ? null : new ReviewItem.Brand(brandId, r.get("dar_number", String.class),
                    r.get("trade_name", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
                    r.get("generic_content_raw", String.class), r.get("quality_flag", String.class),
                    r.get("parse_status", String.class), r.get("parse_note", String.class),
                    SourceLinks.brand(brandId, fetched == null ? null : fetched.toInstant()));
                ReviewItem.Clinical clinical = r.get("display_name", String.class) == null ? null : new ReviewItem.Clinical(bdcId,
                    r.get("display_name", String.class), r.get("dose_form", String.class), r.get("route", String.class),
                    r.get("signature", String.class));
                return new ItemDetail(r.get("concept_id", String.class), r.get("source_json", String.class), brand, clinical, bdcId, List.of());
            })
            .one()
            .flatMap(d -> dgda.map(list -> new ItemDetail(d.conceptId(), d.sourceJson(), d.brand(), d.clinical(), d.bdcId(), list)));
    }

    @Override public Mono<List<IngredientSummary>> ingredients(String conceptId, String bdcId, String route) {
        return ingredientsReader.read(conceptId, bdcId, route);
    }

    private record ProductRow(String conceptId, String tradeName, String route, String xmCode, String ingredientName, String bdsId,
                              String substance, String coverage) {}

    @Override public Mono<List<BatchPairs.Product>> batchProducts(String batchId) {
        return db.sql("""
                SELECT bi.concept_id, coalesce(bp.trade_name, bi.concept_id) AS trade_name, cd.route, bpi.xm_code,
                       bpi.ingredient_name, xm.bds_id, s.preferred_name,
                       CASE WHEN xm.bds_id IS NULL THEN NULL ELSE coalesce(ic.coverage, 'not_run') END AS coverage
                FROM ops.batch_item bi
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bi.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE bi.batch_id = :b AND %s
                ORDER BY bi.concept_id COLLATE "C", bpi.xm_code COLLATE "C\"""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId)
            .map(r -> new ProductRow(r.get("concept_id", String.class), r.get("trade_name", String.class), r.get("route", String.class),
                r.get("xm_code", String.class), r.get("ingredient_name", String.class), r.get("bds_id", String.class),
                r.get("preferred_name", String.class), r.get("coverage", String.class)))
            .all().collectList()
            .flatMap(rows -> {
                String[] bds = rows.stream().map(ProductRow::bdsId).filter(Objects::nonNull).distinct().toArray(String[]::new);
                Mono<Map<String, List<DdinterCode>>> codes = bds.length == 0 ? Mono.just(Map.of()) : db.sql(
                        "SELECT bds_id, code, route_scope FROM curated.substance_code WHERE system = 'DDINTER' AND bds_id = ANY(:ids)")
                    .bind("ids", bds)
                    .map(r -> Map.entry(r.get("bds_id", String.class), new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class))))
                    .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
                return codes.map(c -> products(rows, c));
            });
    }

    private static List<BatchPairs.Product> products(List<ProductRow> rows, Map<String, List<DdinterCode>> codes) {
        Map<String, List<ProductRow>> byConcept = new LinkedHashMap<>();
        for (ProductRow r : rows) byConcept.computeIfAbsent(r.conceptId(), k -> new ArrayList<>()).add(r);
        List<BatchPairs.Product> out = new ArrayList<>();
        int index = 0;
        for (List<ProductRow> group : byConcept.values()) {
            ProductRow first = group.get(0);
            List<BatchPairs.Substance> subs = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (ProductRow r : group) {
                if (r.xmCode() == null || (r.bdsId() != null && !seen.add(r.bdsId()))) continue;
                subs.add(new BatchPairs.Substance(r.bdsId(), r.substance() != null ? r.substance() : r.ingredientName(), r.coverage(),
                    r.bdsId() == null ? List.of() : List.copyOf(codes.getOrDefault(r.bdsId(), List.of()))));
            }
            out.add(new BatchPairs.Product(first.conceptId(), first.tradeName(), ++index, first.route(), List.copyOf(subs)));
        }
        return List.copyOf(out);
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairRows(Collection<String> ids) {
        if (ids.isEmpty()) return Mono.just(List.of());
        String[] arr = ids.stream().distinct().toArray(String[]::new);
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management,
                       p.interaction_id
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE p.ddinter_a = ANY(:ids) AND p.ddinter_b = ANY(:ids)""")
            .bind("ids", arr)
            .map(R2dbcReviewQueryAdapter::pairRow)
            .all().collectList();
    }

    /** One ingredient row of a held product; {@code name} is the DGDA ingredient name only where no substance carries the XM code. */
    private record HeldRow(String batchId, String conceptId, String tradeName, String route, boolean approved, String xmCode,
                           String name) {}
    private record XmFact(String bdsId, String substance, String coverage) {}

    /*
     * §7.3 scale test (40,000 held products, API p95 300 ms): the rows are narrow and unordered. Substance facts come from a
     * lookup by XM code, and the order (batch, trade name ignoring case, concept id: BatchPairs.computeFor's partner order)
     * is applied in Java. An ORDER BY on the locale-collated trade name spilled to disk and cost more than the query.
     */
    @Override public Mono<List<BatchPairs.OtherProduct>> otherProducts(String batchId) {
        Mono<List<HeldRow>> held = db.sql("""
                WITH latest AS (SELECT DISTINCT ON (concept_id) batch_id, concept_id, review, note FROM ops.batch_item
                                ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC)
                SELECT l.batch_id, l.concept_id, coalesce(bp.trade_name, l.concept_id) AS trade_name, cd.route,
                       l.review = 'ok' AS approved, bpi.xm_code,
                       CASE WHEN s.preferred_name IS NULL THEN bpi.ingredient_name END AS name
                FROM latest l
                LEFT JOIN curated.brand_product bp ON bp.concept_id = l.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                LEFT JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                WHERE l.note IS DISTINCT FROM '%1$s' AND l.batch_id <> :b
                  AND NOT EXISTS (SELECT 1 FROM ops.batch_item t WHERE t.batch_id = :b AND t.concept_id = l.concept_id
                                  AND t.note IS DISTINCT FROM '%1$s')""".formatted(ReviewSql.REMOVED_NOTE))
            .bind("b", batchId)
            .map(r -> new HeldRow(r.get(0, String.class), r.get(1, String.class), r.get(2, String.class), r.get(3, String.class),
                Boolean.TRUE.equals(r.get(4, Boolean.class)), r.get(5, String.class), r.get(6, String.class)))
            .all().collectList();
        return held.flatMap(rows -> {
            String[] xmCodes = rows.stream().map(HeldRow::xmCode).filter(Objects::nonNull).distinct().toArray(String[]::new);
            return xmFacts(xmCodes).flatMap(facts -> {
                String[] bds = facts.values().stream().map(XmFact::bdsId).distinct().toArray(String[]::new);
                return ddinterCodes(bds).map(codes -> heldProducts(rows, facts, codes));
            });
        });
    }

    /** The substance, name and coverage behind each XM code that a substance carries (one query). */
    private Mono<Map<String, XmFact>> xmFacts(String[] xmCodes) {
        if (xmCodes.length == 0) return Mono.just(Map.of());
        return db.sql("""
                SELECT xm.code, xm.bds_id, s.preferred_name, coalesce(ic.coverage, 'not_run') AS coverage
                FROM curated.substance_code xm
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE xm.system = 'ICD11_XM' AND xm.code = ANY(:codes)""")
            .bind("codes", xmCodes)
            .map(r -> Map.entry(r.get("code", String.class), new XmFact(r.get("bds_id", String.class),
                r.get("preferred_name", String.class), r.get("coverage", String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** One OtherProduct per held product, in batch (byte order), trade name ignoring case, concept id order. */
    private static List<BatchPairs.OtherProduct> heldProducts(List<HeldRow> rows, Map<String, XmFact> facts,
                                                              Map<String, List<DdinterCode>> codes) {
        Map<String, List<HeldRow>> byConcept = new HashMap<>();
        for (HeldRow r : rows) byConcept.computeIfAbsent(r.conceptId(), k -> new ArrayList<>(1)).add(r);
        record Keyed(String batchId, String name, String conceptId, BatchPairs.OtherProduct product) {}
        Map<List<String>, List<BatchPairs.Substance>> shared = new HashMap<>();
        List<Keyed> out = new ArrayList<>(byConcept.size());
        for (List<HeldRow> group : byConcept.values()) {
            if (group.size() > 1) group.sort(Comparator.comparing(HeldRow::xmCode, Comparator.nullsLast(Comparator.naturalOrder())));
            List<String> key = new ArrayList<>(group.size() * 2);
            for (HeldRow r : group) { key.add(r.xmCode()); key.add(r.name()); }
            List<BatchPairs.Substance> substances = shared.computeIfAbsent(key, k -> substances(group, facts, codes));
            HeldRow first = group.get(0);
            out.add(new Keyed(first.batchId(), first.tradeName().toLowerCase(Locale.ROOT), first.conceptId(),
                new BatchPairs.OtherProduct(first.conceptId(), first.tradeName(), first.batchId(), first.approved(), first.route(), substances)));
        }
        out.sort(Comparator.comparing(Keyed::batchId).thenComparing(Keyed::name).thenComparing(Keyed::conceptId));
        return out.stream().map(Keyed::product).toList();
    }

    /** A product's substances in XM-code order, one per substance (the same rule as batchProducts). */
    private static List<BatchPairs.Substance> substances(List<HeldRow> group, Map<String, XmFact> facts, Map<String, List<DdinterCode>> codes) {
        List<BatchPairs.Substance> subs = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (HeldRow r : group) {
            if (r.xmCode() == null) continue;
            XmFact f = facts.get(r.xmCode());
            String bdsId = f == null ? null : f.bdsId();
            if (bdsId != null && !seen.add(bdsId)) continue;
            subs.add(new BatchPairs.Substance(bdsId, f != null && f.substance() != null ? f.substance() : r.name(),
                f == null ? null : f.coverage(), bdsId == null ? List.of() : List.copyOf(codes.getOrDefault(bdsId, List.of()))));
        }
        return List.copyOf(subs);
    }

    /** The DDINTER codes of these substances, by bds_id (one query). */
    private Mono<Map<String, List<DdinterCode>>> ddinterCodes(String[] bds) {
        if (bds.length == 0) return Mono.just(Map.of());
        return db.sql("SELECT bds_id, code, route_scope FROM curated.substance_code WHERE system = 'DDINTER' AND bds_id = ANY(:ids)")
            .bind("ids", bds)
            .map(r -> Map.entry(r.get("bds_id", String.class), new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class))))
            .all().collect(HashMap<String, List<DdinterCode>>::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()))
            .map(m -> (Map<String, List<DdinterCode>>) m);
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairRowsTouching(Collection<String> mine, Collection<String> theirs) {
        if (mine.isEmpty() || theirs.isEmpty()) return Mono.just(List.of());
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management,
                       p.interaction_id
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE (p.ddinter_a = ANY(:mine) AND p.ddinter_b = ANY(:theirs)) OR (p.ddinter_b = ANY(:mine) AND p.ddinter_a = ANY(:theirs))""")
            .bind("mine", mine.stream().distinct().toArray(String[]::new)).bind("theirs", theirs.stream().distinct().toArray(String[]::new))
            .map(R2dbcReviewQueryAdapter::pairRow)
            .all().collectList();
    }

    static BatchPairs.PairRow pairRow(Readable r) {
        return new BatchPairs.PairRow(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class),
            r.get("partner_name_a", String.class), r.get("partner_name_b", String.class), r.get("severity", String.class),
            R2dbcSubstanceAdapter.list(r, "actions"), DdinterText.clean(r.get("interaction", String.class)),
            DdinterText.clean(r.get("management", String.class)), r.get("interaction_id", String.class));
    }

    @Override public Mono<Map<String, List<PairReviewRule.Decision>>> pairReviews(Collection<String> codes, String viewerEmail) {
        return pairReviews.forCodes(codes, viewerEmail);
    }

    @Override public Mono<Map<String, String>> entryNames(Collection<String> ids) {
        if (ids.isEmpty()) return Mono.just(Map.of());
        return db.sql("SELECT ddinter_id, name FROM curated.ddinter_drug WHERE ddinter_id = ANY(:ids)")
            .bind("ids", ids.stream().distinct().toArray(String[]::new))
            .map(r -> Map.entry(r.get("ddinter_id", String.class), r.get("name", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    @Override public Mono<List<ItemHistory.Snapshot>> snapshots(String batchId, String conceptId) {
        return db.sql("""
                SELECT extracted_at, run_id, reason, payload -> 'carried_from' ->> 'batchId' AS carried_from
                FROM ops.item_snapshot WHERE batch_id = :b AND concept_id = :c ORDER BY extracted_at""")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new ItemHistory.Snapshot(r.get("extracted_at", OffsetDateTime.class).toInstant(), r.get("run_id", UUID.class),
                r.get("reason", String.class), r.get("carried_from", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<Instant>> fullRuns(String batchId) {
        return db.sql("SELECT run_at FROM ops.batch_run WHERE batch_id = :b AND cardinality(concept_ids) = 0 ORDER BY run_at, id")
            .bind("b", batchId).map(r -> r.get("run_at", OffsetDateTime.class).toInstant()).all().collectList();
    }

    @Override public Mono<String> payload(String batchId, String conceptId, Instant extractedAt) {
        return db.sql("SELECT payload::text AS payload FROM ops.item_snapshot WHERE batch_id = :b AND concept_id = :c AND extracted_at = :t")
            .bind("b", batchId).bind("c", conceptId).bind("t", extractedAt.atOffset(ZoneOffset.UTC))
            .map(r -> r.get("payload", String.class)).one();
    }

    static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
}
