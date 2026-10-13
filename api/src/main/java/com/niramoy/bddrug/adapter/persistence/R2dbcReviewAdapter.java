package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.DecisionGuard;
import com.niramoy.bddrug.domain.ReviewDecision;
import io.r2dbc.spi.Readable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Review decisions. {@code ops.review_decision} and {@code ops.audit_event} are append-only: rows are inserted, never
 * updated or deleted. Lock order is batch_item, then batch, the same as the pipeline's {@code reopen_review}, so the two
 * serialize instead of deadlocking; two sends of one requestId serialize on the item lock, so step 1 answers the second.
 */
@Component
public class R2dbcReviewAdapter implements ReviewPort {
    static final String TARGET_TYPE = "batch_item";

    private final DatabaseClient db;
    private final TransactionalOperator tx;
    public R2dbcReviewAdapter(DatabaseClient db, TransactionalOperator tx) {
        this.db = db;
        this.tx = tx;
    }

    private record LockedItem(Instant extractedAt, String review, String note) {}
    private record CurrentItem(Instant extractedAt, String review, String batchStatus) {}
    private record AuditHit(String targetId, String outcome) {}

    /** The audit target of a batch item (spec §5.15). */
    static String target(String batchId, String conceptId) { return batchId + "/" + conceptId; }

    @Override public Mono<Outcome> decide(String batchId, String conceptId, NewDecision d) {
        return tx.transactional(lockItem(batchId, conceptId)
                .flatMap(item -> replay(batchId, conceptId, d)
                    .switchIfEmpty(Mono.defer(() -> fresh(batchId, conceptId, d, item)))))
            // backstop (§7.2): if the unique request index is ever hit, answer with step 1 in a fresh transaction
            .onErrorResume(DuplicateKeyException.class, e -> tx.transactional(
                replay(batchId, conceptId, d).switchIfEmpty(Mono.error(e))));
    }

    private Mono<LockedItem> lockItem(String batchId, String conceptId) {
        return db.sql("SELECT extracted_at, review, note FROM ops.batch_item WHERE batch_id = :b AND concept_id = :c FOR UPDATE")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new LockedItem(instant(r.get("extracted_at", OffsetDateTime.class)), r.get("review", String.class),
                                     r.get("note", String.class)))
            .one()
            .switchIfEmpty(Mono.error(() -> new NotFoundException("conceptId", "Batch item not found")));
    }

    /** Step 1: empty when the requestId is new. */
    private Mono<Outcome> replay(String batchId, String conceptId, NewDecision d) {
        return db.sql("SELECT target_id, outcome FROM ops.audit_event WHERE event = 'decision' AND request_id = :r")
            .bind("r", d.requestId())
            .map(r -> new AuditHit(r.get("target_id", String.class), r.get("outcome", String.class)))
            .one()
            .flatMap(hit -> target(batchId, conceptId).equals(hit.targetId()) && d.decision().equals(hit.outcome())
                ? current(batchId, conceptId, true)
                : Mono.error(new InvalidQueryException("requestId",
                    "requestId was already used for another decision; send a new requestId for a new decision")));
    }

    /** Steps 2 to 8, then the writes. */
    private Mono<Outcome> fresh(String batchId, String conceptId, NewDecision d, LockedItem item) {
        return decisions(batchId, conceptId, false).flatMap(list -> stageStatuses(batchId, conceptId).flatMap(stages -> {
            var state = new DecisionGuard.Item(item.extractedAt(), lastDecisionId(list), item.review(), item.note(), stages,
                ApprovalRule.displayStatus(list, item.extractedAt(), item.review()));
            var attempt = new DecisionGuard.Attempt(d.decision(), d.reviewerRole(), d.expectedExtractedAt(),
                d.expectedLastDecisionId());
            return DecisionGuard.check(state, attempt)
                .<Mono<Outcome>>map(no -> Mono.error(new ConflictException(no.field(), no.message())))
                .orElseGet(() -> lockBatch(batchId)
                    .then(insert(batchId, conceptId, d))
                    .then(audit(batchId, conceptId, d))
                    .then(recomputeItem(batchId, conceptId, item.extractedAt()))
                    .then(recomputeBatch(batchId))
                    .then(current(batchId, conceptId, false)));
        }));
    }

    private Mono<Map<String, String>> stageStatuses(String batchId, String conceptId) {
        return db.sql("SELECT stage, status FROM ops.stage_result WHERE batch_id = :b AND concept_id = :c")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> Map.entry(r.get("stage", String.class), r.get("status", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    private Mono<Outcome> current(String batchId, String conceptId, boolean replayed) {
        return db.sql("""
                SELECT bi.extracted_at, bi.review, b.status AS batch_status
                FROM ops.batch_item bi JOIN ops.batch b ON b.batch_id = bi.batch_id
                WHERE bi.batch_id = :b AND bi.concept_id = :c""")
            .bind("b", batchId).bind("c", conceptId)
            .map(r -> new CurrentItem(instant(r.get("extracted_at", OffsetDateTime.class)), r.get("review", String.class),
                                      r.get("batch_status", String.class)))
            .one()
            .flatMap(it -> decisions(batchId, conceptId, false).map(list -> new Outcome(batchId, conceptId, it.review(),
                ApprovalRule.displayStatus(list, it.extractedAt(), it.review()), it.batchStatus(),
                new Version(it.extractedAt(), lastDecisionId(list)), replayed)));
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

    /** The {@code decision} audit row, in the decision's own transaction (§5.15). */
    private Mono<Void> audit(String batchId, String conceptId, NewDecision d) {
        return db.sql("""
                INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                VALUES ('decision', :email, :role, :type, :target, :outcome, :rid)""")
            .bind("email", d.reviewerEmail()).bind("role", d.reviewerRole()).bind("type", TARGET_TYPE)
            .bind("target", target(batchId, conceptId)).bind("outcome", d.decision()).bind("rid", d.requestId())
            .fetch().rowsUpdated().then();
    }

    @Override public Mono<Void> recordRejection(Rejection r) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                VALUES ('decision_rejected', :email, :role, :type, :target, :outcome, :rid)""")
            .bind("type", TARGET_TYPE).bind("target", target(r.batchId(), r.conceptId())).bind("outcome", r.outcome());
        spec = r.actorEmail() == null ? spec.bindNull("email", String.class) : spec.bind("email", r.actorEmail());
        spec = r.actorRole() == null ? spec.bindNull("role", String.class) : spec.bind("role", r.actorRole());
        spec = r.requestId() == null ? spec.bindNull("rid", UUID.class) : spec.bind("rid", r.requestId());
        return tx.transactional(spec.fetch().rowsUpdated()).then();
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

    static Long lastDecisionId(List<ReviewDecision> list) {
        return list.stream().map(ReviewDecision::id).max(Long::compare).orElse(null);
    }

    private static Instant instant(OffsetDateTime t) { return t == null ? null : t.toInstant(); }

    private static ReviewDecision toDecision(Readable r, boolean withEmails) {
        return new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), r.get("note", String.class),
            withEmails ? r.get("reviewer_email", String.class) : null, r.get("reviewer_role", String.class),
            r.get("decided_at", OffsetDateTime.class).toInstant());
    }
}
