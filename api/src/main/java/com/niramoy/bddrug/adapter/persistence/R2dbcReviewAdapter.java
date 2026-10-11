package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Review decisions. {@code ops.review_decision} is append-only: rows are inserted, never updated or deleted.
 * Lock order is batch_item, then batch, the same as the pipeline's {@code reopen_review}, so the two
 * serialize instead of deadlocking; decisions on one batch serialize on the batch row, so the batch
 * status is always computed from committed item reviews.
 */
@Component
public class R2dbcReviewAdapter implements ReviewPort {
    private final DatabaseClient db;
    private final TransactionalOperator tx;
    public R2dbcReviewAdapter(DatabaseClient db, TransactionalOperator tx) {
        this.db = db;
        this.tx = tx;
    }

    @Override public Mono<Outcome> decide(String batchId, String conceptId, NewDecision d) {
        Mono<Outcome> work = db.sql("SELECT extracted_at FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c FOR UPDATE")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> Optional.ofNullable(r.get("extracted_at", OffsetDateTime.class)).map(OffsetDateTime::toInstant))
            .one()
            .switchIfEmpty(Mono.error(() -> new NotFoundException("conceptId", "Batch item not found")))
            .flatMap(extractedAt -> {
                if (d.expectedExtractedAt() != null && !Objects.equals(d.expectedExtractedAt(), extractedAt.orElse(null)))
                    return Mono.error(new ConflictException("extractedAt",
                        "This record was re-run after the page was loaded; reload it and review again"));
                return lockBatch(batchId)
                    .then(insert(batchId, conceptId, d))
                    .then(recomputeItem(batchId, conceptId, extractedAt.orElse(null)))
                    .then(recomputeBatch(batchId))
                    .flatMap(batchStatus -> itemReview(batchId, conceptId)
                        .map(review -> new Outcome(batchId, conceptId, review, batchStatus)));
            });
        return tx.transactional(work);
    }

    private Mono<Void> lockBatch(String batchId) {
        return db.sql("SELECT batch_id FROM ops.batch WHERE batch_id = :b FOR UPDATE").bind("b", batchId)
            .map(r -> 1).all().then();
    }

    private Mono<Void> insert(String batchId, String conceptId, NewDecision d) {
        return db.sql("""
                INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
                VALUES (:b, :c, :decision, :note, :email, :role)""")
            .bind("b", batchId).bind("c", conceptId).bind("decision", d.decision()).bind("note", d.note())
            .bind("email", d.reviewerEmail()).bind("role", d.reviewerRole())
            .fetch().rowsUpdated().then();
    }

    /** Applies the approval rule; with no decision since the latest run the pipeline's value stays. */
    private Mono<Void> recomputeItem(String batchId, String conceptId, Instant extractedAt) {
        return decisions(batchId, conceptId, false).flatMap(list -> ApprovalRule.review(list, extractedAt)
            .map(review -> db.sql("UPDATE ops.batch_item SET review = :r WHERE batch_id = :b AND concept_id = :c")
                .bind("r", review).bind("b", batchId).bind("c", conceptId).fetch().rowsUpdated().then())
            .orElse(Mono.empty()));
    }

    /** approved when every item still in the batch file is ok (and there is at least one); otherwise in_review. */
    private Mono<String> recomputeBatch(String batchId) {
        return db.sql("""
                UPDATE ops.batch b SET status = CASE
                  WHEN EXISTS (SELECT 1 FROM ops.batch_item bi WHERE bi.batch_id = b.batch_id AND %1$s)
                   AND NOT EXISTS (SELECT 1 FROM ops.batch_item bi
                                   WHERE bi.batch_id = b.batch_id AND %1$s AND bi.review <> 'ok')
                  THEN 'approved' ELSE 'in_review' END
                WHERE b.batch_id = :b
                RETURNING b.status""".formatted(ReviewSql.CURRENT_ITEM))
            .bind("b", batchId).map(r -> r.get("status", String.class)).one();
    }

    private Mono<String> itemReview(String batchId, String conceptId) {
        return db.sql("SELECT review FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId).map(r -> r.get("review", String.class)).one();
    }

    @Override public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return db.sql("SELECT EXISTS (SELECT 1 FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c) AS found")
            .bind("b", batchId).bind("c", conceptId).map(r -> r.get("found", Boolean.class)).one()
            .flatMap(found -> found ? decisions(batchId, conceptId, withEmails)
                : Mono.error(new NotFoundException("conceptId", "Batch item not found")));
    }

    /** Newest first. The email column is selected only when it is going to be returned. */
    private Mono<List<ReviewDecision>> decisions(String batchId, String conceptId, boolean withEmails) {
        return db.sql("SELECT id, decision, note, reviewer_role, decided_at" + (withEmails ? ", reviewer_email" : "") +
                      " FROM ops.review_decision WHERE batch_id = :b AND concept_id = :c ORDER BY decided_at DESC, id DESC")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> toDecision(r, withEmails)).all().collectList();
    }

    private static ReviewDecision toDecision(Readable r, boolean withEmails) {
        return new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), r.get("note", String.class),
            withEmails ? r.get("reviewer_email", String.class) : null, r.get("reviewer_role", String.class),
            r.get("decided_at", OffsetDateTime.class).toInstant());
    }
}
