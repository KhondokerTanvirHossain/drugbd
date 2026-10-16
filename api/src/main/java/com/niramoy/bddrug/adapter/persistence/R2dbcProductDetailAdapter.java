package com.niramoy.bddrug.adapter.persistence;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.application.port.ProductDetailPort;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PublicProducts;
import com.niramoy.bddrug.domain.PublicProducts.Facts;
import com.niramoy.bddrug.domain.PublicProducts.StageRow;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Facts for an approved product's public detail. Public status is read only through ReviewSql.LATEST_PUBLIC (§7.4); the
 * latest item is read in ReviewSql.statusOf order, and only its decisions date the verification line
 * (PublicProducts.approvedAt). Eight queries, none per row. Decision notes and emails are never selected.
 */
@Component
public class R2dbcProductDetailAdapter implements ProductDetailPort {
    private static final ObjectMapper JSON = new ObjectMapper();
    private record Latest(String batchId, Instant extractedAt) {}

    private final DatabaseClient db;
    private final IngredientSummaryReader summaries;
    public R2dbcProductDetailAdapter(DatabaseClient db, IngredientSummaryReader summaries) {
        this.db = db;
        this.summaries = summaries;
    }

    @Override public Mono<Facts> facts(String conceptId, String bdcId, String route) {
        Mono<Latest> latest = db.sql("SELECT batch_id, extracted_at FROM ops.batch_item WHERE concept_id = :c " +
                                     "ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1")
            .bind("c", conceptId)
            .map(r -> new Latest(r.get("batch_id", String.class), instant(r.get("extracted_at", OffsetDateTime.class))))
            .one().defaultIfEmpty(new Latest(null, null)).cache();
        // The counting approval of the latest item: after its stamp and after the latest dismissal (§5.2, D57); pharmacists
        // and seniors publish, an engineer's ok never does (G3, D49). Decisions on other batches' items never count.
        Mono<Optional<Instant>> approvedAt = latest.flatMap(l -> l.batchId() == null ? Mono.just(Optional.<Instant>empty())
            : decisions(l.batchId(), conceptId).map(ds -> Optional.ofNullable(PublicProducts.approvedAt(ds, l.extractedAt()))));
        Mono<Optional<Instant>> fetched = db.sql("SELECT max(fetched_at) AS at FROM raw.ocl_concept WHERE concept_id = :c")
            .bind("c", conceptId).map(r -> Optional.ofNullable(instant(r.get("at", OffsetDateTime.class)))).one();
        Mono<Integer> others = bdcId == null ? Mono.just(0) : db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                "SELECT count(*) AS n FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id " +
                "WHERE l.pub AND bp.bdc_id = :bdc AND bp.concept_id <> :c")
            .bind("bdc", bdcId).bind("c", conceptId).map(r -> r.get("n", Long.class).intValue()).one();
        Mono<List<IngredientSummary>> ingredients = summaries.read(conceptId, bdcId, route);
        return Mono.zip(latest, approvedAt, fetched, others, ingredients).flatMap(t -> {
            Latest l = t.getT1();
            Mono<List<StageRow>> stages = l.batchId() == null ? Mono.just(List.of()) : stages(l.batchId(), conceptId);
            return stages.flatMap(rows -> {
                Set<String> ids = new TreeSet<>();
                for (StageRow s : rows) for (String[] m : s.textMissing()) { ids.add(m[0]); ids.add(m[1]); }
                return Mono.zip(names(ids), severities(ids), publicIds(ids)).map(u -> new Facts(l.batchId(), l.extractedAt(),
                    t.getT2().orElse(null), t.getT3().orElse(null), rows, u.getT1(), u.getT2(), u.getT3(), t.getT4(), t.getT5()));
            });
        });
    }

    private Mono<List<ReviewDecision>> decisions(String batchId, String conceptId) {
        return db.sql("SELECT id, decision, reviewer_role, decided_at FROM ops.review_decision WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
                r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant()))
            .all().collectList();
    }

    private Mono<List<StageRow>> stages(String batchId, String conceptId) {
        return db.sql("SELECT stage, status, note, evidence::text AS evidence FROM ops.stage_result WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new StageRow(r.get("stage", String.class), r.get("status", String.class), r.get("note", String.class),
                "ddinter".equals(r.get("stage", String.class)) ? textMissing(r.get("evidence", String.class)) : List.of()))
            .all().collectList();
    }

    /** evidence.text_missing as [[a, b], …]; empty when absent or unreadable. */
    static List<String[]> textMissing(String evidence) {
        List<String[]> out = new ArrayList<>();
        if (evidence == null) return out;
        try {
            for (JsonNode pair : JSON.readTree(evidence).path("text_missing"))
                if (pair.size() == 2) out.add(new String[]{pair.get(0).asText(), pair.get(1).asText()});
        } catch (Exception e) {
            return List.of();
        }
        return out;
    }

    private Mono<Map<String, String>> names(Set<String> ids) {
        if (ids.isEmpty()) return Mono.just(Map.of());
        return db.sql("SELECT ddinter_id, name FROM curated.ddinter_drug WHERE ddinter_id = ANY(:ids)")
            .bind("ids", ids.toArray(String[]::new))
            .map(r -> Map.entry(r.get("ddinter_id", String.class), r.get("name", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    private Mono<Map<String, String>> severities(Set<String> ids) {
        if (ids.isEmpty()) return Mono.just(Map.of());
        String[] arr = ids.toArray(String[]::new);
        return db.sql("SELECT ddinter_a, ddinter_b, severity FROM curated.ddinter_pair WHERE ddinter_a = ANY(:ids) AND ddinter_b = ANY(:ids)")
            .bind("ids", arr)
            .map(r -> Map.entry(r.get("ddinter_a", String.class) + "|" + r.get("ddinter_b", String.class), r.get("severity", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** The given DDInter ids that belong to a substance a public product carries (§7.4: a substance is public then). */
    private Mono<Set<String>> publicIds(Set<String> ids) {
        if (ids.isEmpty()) return Mono.just(Set.of());
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " + """
                SELECT DISTINCT c.code
                FROM curated.brand_product bp
                JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                JOIN curated.substance_code c ON c.bds_id = x.bds_id AND c.system = 'DDINTER'
                WHERE c.code = ANY(:ids)""")
            .bind("ids", ids.toArray(String[]::new))
            .map(r -> r.get("code", String.class)).all().collect(java.util.stream.Collectors.toSet());
    }

    private static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
}
