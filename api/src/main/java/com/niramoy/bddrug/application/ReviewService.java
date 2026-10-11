package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ReviewPort;
import com.niramoy.bddrug.application.port.ReviewPort.NewDecision;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/** Review decisions: validated here, appended and applied by the port. */
@Service
public class ReviewService {
    public static final Set<String> DECISIONS = Set.of("ok", "issue"), ROLES = Set.of("pharmacist", "engineer");
    public static final int ISSUE_NOTE_MIN = 5, NOTE_MAX = 1000;

    private final ReviewPort port;
    public ReviewService(ReviewPort port) { this.port = port; }

    public record Request(String decision, String note, String reviewerEmail, String reviewerRole, Instant extractedAt) {}

    public Mono<Outcome> decide(String batchId, String conceptId, Request r) {
        return Mono.fromCallable(() -> validate(r)).flatMap(d -> port.decide(batchId, conceptId, d));
    }

    static NewDecision validate(Request r) {
        String decision = Validate.oneOf(r.decision(), DECISIONS, "decision");
        String note = Validate.text(r.note(), "issue".equals(decision) ? ISSUE_NOTE_MIN : 0, NOTE_MAX, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        String role = Validate.oneOf(r.reviewerRole(), ROLES, "reviewerRole");
        return new NewDecision(decision, note, email, role, r.extractedAt());
    }

    public Mono<List<ReviewDecision>> history(String batchId, String conceptId, boolean withEmails) {
        return port.history(batchId, conceptId, withEmails);
    }
}
