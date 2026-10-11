package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.*;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;
import java.util.*;

@Component
public class R2dbcBatchAdapter implements BatchQueryPort {
    private final DatabaseClient db;
    private final ClinicalDrugReader clinicalDrugs;
    public R2dbcBatchAdapter(DatabaseClient db, ClinicalDrugReader clinicalDrugs) {
        this.db = db;
        this.clinicalDrugs = clinicalDrugs;
    }

    private record ItemRow(String conceptId, String review, String note, String sourceJson,
                           R2dbcProductAdapter.Row product) {}

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
                       bp.concept_id, bp.dar_number, bp.trade_name, bp.company, bp.dosage_form,
                       bp.generic_content_raw, bp.quality_flag, bp.parse_status, bp.parse_note, bp.bdc_id
                FROM ops.batch_item bi
                LEFT JOIN raw.ocl_concept rc ON rc.source = bi.source AND rc.concept_id = bi.concept_id
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                WHERE bi.batch_id = :id ORDER BY bi.concept_id""")
            .bind("id", batchId)
            .map(r -> new ItemRow(r.get("item_id", String.class), r.get("review", String.class),
                r.get("review_note", String.class), r.get("source_json", String.class),
                r.get("concept_id", String.class) == null ? null : R2dbcProductAdapter.toRow(r)))
            .all().collectList();
        return Mono.zip(ingredients, stages, rows).flatMap(t -> {
            List<ItemRow> items = t.getT3();
            List<String> bdcIds = items.stream().filter(i -> i.product() != null).map(i -> i.product().bdcId()).toList();
            return clinicalDrugs.byIds(bdcIds).map(cds -> items.stream().map(i -> {
                Product p = i.product() == null ? null : i.product().product()
                    .withIngredients(t.getT1().getOrDefault(i.conceptId(), List.of()))
                    .withClinicalDrug(i.product().bdcId() == null ? null : cds.get(i.product().bdcId()));
                return new BatchItem(i.conceptId(), i.review(), i.note(), p, i.sourceJson(),
                    List.copyOf(t.getT2().getOrDefault(i.conceptId(), List.of())));
            }).toList());
        });
    }
}
