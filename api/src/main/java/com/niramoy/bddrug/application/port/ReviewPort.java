package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ReviewDecision;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;

/** Appends review decisions and keeps batch_item.review / batch.status in step with the approval rule. */
public interface ReviewPort {
    /**
     * In one transaction: append the decision, recompute the item's review and the batch status.
     * Errors with NotFoundException for an unknown batch item, and ConflictException when
     * {@code expectedExtractedAt} (null meaning "the page showed no run stamp") differs from the item's current
     * {@code extracted_at}: the record has been re-run since the page was loaded.
     */
    Mono<Outcome> decide(String batchId, String conceptId, NewDecision decision);

    /** Newest first; emails are read only when {@code withEmails}. Errors with NotFoundException for an unknown item. */
    Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails);

    record NewDecision(String decision, String note, String reviewerEmail, String reviewerRole, Instant expectedExtractedAt) {}
    record Outcome(String batchId, String conceptId, String review, String batchStatus) {}
}
