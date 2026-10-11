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
    public R2dbcBatchAdapter(DatabaseClient db) { this.db = db; }

    private static Batch toBatch(Readable r) {
        return new Batch(r.get("batch_id", String.class), r.get("status", String.class),
            r.get("run_at", OffsetDateTime.class).toInstant(), r.get("item_count", Integer.class), List.of());
    }

    @Override public Flux<Batch> list() {
        return db.sql("SELECT batch_id, status, run_at, item_count FROM ops.batch ORDER BY run_at DESC")
            .map(R2dbcBatchAdapter::toBatch).all();
    }

    @Override public Mono<Batch> find(String batchId) {
        Mono<Batch> batch = db.sql("SELECT batch_id, status, run_at, item_count FROM ops.batch WHERE batch_id = :id")
            .bind("id", batchId).map(R2dbcBatchAdapter::toBatch).one();
        Mono<HashMap<String, List<Ingredient>>> ingredients = db.sql("""
                SELECT i.concept_id, i.xm_code, i.ingredient_name FROM curated.brand_product_ingredient i
                JOIN ops.batch_item bi ON bi.concept_id = i.concept_id WHERE bi.batch_id = :id ORDER BY i.xm_code""")
            .bind("id", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class),
                                new Ingredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class))))
            .all()
            .collect(() -> new HashMap<String, List<Ingredient>>(),
                     (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<List<BatchItem>> items = ingredients.flatMap(ing -> db.sql("""
                SELECT bi.concept_id, bi.review, bi.note, rc.payload::text AS source_json,
                       bp.concept_id AS p_id, bp.dar_number, bp.trade_name, bp.company, bp.dosage_form,
                       bp.generic_content_raw, bp.quality_flag
                FROM ops.batch_item bi
                LEFT JOIN raw.ocl_concept rc ON rc.source = bi.source AND rc.concept_id = bi.concept_id
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                WHERE bi.batch_id = :id ORDER BY bi.concept_id""")
            .bind("id", batchId)
            .map(r -> {
                String pid = r.get("p_id", String.class);
                Product p = pid == null ? null : new Product(pid, r.get("dar_number", String.class),
                    r.get("trade_name", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
                    r.get("generic_content_raw", String.class), r.get("quality_flag", String.class),
                    ing.getOrDefault(pid, List.of()));
                return new BatchItem(r.get("concept_id", String.class), r.get("review", String.class),
                    r.get("note", String.class), p, r.get("source_json", String.class));
            }).all().collectList());
        return batch.zipWith(items, Batch::withItems);
    }
}
