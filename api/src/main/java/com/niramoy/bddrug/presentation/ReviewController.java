package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ReviewService;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;

/** Review decisions per batch record. Writing needs the internal token; the history is public without emails. */
@RestController
@RequestMapping("/v1/batches/{batchId}/items/{conceptId}/decisions")
public class ReviewController {
    private final ReviewService service;
    private final InternalAuth auth;
    public ReviewController(ReviewService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    /** What anyone may see of a decision: the role, never the reviewer's email. */
    public record PublicDecision(String decision, String note, String role, Instant decidedAt) {}
    /** For internal-token callers (reviewers) only. */
    public record ReviewerDecision(String decision, String note, String role, Instant decidedAt, String reviewerEmail) {}

    /**
     * The decision body. {@code extractedAt} is a JsonNode so a left-out field (null) can be told apart from an
     * explicit JSON null (NullNode); the service requires the field and validates its value.
     */
    public record DecisionBody(String decision, String note, String reviewerEmail, String reviewerRole, JsonNode extractedAt) {
        ReviewService.Request toRequest() {
            boolean sent = extractedAt != null;
            String stamp = !sent || extractedAt.isNull() ? null
                : extractedAt.isTextual() ? extractedAt.textValue() : extractedAt.toString();
            return new ReviewService.Request(decision, note, reviewerEmail, reviewerRole, sent, stamp);
        }
    }

    /** The token is checked before the body is read, so an unauthenticated request never gets as far as validation. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ApiResponse<Outcome>> decide(@PathVariable String batchId, @PathVariable String conceptId,
                                             @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                             @RequestBody Mono<DecisionBody> body) {
        auth.require(token);
        return body.flatMap(b -> service.decide(batchId, conceptId, b.toRequest())).map(ApiResponse::ok);
    }

    @GetMapping
    public Mono<ApiResponse<List<?>>> history(@PathVariable String batchId, @PathVariable String conceptId,
                                              @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        boolean reviewer = auth.present(token);
        return service.history(batchId, conceptId, reviewer)
            .map(list -> list.stream().<Object>map(d -> reviewer ? reviewerView(d) : publicView(d)).toList())
            .map(ApiResponse::ok);
    }

    private static PublicDecision publicView(ReviewDecision d) {
        return new PublicDecision(d.decision(), d.note(), d.reviewerRole(), d.decidedAt());
    }

    private static ReviewerDecision reviewerView(ReviewDecision d) {
        return new ReviewerDecision(d.decision(), d.note(), d.reviewerRole(), d.decidedAt(), d.reviewerEmail());
    }
}
