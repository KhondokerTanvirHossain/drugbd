package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ReviewQueryPort;
import com.niramoy.bddrug.domain.ReviewDecision;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** All reviewer read SQL (spec §7.3). Every query skips items marked "removed from batch file". */
@Component
public class R2dbcReviewQueryAdapter implements ReviewQueryPort {
    static final String STAGE_ORDER = "array_position(ARRAY['dgda','substances','clinical','ddinter'], stage)";

    protected final DatabaseClient db;
    public R2dbcReviewQueryAdapter(DatabaseClient db) { this.db = db; }

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

    static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
}
