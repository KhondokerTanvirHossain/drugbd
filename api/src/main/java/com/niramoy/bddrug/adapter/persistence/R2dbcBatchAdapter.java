package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.domain.BatchReport.ItemNote;
import com.niramoy.bddrug.domain.BatchReport.ReviewCounts;
import com.niramoy.bddrug.domain.BatchReport.Run;
import com.niramoy.bddrug.domain.BatchReport.StageCounts;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

@Component
public class R2dbcBatchAdapter implements BatchQueryPort {
    private static final TypeReference<Map<String, StageCounts>> COUNTS = new TypeReference<>() {};
    private static final int RUNS_SHOWN = 5;

    private final DatabaseClient db;
    private final ClinicalDrugReader clinicalDrugs;
    private final ObjectMapper json;
    public R2dbcBatchAdapter(DatabaseClient db, ClinicalDrugReader clinicalDrugs, ObjectMapper json) {
        this.db = db;
        this.clinicalDrugs = clinicalDrugs;
        this.json = json;
    }

    private record ItemRow(String conceptId, String review, String note, String sourceJson,
                           R2dbcProductAdapter.Row product, Instant extractedAt) {}

    private static Batch toBatch(Readable r) {
        return new Batch(r.get("batch_id", String.class), r.get("status", String.class),
            r.get("run_at", OffsetDateTime.class).toInstant(), r.get("item_count", Integer.class), List.of());
    }

    @Override public Flux<Batch> list() {
        return db.sql("SELECT batch_id, status, run_at, item_count FROM ops.batch ORDER BY run_at DESC")
            .map(R2dbcBatchAdapter::toBatch).all();
    }

    @Override public Mono<Batch> find(String batchId) {
        return db.sql("SELECT batch_id, status, run_at, item_count FROM ops.batch WHERE batch_id = :id")
            .bind("id", batchId).map(R2dbcBatchAdapter::toBatch).one()
            .flatMap(batch -> items(batchId).map(batch::withItems));
    }

    private Mono<List<BatchItem>> items(String batchId) {
        Mono<HashMap<String, List<Ingredient>>> ingredients = db.sql("""
                SELECT i.concept_id, i.xm_code, i.ingredient_name FROM curated.brand_product_ingredient i
                JOIN ops.batch_item bi ON bi.concept_id = i.concept_id WHERE bi.batch_id = :id ORDER BY i.xm_code""")
            .bind("id", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class),
                                new Ingredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class))))
            .all()
            .collect(() -> new HashMap<String, List<Ingredient>>(),
                     (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<HashMap<String, List<StageResult>>> stages = db.sql("""
                SELECT concept_id, stage, status, note, evidence::text AS evidence FROM ops.stage_result
                WHERE batch_id = :id
                ORDER BY concept_id, array_position(ARRAY['dgda','substances','clinical','ddinter'], stage)""")
            .bind("id", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class), new StageResult(r.get("stage", String.class),
                r.get("status", String.class), r.get("note", String.class), r.get("evidence", String.class))))
            .all()
            .collect(() -> new HashMap<String, List<StageResult>>(),
                     (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<List<ItemRow>> rows = db.sql("""
                SELECT bi.concept_id AS item_id, bi.review, bi.note AS review_note, rc.payload::text AS source_json,
                       bi.extracted_at,
                       bp.concept_id, bp.dar_number, bp.trade_name, bp.company, bp.dosage_form,
                       bp.generic_content_raw, bp.quality_flag, bp.parse_status, bp.parse_note, bp.bdc_id
                FROM ops.batch_item bi
                LEFT JOIN raw.ocl_concept rc ON rc.source = bi.source AND rc.concept_id = bi.concept_id
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                WHERE bi.batch_id = :id ORDER BY bi.concept_id""")
            .bind("id", batchId)
            .map(r -> new ItemRow(r.get("item_id", String.class), r.get("review", String.class),
                r.get("review_note", String.class), r.get("source_json", String.class),
                r.get("concept_id", String.class) == null ? null : R2dbcProductAdapter.rowWithReview(r, null),
                instant(r.get("extracted_at", OffsetDateTime.class))))
            .all().collectList();
        return Mono.zip(ingredients, stages, rows).flatMap(t -> {
            List<ItemRow> items = t.getT3();
            List<String> bdcIds = items.stream().filter(i -> i.product() != null).map(i -> i.product().bdcId()).toList();
            return clinicalDrugs.byIds(bdcIds).map(cds -> items.stream().map(i -> {
                Product p = i.product() == null ? null : i.product().product()
                    .withIngredients(t.getT1().getOrDefault(i.conceptId(), List.of()))
                    .withClinicalDrug(i.product().bdcId() == null ? null : cds.get(i.product().bdcId()));
                return new BatchItem(i.conceptId(), i.review(), i.note(), p, i.sourceJson(),
                    List.copyOf(t.getT2().getOrDefault(i.conceptId(), List.of())), i.extractedAt());
            }).toList());
        });
    }

    private static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }

    private record StatusCount(String stage, String status, int count) {}

    @Override public Mono<BatchReport> report(String batchId) {
        Mono<Map<String, StageCounts>> counts = db.sql(
                "SELECT stage, status, count(*)::int AS n FROM ops.stage_result WHERE batch_id = :id GROUP BY stage, status")
            .bind("id", batchId)
            .map(r -> new StatusCount(r.get("stage", String.class), r.get("status", String.class), r.get("n", Integer.class)))
            .all().collectList()
            .map(R2dbcBatchAdapter::stageCounts);
        Mono<ReviewCounts> review = db.sql("SELECT bi.review, count(*)::int AS n FROM ops.batch_item bi " +
                                           "WHERE bi.batch_id = :id AND " + ReviewSql.CURRENT_ITEM + " GROUP BY bi.review")
            .bind("id", batchId)
            .map(r -> Map.entry(r.get("review", String.class), r.get("n", Integer.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue)
            .map(m -> new ReviewCounts(m.getOrDefault("pending", 0), m.getOrDefault("ok", 0), m.getOrDefault("issue", 0)));
        Mono<Map<String, List<ItemNote>>> notes = db.sql("""
                SELECT concept_id, stage, status, note FROM ops.stage_result
                WHERE batch_id = :id AND status IN ('warn', 'fail')
                ORDER BY concept_id, coalesce(array_position(ARRAY['dgda','substances','clinical','ddinter'], stage), 5), stage""")
            .bind("id", batchId)
            .map(r -> Map.entry(r.get("status", String.class),
                new ItemNote(r.get("concept_id", String.class), r.get("stage", String.class), r.get("note", String.class))))
            .all()
            .collect(() -> new HashMap<String, List<ItemNote>>(),
                     (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<List<Run>> runs = db.sql("""
                SELECT id, run_at, stages, counts::text AS counts, concept_ids FROM ops.batch_run
                WHERE batch_id = :id ORDER BY run_at DESC, id DESC LIMIT :n""")
            .bind("id", batchId).bind("n", RUNS_SHOWN)
            .map(r -> new Run(r.get("id", Long.class), r.get("run_at", OffsetDateTime.class).toInstant(),
                R2dbcSubstanceAdapter.list(r, "stages"), parseCounts(r.get("counts", String.class)),
                R2dbcSubstanceAdapter.list(r, "concept_ids")))
            .all().collectList();
        Mono<List<Map<String, StageCounts>>> lastFullRuns = db.sql("""
                SELECT counts::text AS counts FROM ops.batch_run
                WHERE batch_id = :id AND cardinality(concept_ids) = 0 ORDER BY run_at DESC, id DESC LIMIT 2""")
            .bind("id", batchId)
            .map(r -> parseCounts(r.get("counts", String.class)))
            .all().collectList();
        return db.sql("SELECT batch_id FROM ops.batch WHERE batch_id = :id").bind("id", batchId)
            .map(r -> r.get("batch_id", String.class)).one()
            .flatMap(id -> Mono.zip(counts, review, notes, runs, lastFullRuns).map(t -> new BatchReport(id, t.getT1(), t.getT2(),
                List.copyOf(t.getT3().getOrDefault("warn", List.of())), List.copyOf(t.getT3().getOrDefault("fail", List.of())),
                t.getT4(), t.getT5().size() < 2 ? null : BatchReport.delta(t.getT5().get(0), t.getT5().get(1)))));
    }

    private static Map<String, StageCounts> stageCounts(List<StatusCount> rows) {
        Map<String, int[]> acc = new HashMap<>();
        for (StatusCount c : rows) {
            int[] a = acc.computeIfAbsent(c.stage(), k -> new int[3]);
            switch (c.status()) {
                case "ok" -> a[0] += c.count();
                case "warn" -> a[1] += c.count();
                case "fail" -> a[2] += c.count();
                default -> { }
            }
        }
        Map<String, StageCounts> out = new HashMap<>();
        acc.forEach((stage, a) -> out.put(stage, new StageCounts(a[0], a[1], a[2])));
        return BatchReport.ordered(out);
    }

    /** batch_run.counts is {stage: {ok, warn, fail}} as written by the pipeline; a missing number counts as 0. */
    private Map<String, StageCounts> parseCounts(String text) {
        try {
            Map<String, StageCounts> m = json.readValue(text, COUNTS);
            return BatchReport.ordered(m == null ? Map.of() : m);
        } catch (Exception e) {
            throw new IllegalStateException("ops.batch_run.counts is not {stage: {ok, warn, fail}}", e);
        }
    }
}
