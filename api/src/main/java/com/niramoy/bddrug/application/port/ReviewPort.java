package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Appends review decisions and keeps batch_item.review / batch.status in step with the approval rule. */
public interface ReviewPort {
    /**
     * Spec §7.2 steps 2–8, in one transaction after locking the item: {@code DecisionGuard} refusals as
     * ConflictException; otherwise append the decision, recompute the item's review and the batch status.
     * NotFoundException for an unknown batch item. {@code NewDecision.requestId} is validated and carried; this version
     * does not replay it yet (step 1).
     */
    Mono<Outcome> decide(String batchId, String conceptId, NewDecision decision);

    /** Newest first; emails are read only when {@code withEmails}. Errors with NotFoundException for an unknown item. */
    Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails);

    record NewDecision(String decision, String note, String reviewerEmail, String reviewerRole,
                       Instant expectedExtractedAt, Long expectedLastDecisionId, UUID requestId) {}
    /** The stale-detection token: the run stamp and the newest decision id (null when none). */
    record Version(Instant extractedAt, Long lastDecisionId) {}
    record Outcome(String batchId, String conceptId, String review, String displayStatus, String batchStatus,
                   Version version, boolean replayed) {}
}
