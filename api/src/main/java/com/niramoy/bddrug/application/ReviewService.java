package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.application.port.ReviewPort.NewDecision;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;

/** Review decisions: validated here, appended and applied by the port. */
@Service
public class ReviewService {
    public static final Set<String> DECISIONS = Set.of("ok", "issue"), ROLES = Set.of("pharmacist", "engineer");
    public static final int ISSUE_NOTE_MIN = 5, NOTE_MAX = 1000;

    private final ReviewPort port;
    public ReviewService(ReviewPort port) { this.port = port; }

    /**
     * {@code extractedAt} is the item's run stamp as the reviewer's page showed it (ISO-8601), or null when the page
     * showed none; {@code extractedAtSent} is false when the field was left out. It is required: without it a decision
     * could approve a re-run nobody has seen (the stale-page race), so leaving it out fails closed.
     */
    public record Request(String decision, String note, String reviewerEmail, String reviewerRole,
                          boolean extractedAtSent, String extractedAt) {}

    public Mono<Outcome> decide(String batchId, String conceptId, Request r) {
        return Mono.fromCallable(() -> validate(r)).flatMap(d -> port.decide(batchId, conceptId, d));
    }

    static NewDecision validate(Request r) {
        String decision = Validate.oneOf(r.decision(), DECISIONS, "decision");
        String note = Validate.text(r.note(), "issue".equals(decision) ? ISSUE_NOTE_MIN : 0, NOTE_MAX, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        String role = Validate.oneOf(r.reviewerRole(), ROLES, "reviewerRole");
        Instant extractedAt = runStamp(r);
        return new NewDecision(decision, note, email, role, extractedAt);
    }

    private static Instant runStamp(Request r) {
        if (!r.extractedAtSent())
            throw new InvalidQueryException("extractedAt",
                "extractedAt is required: send the item's extractedAt as the page showed it (null when it has none)");
        if (r.extractedAt() == null) return null;
        try {
            return Instant.parse(r.extractedAt());
        } catch (DateTimeParseException e) {
            throw new InvalidQueryException("extractedAt", "extractedAt must be an ISO-8601 instant or null");
        }
    }

    public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return port.history(batchId, conceptId, withEmails);
    }
}
