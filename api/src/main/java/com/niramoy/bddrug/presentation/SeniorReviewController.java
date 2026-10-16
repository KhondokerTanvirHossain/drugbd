package com.niramoy.bddrug.presentation;
import com.fasterxml.jackson.databind.JsonNode;
import com.niramoy.bddrug.application.SeniorReviewService;
import com.niramoy.bddrug.domain.SeniorViews;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/**
 * Senior review (spec §7.7): unreviewed data from every batch, so every endpoint needs the internal token. The web calls
 * these only for a senior session (§5.17). {@code X-Viewer-Email} marks the viewer's own pair decisions; never echoed.
 */
@RestController
@RequestMapping("/v1/review")
public class SeniorReviewController {
    protected final SeniorReviewService service;
    protected final InternalAuth auth;
    public SeniorReviewController(SeniorReviewService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping("/pairs")
    public Mono<ApiResponse<SeniorViews.PairsPage>> pairs(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestHeader(value = "X-Viewer-Email", required = false) String viewer,
            @RequestParam(required = false) String show, @RequestParam(required = false) String pairs,
            @RequestParam(required = false) String severity, @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.pairs(show, pairs, severity, page, size, viewer).map(ApiResponse::ok);
    }

    @GetMapping("/substances")
    public Mono<ApiResponse<SeniorViews.SubstancesPage>> substances(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestParam(required = false) String q, @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.substances(q, page, size).map(ApiResponse::ok);
    }

    @GetMapping("/substances/{bdsId}")
    public Mono<ApiResponse<SeniorViews.SubstanceDetail>> substance(@PathVariable String bdsId,
            @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestHeader(value = "X-Viewer-Email", required = false) String viewer,
            @RequestParam(required = false) String pairs, @RequestParam(required = false) String severity,
            @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        auth.require(token);
        return service.substance(bdsId, pairs, severity, page, size, viewer).map(ApiResponse::ok);
    }

    /** The pair decision body; expectedLastPairReviewId is a JsonNode so a left-out key can be told from an explicit null. */
    public record PairDecisionBody(String decision, String note, String reviewerEmail, String reviewerRole, String expectedContentHash,
                                   JsonNode expectedLastPairReviewId, String requestId) {
        SeniorReviewService.PairRequest toRequest() {
            boolean sent = expectedLastPairReviewId != null;
            String id = !sent || expectedLastPairReviewId.isNull() ? null
                : expectedLastPairReviewId.isIntegralNumber() ? expectedLastPairReviewId.asText() : "invalid:" + expectedLastPairReviewId.getNodeType();
            return new SeniorReviewService.PairRequest(decision, note, reviewerEmail, reviewerRole, expectedContentHash, sent, id, requestId);
        }
    }

    /** 201 for a new pair decision, 200 for a replay of a known requestId. The token is checked before the body is read. */
    @PostMapping("/pairs/{ddinterA}/{ddinterB}/decisions")
    public Mono<ResponseEntity<ApiResponse<SeniorViews.PairOutcome>>> decide(@PathVariable String ddinterA, @PathVariable String ddinterB,
            @RequestHeader(value = InternalAuth.HEADER, required = false) String token, @RequestBody Mono<PairDecisionBody> body) {
        auth.require(token);
        return body.flatMap(b -> service.decide(ddinterA, ddinterB, b.toRequest()))
            .map(o -> ResponseEntity.status(o.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(ApiResponse.ok(o)));
    }
}
