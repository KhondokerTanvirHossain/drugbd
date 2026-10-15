package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.StatsQueryPort;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;

/**
 * GET /v1/stats reads. Decisions are read without notes or emails. Public status comes from ReviewSql.LATEST_PUBLIC,
 * computed once per query, never as a subquery per row. Scaling note: decisions() reads every decision row; before
 * batches grow past a few thousand items, P2 decides on a per-batch filter or paging (StatsScaleIntegrationTest pins
 * 5,000 items under the §10.6 300 ms).
 */
@Component
public class R2dbcStatsAdapter implements StatsQueryPort {
    private final DatabaseClient db;
    public R2dbcStatsAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<Totals> totals() {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                      "SELECT (SELECT count(*) FROM curated.brand_product) AS products, " +
                      "(SELECT count(*) FROM curated.substance) AS substances, " +
                      "(SELECT count(*) FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id WHERE l.pub) AS approved, " +
                      "(SELECT count(DISTINCT bi.concept_id) FROM ops.batch_item bi JOIN ops.batch b ON b.batch_id = bi.batch_id " +
                      " LEFT JOIN latest l ON l.concept_id = bi.concept_id " +
                      " WHERE b.status = 'in_review' AND " + ReviewSql.CURRENT_ITEM +
                      " AND NOT coalesce(l.pub, false)) AS in_review")
            .map(r -> new Totals(r.get("products", Long.class), r.get("substances", Long.class), r.get("approved", Long.class),
                r.get("in_review", Long.class)))
            .one();
    }

    @Override public Flux<BatchRow> batches() {
        return db.sql("SELECT batch_id, status FROM ops.batch ORDER BY run_at DESC, batch_id COLLATE \"C\"")
            .map(r -> new BatchRow(r.get("batch_id", String.class), r.get("status", String.class)))
            .all();
    }

    @Override public Flux<ItemRow> items() {
        // A blank DGDA trade name would make the web refuse the whole body (parseStats), so it falls back to the id.
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                      "SELECT bi.batch_id, bi.concept_id, coalesce(nullif(btrim(bp.trade_name), ''), bi.concept_id) AS trade_name, " +
                      "bi.review, bi.extracted_at, (bi.note IS NOT DISTINCT FROM '" + ReviewSql.REMOVED_NOTE + "') AS removed, " +
                      "coalesce(l.pub, false) AS product_public " +
                      "FROM ops.batch_item bi LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id " +
                      "LEFT JOIN latest l ON l.concept_id = bi.concept_id " +
                      "ORDER BY bi.batch_id COLLATE \"C\", bi.concept_id COLLATE \"C\"")
            .map(r -> {
                OffsetDateTime at = r.get("extracted_at", OffsetDateTime.class);
                return new ItemRow(r.get("batch_id", String.class), r.get("concept_id", String.class), r.get("trade_name", String.class),
                    r.get("review", String.class), at == null ? null : at.toInstant(),
                    Boolean.TRUE.equals(r.get("removed", Boolean.class)), Boolean.TRUE.equals(r.get("product_public", Boolean.class)));
            })
            .all();
    }

    @Override public Flux<DecisionRow> decisions() {
        return db.sql("SELECT batch_id, concept_id, id, decision, reviewer_role, decided_at FROM ops.review_decision ORDER BY decided_at, id")
            .map(r -> new DecisionRow(r.get("batch_id", String.class), r.get("concept_id", String.class),
                new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
                    r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant())))
            .all();
    }
}
