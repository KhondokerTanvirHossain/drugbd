package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.application.port.ReviewPort.NewDecision;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.application.port.ReviewPort.Rejection;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Review decisions: validated here, guarded, appended and applied by the port; every 400 and 409 is audited. */
@Service
public class ReviewService {
    private static final Logger log = LoggerFactory.getLogger(ReviewService.class);
    public static final Set<String> DECISIONS = Set.of("ok", "issue"), ROLES = Set.of("pharmacist", "engineer");
    public static final int ISSUE_NOTE_MIN = 5, NOTE_MAX = 1000;
    private static final Pattern UUID_TEXT =
        Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final ReviewPort port;
    public ReviewService(ReviewPort port) { this.port = port; }

    /**
     * {@code extractedAt} and {@code expectedLastDecisionId} are the version the reviewer's page showed (null when it
     * showed none); the {@code …Sent} flags are false when the key was left out. Both keys and {@code requestId} are
     * required: a decision must say which version it reviewed, and a retry must be recognisable (spec §7.2).
     * {@code expectedLastDecisionId} arrives as text: digits, null, or anything else (refused).
     */
    public record Request(String decision, String note, String reviewerEmail, String reviewerRole,
                          boolean extractedAtSent, String extractedAt,
                          boolean lastDecisionIdSent, String expectedLastDecisionId, String requestId) {}

    public Mono<Outcome> decide(String batchId, String conceptId, Request r) {
        return Mono.fromCallable(() -> validate(r))
            .flatMap(d -> port.decide(batchId, conceptId, d))
            .onErrorResume(e -> e instanceof InvalidQueryException || e instanceof ConflictException,
                e -> port.recordRejection(rejection(batchId, conceptId, r, e))
                    .onErrorResume(x -> {
                        log.error("decision_rejected audit row not written: {}", x.getClass().getName());
                        return Mono.empty();
                    })
                    .then(Mono.<Outcome>error(e)));
    }

    static NewDecision validate(Request r) {
        String decision = Validate.oneOf(r.decision(), DECISIONS, "decision");
        String note = Validate.text(r.note(), "issue".equals(decision) ? ISSUE_NOTE_MIN : 0, NOTE_MAX, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        String role = Validate.oneOf(r.reviewerRole(), ROLES, "reviewerRole");
        Instant extractedAt = runStamp(r);
        Long lastDecisionId = lastDecisionId(r);
        UUID requestId = requestId(r.requestId());
        return new NewDecision(decision, note, email, role, extractedAt, lastDecisionId, requestId);
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

    private static Long lastDecisionId(Request r) {
        if (!r.lastDecisionIdSent())
            throw new InvalidQueryException("expectedLastDecisionId",
                "expectedLastDecisionId is required: send the item's lastDecisionId as the page showed it (null when it has none)");
        if (r.expectedLastDecisionId() == null) return null;
        try {
            long id = Long.parseLong(r.expectedLastDecisionId());
            if (id < 1) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException e) {
            throw new InvalidQueryException("expectedLastDecisionId", "expectedLastDecisionId must be a positive integer or null");
        }
    }

    private static UUID requestId(String value) {
        UUID id = uuidOrNull(value);
        if (id == null) throw new InvalidQueryException("requestId", "requestId must be a UUID, reused unchanged on every retry");
        return id;
    }

    /** The UUID in canonical 8-4-4-4-12 form (either case), or null for anything else. */
    private static UUID uuidOrNull(String value) {
        return value != null && UUID_TEXT.matcher(value).matches() ? UUID.fromString(value) : null;
    }

    /** What a rejection may record: never free text; the email and role only when they were valid. */
    static Rejection rejection(String batchId, String conceptId, Request r, Throwable e) {
        String email = Validate.stripped(r.reviewerEmail());
        String role = r.reviewerRole() != null && ROLES.contains(r.reviewerRole()) ? r.reviewerRole() : null;
        return new Rejection(batchId, conceptId, Validate.isEmail(email) ? email : null, role,
            e instanceof ConflictException ? "CONFLICT" : "INVALID_QUERY", uuidOrNull(r.requestId()));
    }

    public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return port.history(batchId, conceptId, withEmails);
    }
}
