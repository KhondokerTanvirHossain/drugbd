package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.QaQueryPort;
import com.niramoy.bddrug.domain.ReviewDecision;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The QA read SQL (spec §7.9.4, §7.9.5). Current items only ({@link ReviewSql#CURRENT_ITEM}). Set-based: a page of records
 * is one query for its rows with their stage statuses, one for the total and one for the decisions of the page's items.
 * Decisions are read without reviewer_email and note, so neither can reach a QA response. No new index (§7.9.5).
 */
@Component
public class R2dbcQaQueryAdapter implements QaQueryPort {
    protected final DatabaseClient db;
    public R2dbcQaQueryAdapter(DatabaseClient db) { this.db = db; }

    private static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }

    @Override public Mono<BatchRow> batch(String batchId) {
        return db.sql("SELECT batch_id, status, run_at FROM ops.batch WHERE batch_id = :b").bind("b", batchId)
            .map(r -> new BatchRow(r.get("batch_id", String.class), r.get("status", String.class), instant(r.get("run_at", OffsetDateTime.class))))
            .one();
    }

    // ---- one batch

    private record ItemRow(String batchId, String conceptId, String tradeName, String review, Instant extractedAt) {}

    @Override public Mono<List<Item>> batchItems(String batchId) {
        Mono<List<ItemRow>> rows = db.sql("""
                SELECT bi.batch_id, bi.concept_id, coalesce(bp.trade_name, bi.concept_id) AS trade_name, bi.review, bi.extracted_at
                FROM ops.batch_item bi
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                WHERE bi.batch_id = :b AND %s
                ORDER BY bi.concept_id COLLATE "C\"""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId).map(R2dbcQaQueryAdapter::itemRow).all().collectList();
        Mono<Map<String, List<StageRow>>> stages = db.sql(
                "SELECT concept_id, stage, status, note FROM ops.stage_result WHERE batch_id = :b ORDER BY concept_id, " +
                R2dbcReviewQueryAdapter.STAGE_ORDER)
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), stageRow(r)))
            .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        return Mono.zip(rows, stages).map(t -> t.getT1().stream().map(i -> new Item(i.batchId(), i.conceptId(), i.tradeName(),
            i.review(), i.extractedAt(), List.copyOf(t.getT2().getOrDefault(i.conceptId(), List.of())))).toList());
    }

    private static ItemRow itemRow(Readable r) {
        return new ItemRow(r.get("batch_id", String.class), r.get("concept_id", String.class), r.get("trade_name", String.class),
            r.get("review", String.class), instant(r.get("extracted_at", OffsetDateTime.class)));
    }

    private static StageRow stageRow(Readable r) {
        return new StageRow(r.get("stage", String.class), r.get("status", String.class), r.get("note", String.class));
    }

    private static ReviewDecision decision(Readable r) {
        return new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
            r.get("reviewer_role", String.class), instant(r.get("decided_at", OffsetDateTime.class)));
    }

    @Override public Mono<Map<String, List<ReviewDecision>>> batchDecisions(String batchId) {
        return db.sql("""
                SELECT concept_id, id, decision, reviewer_role, decided_at FROM ops.review_decision
                WHERE batch_id = :b ORDER BY decided_at, id""")
            .bind("b", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), decision(r)))
            .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }

    // ---- problem filters (§7.9.4)

    /** A JSON array at {@code path} of a stage's evidence, or [] when it is missing or not an array (never an SQL error). */
    private static String array(String path) {
        return "CASE WHEN jsonb_typeof(s.evidence -> '" + path + "') = 'array' THEN s.evidence -> '" + path + "' ELSE '[]'::jsonb END";
    }

    private static final String SAME_ITEM = "s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id";

    /**
     * The WHERE clause of a filter, over {@code bi} (ops.batch_item). Only these fixed fragments are ever formatted into the
     * SQL; the stage and batch values are bound. A key that is missing or JSON null reads as SQL NULL through {@code ->>}.
     */
    static String predicate(String filter, boolean stage) {
        return switch (filter) {
            case "strength_missing" -> "EXISTS (SELECT 1 FROM ops.stage_result s CROSS JOIN LATERAL jsonb_array_elements(" + array("parsed") +
                ") p WHERE " + SAME_ITEM + " AND s.stage = 'clinical' AND p ->> 'strength_value' IS NULL)";
            case "parse_partial" -> "EXISTS (SELECT 1 FROM curated.brand_product bp WHERE bp.concept_id = bi.concept_id AND bp.parse_status = 'partial')";
            case "route_assumed" -> "EXISTS (SELECT 1 FROM ops.stage_result s WHERE " + SAME_ITEM +
                " AND s.stage = 'ddinter' AND s.evidence -> 'route_assumed' = 'true'::jsonb)";
            // coverage 'none' only: a substance with no curated.interaction_coverage row is not_run and never matches (D33)
            case "no_ddinter_data" -> "EXISTS (SELECT 1 FROM curated.brand_product_ingredient bpi " +
                "JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code " +
                "JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id " +
                "WHERE bpi.concept_id = bi.concept_id AND ic.coverage = 'none')";
            // Two uncorrelated IN lists, each run once as a hashed subplan: an OR of two correlated EXISTS is a nested loop
            // per item (§7.9.5 scale test). The first cause is a DGDA XM code that no substance carries.
            case "unaligned" -> "(bi.concept_id IN (SELECT bpi.concept_id FROM curated.brand_product_ingredient bpi " +
                "WHERE NOT EXISTS (SELECT 1 FROM curated.substance_code xm WHERE xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code)) " +
                "OR (bi.batch_id, bi.concept_id) IN (SELECT s.batch_id, s.concept_id FROM ops.stage_result s CROSS JOIN LATERAL " +
                "jsonb_array_elements(" + array("aligned") + ") a WHERE s.stage = 'clinical' AND a ->> 'bds_id' IS NULL))";
            case "stage_warn" -> "EXISTS (SELECT 1 FROM ops.stage_result s WHERE " + SAME_ITEM + " AND s.status = 'warn'" +
                (stage ? " AND s.stage = :stage)" : ")");
            case "stage_fail" -> "EXISTS (SELECT 1 FROM ops.stage_result s WHERE " + SAME_ITEM + " AND s.status = 'fail')";
            default -> throw new IllegalArgumentException("unknown filter");
        };
    }

    private static String where(Filter f) {
        return ReviewSql.CURRENT_ITEM + (f.batch() == null ? "" : " AND bi.batch_id = :batch") + " AND " + predicate(f.filter(), f.stage() != null);
    }

    private static DatabaseClient.GenericExecuteSpec bind(DatabaseClient.GenericExecuteSpec spec, Filter f) {
        if (f.batch() != null) spec = spec.bind("batch", f.batch());
        if (f.stage() != null) spec = spec.bind("stage", f.stage());
        return spec;
    }

    /** The page's keys first (LIMIT keeps the subquery apart), then each one's trade name and four stage statuses by primary key. */
    @Override public Mono<List<Item>> records(Filter f, int offset, int limit) {
        String sql = """
            SELECT page.batch_id, page.concept_id, coalesce(bp.trade_name, page.concept_id) AS trade_name, page.review, page.extracted_at,
                   (SELECT s.status FROM ops.stage_result s WHERE s.batch_id = page.batch_id AND s.concept_id = page.concept_id AND s.stage = 'dgda') AS dgda,
                   (SELECT s.status FROM ops.stage_result s WHERE s.batch_id = page.batch_id AND s.concept_id = page.concept_id AND s.stage = 'substances') AS substances,
                   (SELECT s.status FROM ops.stage_result s WHERE s.batch_id = page.batch_id AND s.concept_id = page.concept_id AND s.stage = 'clinical') AS clinical,
                   (SELECT s.status FROM ops.stage_result s WHERE s.batch_id = page.batch_id AND s.concept_id = page.concept_id AND s.stage = 'ddinter') AS ddinter
            FROM (SELECT bi.batch_id, bi.concept_id, bi.review, bi.extracted_at FROM ops.batch_item bi WHERE %s
                  ORDER BY bi.batch_id COLLATE "C", bi.concept_id COLLATE "C" LIMIT :limit OFFSET :offset) page
            LEFT JOIN curated.brand_product bp ON bp.concept_id = page.concept_id
            ORDER BY page.batch_id COLLATE "C", page.concept_id COLLATE "C\"""".formatted(where(f));
        return bind(db.sql(sql), f).bind("limit", limit).bind("offset", offset)
            .map(r -> {
                List<StageRow> stages = new ArrayList<>(4);
                for (String stage : List.of("dgda", "substances", "clinical", "ddinter")) {
                    String status = r.get(stage, String.class);
                    if (status != null) stages.add(new StageRow(stage, status, null));
                }
                ItemRow i = itemRow(r);
                return new Item(i.batchId(), i.conceptId(), i.tradeName(), i.review(), i.extractedAt(), List.copyOf(stages));
            })
            .all().collectList();
    }

    @Override public Mono<Long> recordCount(Filter f) {
        return bind(db.sql("SELECT count(*) AS n FROM ops.batch_item bi WHERE " + where(f)), f)
            .map(r -> r.get("n", Long.class)).one();
    }

    @Override public Mono<Map<Key, List<ReviewDecision>>> decisions(List<Key> keys) {
        if (keys.isEmpty()) return Mono.just(Map.of());
        String[] batches = keys.stream().map(Key::batchId).toArray(String[]::new);
        String[] concepts = keys.stream().map(Key::conceptId).toArray(String[]::new);
        return db.sql("""
                SELECT d.batch_id, d.concept_id, d.id, d.decision, d.reviewer_role, d.decided_at
                FROM ops.review_decision d
                JOIN unnest(CAST(:b AS text[]), CAST(:c AS text[])) AS k(batch_id, concept_id)
                  ON d.batch_id = k.batch_id AND d.concept_id = k.concept_id
                ORDER BY d.decided_at, d.id""")
            .bind("b", batches).bind("c", concepts)
            .map(r -> Map.entry(new Key(r.get("batch_id", String.class), r.get("concept_id", String.class)), decision(r)))
            .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
    }
}
