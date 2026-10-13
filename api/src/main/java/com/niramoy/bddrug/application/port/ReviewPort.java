package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Appends review decisions and keeps batch_item.review / batch.status in step with the approval rule. */
public interface ReviewPort {
    /**
     * Spec §7.2, in one transaction after locking the item: (1) a {@code requestId} already recorded for this item and
     * decision answers with the current Outcome, {@code replayed=true}, writing nothing (another target or decision:
     * InvalidQueryException on {@code requestId}); (2–8) {@code DecisionGuard} refusals as ConflictException; otherwise
     * append the decision and its {@code decision} audit row, recompute the item's review and the batch status.
     * NotFoundException for an unknown batch item.
     */
    Mono<Outcome> decide(String batchId, String conceptId, NewDecision decision);

    /** One {@code decision_rejected} audit row, in its own transaction (the decision's transaction rolled back). */
    Mono<Void> recordRejection(Rejection rejection);

    /** Newest first; emails are read only when {@code withEmails}. Errors with NotFoundException for an unknown item. */
    Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails);

    record NewDecision(String decision, String note, String reviewerEmail, String reviewerRole,
                       Instant expectedExtractedAt, Long expectedLastDecisionId, UUID requestId) {}
    /** The stale-detection token: the run stamp and the newest decision id (null when none). */
    record Version(Instant extractedAt, Long lastDecisionId) {}
    record Outcome(String batchId, String conceptId, String review, String displayStatus, String batchStatus,
                   Version version, boolean replayed) {}
    /** {@code outcome} is the error code (CONFLICT or INVALID_QUERY); email and role only when they were valid. */
    record Rejection(String batchId, String conceptId, String actorEmail, String actorRole, String outcome, UUID requestId) {}
}
