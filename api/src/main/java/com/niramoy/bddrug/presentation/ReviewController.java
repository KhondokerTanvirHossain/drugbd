package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ReviewService;
import com.niramoy.bddrug.application.port.ReviewPort.Outcome;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.List;

/** Review decisions per batch record. Writing and reading the history both need the internal token. */
@RestController
@RequestMapping("/v1/batches/{batchId}/items/{conceptId}/decisions")
public class ReviewController {
    private final ReviewService service;
    private final InternalAuth auth;
    public ReviewController(ReviewService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    /** For internal-token callers (reviewers) only. */
    public record ReviewerDecision(String decision, String note, String role, Instant decidedAt, String reviewerEmail) {}

    /**
     * The decision body. {@code extractedAt} and {@code expectedLastDecisionId} are JsonNodes so a left-out key (null)
     * can be told apart from an explicit JSON null (NullNode); the service requires both keys and validates the values.
     */
    public record DecisionBody(String decision, String note, String reviewerEmail, String reviewerRole,
                               JsonNode extractedAt, JsonNode expectedLastDecisionId, String requestId) {
        ReviewService.Request toRequest() {
            boolean stampSent = extractedAt != null;
            String stamp = !stampSent || extractedAt.isNull() ? null
                : extractedAt.isTextual() ? extractedAt.textValue() : extractedAt.toString();
            boolean idSent = expectedLastDecisionId != null;
            String id = !idSent || expectedLastDecisionId.isNull() ? null
                : expectedLastDecisionId.isIntegralNumber() ? expectedLastDecisionId.asText()
                : "invalid:" + expectedLastDecisionId.getNodeType();
            return new ReviewService.Request(decision, note, reviewerEmail, reviewerRole, stampSent, stamp, idSent, id, requestId);
        }
    }

    /** 201 for a new decision, 200 for a replay of a known requestId. The token is checked before the body is read. */
    @PostMapping
    public Mono<ResponseEntity<ApiResponse<Outcome>>> decide(@PathVariable String batchId, @PathVariable String conceptId,
                                                             @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                                             @RequestBody Mono<DecisionBody> body) {
        auth.require(token);
        return body.flatMap(b -> service.decide(batchId, conceptId, b.toRequest()))
            .map(o -> ResponseEntity.status(o.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(ApiResponse.ok(o)));
    }

    /** Decision notes and history are never served without the token (A2); with it, emails are included. */
    @GetMapping
    public Mono<ApiResponse<List<ReviewerDecision>>> history(@PathVariable String batchId, @PathVariable String conceptId,
                                                             @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.history(batchId, conceptId, true)
            .map(list -> list.stream().map(ReviewController::reviewerView).toList())
            .map(ApiResponse::ok);
    }

    private static ReviewerDecision reviewerView(ReviewDecision d) {
        return new ReviewerDecision(d.decision(), d.note(), d.reviewerRole(), d.decidedAt(), d.reviewerEmail());
    }
}
